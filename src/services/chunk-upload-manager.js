import { apiClient } from '../api/config'
import connectivityService from './connectivity.js'

/**
 * Chunk Upload Manager
 * Handles real-time chunk-by-chunk video uploads with:
 * - Queue management
 * - Retry logic with exponential backoff
 * - Resume on connectivity restore
 * - Parallel uploads (2-3 concurrent)
 * - Progress tracking
 */
class ChunkUploadManager {
    constructor() {
        this.sessionId = null
        this.uploadQueue = [] // Unified queue: init first, then chunks in order
        this.uploadedChunks = new Set() // Set of successfully uploaded chunk indices
        this.failedChunks = new Map() // Map of chunkIndex -> retry count
        this.isProcessing = false // Processing flag (renamed from isUploading for clarity)
        // No maximum retry limit - will retry until successful
        this.retryDelays = [1000, 2000, 4000, 8000, 16000] // Exponential backoff delays (ms)
        // After exhausting delays, use max delay of 16 seconds for subsequent retries
        this.connectivityUnsubscribe = null
        this.metadata = null
        this.initQueued = false // Track if init has been queued
        this.recordingFinished = false // Track if recording has finished (no more chunks will be added)
        this.expectedTotalChunks = null // Expected total number of chunks

        // S3 multipart upload requires parts to be at least 5MB (except the last part)
        this.minChunkSize = 5 * 1024 * 1024 // 5MB in bytes
        this.chunkBuffer = [] // Buffer to accumulate chunks until they reach minChunkSize
        this.chunkBufferSize = 0 // Current size of buffer in bytes
        this.nextChunkIndex = 0 // Index for the next chunk to be created from buffer
    }

    /**
     * Queue init call (non-blocking)
     * @param {Object} metadata - Recording metadata (filename, timestamp, fps, etc.)
     */
    queueInit(metadata) {
        if (this.initQueued) {
            console.log('⚠️ Init already queued, skipping')
            return
        }

        this.metadata = metadata
        this.initQueued = true

        // Add init as first item in queue
        this.uploadQueue.unshift({
            type: 'init',
            metadata: metadata,
            timestamp: Date.now()
        })

        console.log('📋 Init queued (will process first)')

        // Start processing queue if not already running
        if (!this.isProcessing && connectivityService.isOnline) {
            this.processQueue()
        }
    }

    /**
     * Initialize upload session (internal method - called by queue processor)
     * @param {Object} metadata - Recording metadata (filename, timestamp, fps, etc.)
     * @returns {Promise<string>} Session ID
     */
    async initializeSession(metadata) {
        try {
            if (!connectivityService.isOnline) {
                console.log('📵 Offline - Session will be initialized when online')
                return null
            }

            const response = await apiClient.post('/videos/init', {
                filename: metadata.filename,
                timestamp: metadata.timestamp,
                fps: metadata.fps,
                codec: metadata.codec,
                bitrate: metadata.bitrate,
                resolution: metadata.resolution
            })

            if (response.data && response.data.sessionId) {
                this.sessionId = response.data.sessionId
                console.log('✅ Upload session initialized:', this.sessionId)
                return this.sessionId
            } else {
                throw new Error('No sessionId received from server')
            }
        } catch (error) {
            console.error('❌ Failed to initialize upload session:', error)
            throw error
        }
    }

    /**
     * Add data to buffer and create 5MB chunks when buffer reaches threshold
     * @param {Blob} chunkBlob - Video chunk blob from MediaRecorder
     * @param {number} originalChunkIndex - Original chunk index from MediaRecorder (for logging)
     */
    addToBuffer(chunkBlob, originalChunkIndex) {
        if (!chunkBlob || chunkBlob.size === 0) {
            return
        }

        // Add to buffer
        this.chunkBuffer.push(chunkBlob)
        this.chunkBufferSize += chunkBlob.size

        console.log(
            `📥 Added chunk ${originalChunkIndex} to buffer (${(chunkBlob.size / 1024).toFixed(2)} KB). Buffer size: ${(this.chunkBufferSize / 1024 / 1024).toFixed(2)} MB`
        )

        // Check if buffer has reached minimum chunk size (5MB)
        while (this.chunkBufferSize >= this.minChunkSize) {
            // Create a 5MB chunk from buffer
            const chunksToCombine = []
            let combinedSize = 0

            // Take chunks from buffer until we have at least 5MB
            while (combinedSize < this.minChunkSize && this.chunkBuffer.length > 0) {
                const chunk = this.chunkBuffer.shift()
                chunksToCombine.push(chunk)
                combinedSize += chunk.size
            }

            // Create combined blob
            const combinedBlob = new Blob(chunksToCombine, { type: 'video/webm' })
            this.chunkBufferSize -= combinedSize

            // Queue the combined chunk
            this.queueChunkDirectly(combinedBlob, this.nextChunkIndex++)

            console.log(
                `📦 Created 5MB chunk ${this.nextChunkIndex - 1} from buffer (${(combinedBlob.size / 1024 / 1024).toFixed(2)} MB). Remaining buffer: ${(this.chunkBufferSize / 1024 / 1024).toFixed(2)} MB`
            )
        }
    }

