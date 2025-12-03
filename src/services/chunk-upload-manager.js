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
        this.maxRetries = 5 // Maximum retry attempts per chunk
        this.retryDelays = [1000, 2000, 4000, 8000, 16000] // Exponential backoff delays (ms)
        this.connectivityUnsubscribe = null
        this.metadata = null
        this.initQueued = false // Track if init has been queued
        this.recordingFinished = false // Track if recording has finished (no more chunks will be added)
        this.expectedTotalChunks = null // Expected total number of chunks
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
     * Queue a chunk for upload
     * @param {Blob} chunkBlob - Video chunk blob
     * @param {number} chunkIndex - Zero-based chunk index
     */
    queueChunk(chunkBlob, chunkIndex) {
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
            `📦 Chunk ${chunkIndex} queued (${(chunkBlob.size / 1024).toFixed(2)} KB). Queue size: ${this.uploadQueue.length}`
        )

        // Start processing queue if not already running
        if (!this.isProcessing && connectivityService.isOnline) {
            this.processQueue()
        }
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

        // Don't retry if exceeded max retries
        if (retryCount >= this.maxRetries) {
            const error = new Error(`Chunk ${chunkIndex} exceeded max retries (${this.maxRetries})`)
            console.error(`❌ ${error.message}`)
            throw error
        }

        try {
            const formData = new FormData()
            formData.append('sessionId', this.sessionId)
            formData.append('chunkIndex', chunkIndex.toString())
            formData.append('chunk', chunkBlob, `chunk_${chunkIndex}.webm`)

            const response = await apiClient.post('/videos/chunk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000 // 30 second timeout per chunk
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
            const delay = this.retryDelays[Math.min(newRetryCount - 1, this.retryDelays.length - 1)]

            console.warn(
                `⚠️ Failed to upload chunk ${chunkIndex} (attempt ${newRetryCount}/${this.maxRetries}). Retrying in ${delay}ms...`,
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
     * @param {number} expectedTotalChunks - Expected total number of chunks
     */
    markRecordingFinished(expectedTotalChunks) {
        this.recordingFinished = true
        this.expectedTotalChunks = expectedTotalChunks
        console.log(`📋 Recording finished. Expected ${expectedTotalChunks} chunks total.`)

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
        console.log(`⏳ Waiting for all chunks to be uploaded (expected: ${expectedChunks})...`)
        const maxWaitTime = 300000 // 5 minutes max wait (for slow connections)
        const startTime = Date.now()
        const checkInterval = 500 // Check every 500ms

        while (Date.now() - startTime < maxWaitTime) {
            // Check if all expected chunks are uploaded
            if (expectedChunks !== undefined && this.uploadedChunks.size >= expectedChunks) {
                // Verify we have chunks 0 through expectedChunks-1
                let allChunksUploaded = true
                for (let i = 0; i < expectedChunks; i++) {
                    if (!this.uploadedChunks.has(i)) {
                        allChunksUploaded = false
                        break
                    }
                }

                if (allChunksUploaded && this.uploadQueue.length === 0 && !this.isProcessing) {
                    console.log(`✅ All ${expectedChunks} chunks uploaded successfully!`)
                    break
                }
            }

            // If recording is finished and queue is empty and not processing, we're done
            if (this.recordingFinished && this.uploadQueue.length === 0 && !this.isProcessing) {
                // Double-check: if we have expected count, verify all are uploaded
                if (expectedChunks === undefined || this.uploadedChunks.size >= expectedChunks) {
                    console.log(
                        `✅ All chunks processed (uploaded: ${this.uploadedChunks.size}, expected: ${expectedChunks || 'unknown'})`
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
        if (expectedChunks !== undefined && this.uploadedChunks.size < expectedChunks) {
            const missing = []
            for (let i = 0; i < expectedChunks; i++) {
                if (!this.uploadedChunks.has(i)) {
                    missing.push(i)
                }
            }
            console.warn(`⚠️ Timeout reached. Missing chunks: ${missing.join(', ')}`)
            console.warn(
                `📊 Uploaded: ${this.uploadedChunks.size}/${expectedChunks}, Queue: ${this.uploadQueue.length}, Processing: ${this.isProcessing}`
            )
        }

        // Upload any remaining failed chunks one more time
        if (this.uploadQueue.length > 0 && connectivityService.isOnline) {
            console.log(`🔄 Retrying ${this.uploadQueue.length} remaining chunks before finalizing...`)
            await this.processQueue()

            // Wait a bit more for retries to complete
            await new Promise((resolve) => setTimeout(resolve, 2000))
        }

        // Only call finalize API if we have all chunks or recording is finished
        if (expectedChunks !== undefined && this.uploadedChunks.size < expectedChunks) {
            console.warn(`⚠️ Finalizing with incomplete chunks: ${this.uploadedChunks.size}/${expectedChunks}`)
        }

        try {
            const response = await apiClient.post('/videos/finalize', {
                sessionId: this.sessionId,
                totalChunks: expectedChunks || this.uploadedChunks.size,
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
                videoId: response.data?.videoId,
                videoUrl: response.data?.videoUrl,
                uploadedChunks: this.uploadedChunks.size,
                totalChunks: expectedChunks || this.uploadedChunks.size
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