    /**
     * Flush remaining buffer as the last chunk (can be < 5MB)
     */
    flushBuffer() {
        if (this.chunkBuffer.length === 0 || this.chunkBufferSize === 0) {
            console.log('📭 Buffer is empty, nothing to flush')
            return
        }

        // Combine all remaining chunks
        const combinedBlob = new Blob(this.chunkBuffer, { type: 'video/webm' })
        const chunkIndex = this.nextChunkIndex++

        console.log(
            `📤 Flushing buffer as final chunk ${chunkIndex} (${(combinedBlob.size / 1024 / 1024).toFixed(2)} MB)`
        )

        // Queue the final chunk
        this.queueChunkDirectly(combinedBlob, chunkIndex)

        // Clear buffer
        this.chunkBuffer = []
        this.chunkBufferSize = 0
    }

    /**
     * Queue a chunk directly for upload (internal method - used after buffering)
     * @param {Blob} chunkBlob - Video chunk blob (should be >= 5MB except for last chunk)
     * @param {number} chunkIndex - Zero-based chunk index
     */
    queueChunkDirectly(chunkBlob, chunkIndex) {
        // Don't queue if already uploaded
        if (this.uploadedChunks.has(chunkIndex)) {
            console.log(`⏭️ Chunk ${chunkIndex} already uploaded, skipping`)
            return
        }

        // Check if chunk already in queue
        const alreadyQueued = this.uploadQueue.some((item) => item.type === 'chunk' && item.chunkIndex === chunkIndex)
        if (alreadyQueued) {
            console.log(`⏭️ Chunk ${chunkIndex} already in queue, skipping`)
            return
        }

        // Verify chunk size (warn if < 5MB and not the last chunk)
        if (chunkBlob.size < this.minChunkSize && !this.recordingFinished) {
            console.warn(
                `⚠️ Chunk ${chunkIndex} is ${(chunkBlob.size / 1024 / 1024).toFixed(2)} MB (less than 5MB). This may cause S3 upload issues.`
            )
        }

        // Add to queue (chunks are added after init)
        this.uploadQueue.push({
            type: 'chunk',
            blob: chunkBlob,
            chunkIndex,
            timestamp: Date.now()
        })

        // Sort queue: init first, then chunks by index
        this.uploadQueue.sort((a, b) => {
            if (a.type === 'init') return -1
            if (b.type === 'init') return 1
            return a.chunkIndex - b.chunkIndex
        })

        console.log(
            `📦 Chunk ${chunkIndex} queued for upload (${(chunkBlob.size / 1024 / 1024).toFixed(2)} MB). Queue size: ${this.uploadQueue.length}`
        )

        // Start processing queue if not already running
        if (!this.isProcessing && connectivityService.isOnline) {
            this.processQueue()
        }
    }

    /**
     * Queue a chunk for upload (public method - handles buffering)
     * @param {Blob} chunkBlob - Video chunk blob from MediaRecorder
     * @param {number} originalChunkIndex - Original chunk index from MediaRecorder (for logging)
     */
    queueChunk(chunkBlob, originalChunkIndex) {
        // Add to buffer (will create 5MB chunks automatically)
        this.addToBuffer(chunkBlob, originalChunkIndex)
    }

    /**
     * Process upload queue serially (one at a time, in order)
     * Init must complete successfully before any chunks are processed
     * Each chunk must succeed before moving to the next
     */
    async processQueue() {
        if (this.isProcessing) {
            return
        }

        this.isProcessing = true

        try {
            // Process queue serially while there are items and we're online
            while (this.uploadQueue.length > 0 && connectivityService.isOnline) {
                const item = this.uploadQueue[0] // Get first item (init or next chunk in order)

                if (item.type === 'init') {
                    // Process init first - must succeed before processing chunks
                    try {
                        await this.initializeSession(item.metadata)
                        // Init successful - remove from queue
                        this.uploadQueue.shift()
                        console.log('✅ Init processed successfully, proceeding with chunks')
                    } catch (error) {
                        // Init failed - keep it in queue and retry later
                        console.warn('⚠️ Init failed, will retry:', error.message)
                        // Wait before retrying
                        await new Promise((resolve) => setTimeout(resolve, 2000))
                        // Continue loop to retry init
                        continue
                    }
                } else if (item.type === 'chunk') {
                    // Can only process chunks if session is initialized
                    if (!this.sessionId) {
                        console.log('⏸️ Waiting for session initialization before processing chunks')
                        // Wait a bit and check again
                        await new Promise((resolve) => setTimeout(resolve, 500))
                        continue
                    }

                    // Skip if already uploaded
                    if (this.uploadedChunks.has(item.chunkIndex)) {
                        this.uploadQueue.shift()
                        continue
                    }

                    // Upload chunk - must succeed before moving to next
                    try {
                        await this.uploadChunk(item.blob, item.chunkIndex)
                        // Chunk successful - remove from queue
                        this.uploadQueue.shift()
                    } catch (error) {
                        // Chunk failed - keep it in queue and retry
                        console.warn(`⚠️ Chunk ${item.chunkIndex} failed, will retry:`, error.message)
                        // Wait before retrying
                        await new Promise((resolve) => setTimeout(resolve, 2000))
                        // Continue loop to retry same chunk
                        continue
                    }
                } else {
                    // Unknown item type - remove it
                    console.warn('⚠️ Unknown queue item type, removing:', item)
                    this.uploadQueue.shift()
                }
            }
        } finally {
            this.isProcessing = false

            // If queue still has items and we're online, process again
            if (this.uploadQueue.length > 0 && connectivityService.isOnline) {
                setTimeout(() => this.processQueue(), 100)
            }
        }
    }

    /**
     * Upload a single chunk with retry logic
     * @param {Blob} chunkBlob - Video chunk blob
     * @param {number} chunkIndex - Zero-based chunk index
     * @throws {Error} If upload fails after max retries
     */
    async uploadChunk(chunkBlob, chunkIndex) {
        // Skip if already uploaded
        if (this.uploadedChunks.has(chunkIndex)) {
            return
        }

        // Skip if offline
        if (!connectivityService.isOnline) {
            throw new Error(`Offline - Chunk ${chunkIndex} will be uploaded when online`)
        }

        // Skip if no session
        if (!this.sessionId) {
            throw new Error(`No session - Chunk ${chunkIndex} will be uploaded when session is ready`)
        }

        const retryCount = this.failedChunks.get(chunkIndex) || 0

        // No retry limit - will keep trying until successful
        try {
            const formData = new FormData()
            formData.append('sessionId', this.sessionId)
            formData.append('chunkIndex', chunkIndex.toString())
            formData.append('chunk', chunkBlob, `chunk_${chunkIndex}.webm`)

            const response = await apiClient.post('/videos/chunk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
                // No timeout - will wait indefinitely for upload to complete
            })

            // Mark as uploaded
            this.uploadedChunks.add(chunkIndex)
            this.failedChunks.delete(chunkIndex)

            console.log(`✅ Chunk ${chunkIndex} uploaded successfully (${(chunkBlob.size / 1024).toFixed(2)} KB)`)

            return response.data
        } catch (error) {
            const newRetryCount = retryCount + 1
            this.failedChunks.set(chunkIndex, newRetryCount)

            // If it's a network error and we're offline, throw to pause processing
            if (!connectivityService.isOnline || error.isNetworkError) {
                throw new Error(`Network error uploading chunk ${chunkIndex}, will retry when online`)
            }

            // Calculate retry delay (exponential backoff)
            // After exhausting predefined delays, use max delay of 16 seconds
            const maxDelay = this.retryDelays[this.retryDelays.length - 1] // 16000ms
            const delay = this.retryDelays[Math.min(newRetryCount - 1, this.retryDelays.length - 1)] || maxDelay

            console.warn(
                `⚠️ Failed to upload chunk ${chunkIndex} (attempt ${newRetryCount}). Retrying in ${delay}ms...`,
                error.message
            )

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delay))

            // Retry upload (recursive call)
            return this.uploadChunk(chunkBlob, chunkIndex)
        }
    }

    /**
     * Mark recording as finished - no more chunks will be added
     * @param {number} expectedTotalChunks - Expected total number of chunks from MediaRecorder
     */
    markRecordingFinished(expectedTotalChunks) {
        this.recordingFinished = true

        // Flush any remaining buffer as the final chunk
        this.flushBuffer()

        // Note: expectedTotalChunks is from MediaRecorder, but actual chunks will be different
        // due to 5MB buffering. We'll track actual chunks uploaded instead.
        console.log(`📋 Recording finished. Flushed buffer. MediaRecorder created ${expectedTotalChunks} chunks.`)

        // Ensure queue processing continues if there are chunks
        if (this.uploadQueue.length > 0 && !this.isProcessing && connectivityService.isOnline) {
            this.processQueue()
        }
    }

    /**
     * Finalize upload session - waits for ALL chunks to be uploaded before calling API
     * @param {Object} finalMetadata - Final metadata (duration, totalChunks, etc.)
     * @returns {Promise<Object>} Finalization result
     */
    async finalizeSession(finalMetadata = {}) {
        const expectedChunks = finalMetadata.totalChunks || this.expectedTotalChunks

        // Mark recording as finished
        if (!this.recordingFinished && expectedChunks !== undefined) {
            this.markRecordingFinished(expectedChunks)
        }

        if (!this.sessionId) {
            // Try to initialize session if we have metadata
            if (this.metadata && connectivityService.isOnline) {
                try {
                    await this.initializeSession(this.metadata)
                } catch (error) {
                    console.error('❌ Could not initialize session for finalization:', error)
                    return { success: false, error: 'No active session' }
                }
            } else {
                return { success: false, error: 'No active session' }
            }
        }

        // Wait for ALL chunks to be uploaded before finalizing
        // Note: After 5MB buffering, actual chunk count will differ from MediaRecorder's count
        console.log(`⏳ Waiting for all chunks to be uploaded...`)
        const maxWaitTime = 300000 // 5 minutes max wait (for slow connections)
        const startTime = Date.now()
        const checkInterval = 500 // Check every 500ms

        while (Date.now() - startTime < maxWaitTime) {
            // Ensure buffer is flushed (should already be done in markRecordingFinished)
            if (this.recordingFinished && this.chunkBuffer.length > 0) {
                console.log('⚠️ Recording finished but buffer not flushed, flushing now...')
                this.flushBuffer()
            }

            // If recording is finished, buffer is empty, queue is empty, and not processing, we're done
            if (
                this.recordingFinished &&
                this.chunkBuffer.length === 0 &&
                this.chunkBufferSize === 0 &&
                this.uploadQueue.length === 0 &&
                !this.isProcessing
            ) {
                // Get the highest chunk index that should exist
                const maxChunkIndex = Math.max(...Array.from(this.uploadedChunks), -1)

                // Verify all chunks from 0 to maxChunkIndex are uploaded
                let allChunksUploaded = true
                if (maxChunkIndex >= 0) {
                    for (let i = 0; i <= maxChunkIndex; i++) {
                        if (!this.uploadedChunks.has(i)) {
                            allChunksUploaded = false
                            console.warn(
                                `⚠️ Missing chunk ${i} (uploaded: ${this.uploadedChunks.size}, max: ${maxChunkIndex})`
                            )
                            break
                        }
                    }
                }

                if (allChunksUploaded) {
                    console.log(
                        `✅ All chunks uploaded successfully! (${this.uploadedChunks.size} chunks total, max index: ${maxChunkIndex})`
                    )
                    break
                }
            }

            // Continue processing queue if there are items
            if (this.uploadQueue.length > 0 && !this.isProcessing && connectivityService.isOnline) {
                // Queue will process automatically, but ensure it's running
                this.processQueue()
            }

            await new Promise((resolve) => setTimeout(resolve, checkInterval))
        }

        // Final check: if timeout reached but chunks still pending, log warning
        if (this.uploadQueue.length > 0 || this.chunkBuffer.length > 0 || this.isProcessing) {
            const maxChunkIndex = Math.max(...Array.from(this.uploadedChunks), -1)
            const missing = []
            if (maxChunkIndex >= 0) {
                for (let i = 0; i <= maxChunkIndex; i++) {
                    if (!this.uploadedChunks.has(i)) {
                        missing.push(i)
                    }
                }
            }
            console.warn(`⚠️ Timeout reached. Missing chunks: ${missing.length > 0 ? missing.join(', ') : 'none'}`)
            console.warn(
                `📊 Uploaded: ${this.uploadedChunks.size}, Queue: ${this.uploadQueue.length}, Buffer: ${this.chunkBuffer.length}, Processing: ${this.isProcessing}`
            )
        }

        // Upload any remaining failed chunks one more time
        if (this.uploadQueue.length > 0 && connectivityService.isOnline) {
            console.log(`🔄 Retrying ${this.uploadQueue.length} remaining chunks before finalizing...`)
            await this.processQueue()

            // Wait a bit more for retries to complete
            await new Promise((resolve) => setTimeout(resolve, 2000))
        }

        // Use actual uploaded chunk count (after 5MB buffering, this differs from MediaRecorder count)
        const actualTotalChunks = this.uploadedChunks.size
        const maxChunkIndex = Math.max(...Array.from(this.uploadedChunks), -1)

        if (actualTotalChunks === 0) {
            console.warn('⚠️ No chunks were uploaded, cannot finalize')
            return {
                success: false,
                error: 'No chunks uploaded',
                uploadedChunks: 0
            }
        }

        console.log(
            `📊 Finalizing with ${actualTotalChunks} chunks (indices 0-${maxChunkIndex}). MediaRecorder created ${expectedChunks || 'unknown'} chunks.`
        )

        try {
            const response = await apiClient.post('/videos/finalize', {
                sessionId: this.sessionId,
                totalChunks: actualTotalChunks, // Use actual count after buffering
                uploadedChunks: Array.from(this.uploadedChunks).sort((a, b) => a - b),
                duration: finalMetadata.duration,
                metadata: {
                    ...this.metadata,
                    ...finalMetadata
                }
            })

            console.log('✅ Upload session finalized:', response.data)

            return {
                success: true,
                sessionId: this.sessionId,
                key: response.data?.key,
                uploadedChunks: this.uploadedChunks.size,
                totalChunks: this.uploadedChunks.size // Use actual count after buffering
            }
        } catch (error) {
            console.error('❌ Failed to finalize upload session:', error)
            return {
                success: false,
                error: error.message,
                uploadedChunks: this.uploadedChunks.size
            }
        }
    }

    /**
     * Setup connectivity event listeners
     */
    setupConnectivityListeners() {
        // Listen for connectivity restoration
        this.connectivityUnsubscribe = connectivityService.on('restored', () => {
            console.log('🔄 Connectivity restored - resuming uploads...')

            // Resume processing queue (init will be processed first if needed)
            if (this.uploadQueue.length > 0) {
                this.processQueue()
            } else if (!this.sessionId && this.metadata) {
                // If no queue but we have metadata, queue the init
                this.queueInit(this.metadata)
            }
        })

        // Listen for connectivity loss
        connectivityService.on('lost', () => {
            console.log('📵 Connectivity lost - uploads paused')
            // Queue will resume automatically when connectivity is restored
        })
    }

    /**
     * Get upload progress statistics
     * @returns {Object} Progress stats
     */
    getProgress() {
        const totalQueued = this.uploadQueue.length + this.uploadedChunks.size
        const uploaded = this.uploadedChunks.size
        const failed = this.failedChunks.size
        const pending = this.uploadQueue.length

        return {
            uploaded,
            totalQueued,
            failed,
            pending,
            percentage: totalQueued > 0 ? Math.round((uploaded / totalQueued) * 100) : 0,
            isOnline: connectivityService.isOnline,
            hasSession: !!this.sessionId
        }
    }

    /**
     * Reset/cleanup upload manager
     */
    reset() {
        this.sessionId = null
        this.uploadQueue = []
        this.uploadedChunks.clear()
        this.failedChunks.clear()
        this.isProcessing = false
        this.metadata = null
        this.initQueued = false
        this.recordingFinished = false
        this.expectedTotalChunks = null

        // Reset buffer
        this.chunkBuffer = []
        this.chunkBufferSize = 0
        this.nextChunkIndex = 0

        if (this.connectivityUnsubscribe) {
            this.connectivityUnsubscribe()
            this.connectivityUnsubscribe = null
        }

        console.log('🧹 Upload manager reset')
    }
}

// Create singleton instance
const chunkUploadManager = new ChunkUploadManager()

// Setup connectivity listeners
chunkUploadManager.setupConnectivityListeners()

export default chunkUploadManager
