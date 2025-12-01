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
        this.uploadQueue = [] // Queue of chunks waiting to upload
        this.uploadedChunks = new Set() // Set of successfully uploaded chunk indices
        this.failedChunks = new Map() // Map of chunkIndex -> retry count
        this.isUploading = false
        this.maxConcurrentUploads = 2 // Upload 2 chunks in parallel
        this.maxRetries = 5 // Maximum retry attempts per chunk
        this.retryDelays = [1000, 2000, 4000, 8000, 16000] // Exponential backoff delays (ms)
        this.connectivityUnsubscribe = null
        this.uploadPromises = new Map() // Track active upload promises
        this.metadata = null
    }

    /**
     * Initialize upload session
     * @param {Object} metadata - Recording metadata (filename, timestamp, fps, etc.)
     * @returns {Promise<string>} Session ID
     */
    async initializeSession(metadata) {
        try {
            if (!connectivityService.isOnline) {
                console.log('📵 Offline - Session will be initialized when online')
                // Store metadata for later initialization
                this.metadata = metadata
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
            // Store metadata for retry when online
            this.metadata = metadata
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

        // Add to queue
        this.uploadQueue.push({
            blob: chunkBlob,
            chunkIndex,
            timestamp: Date.now()
        })

        console.log(
            `📦 Chunk ${chunkIndex} queued (${(chunkBlob.size / 1024).toFixed(2)} KB). Queue size: ${this.uploadQueue.length}`
        )

        // Start processing queue if not already running
        if (!this.isUploading && connectivityService.isOnline) {
            this.processQueue()
        }
    }

    /**
     * Process upload queue with parallel uploads
     */
    async processQueue() {
        if (this.isUploading || !this.sessionId || !connectivityService.isOnline) {
            return
        }

        this.isUploading = true

        // Try to initialize session if not initialized
        if (!this.sessionId && this.metadata) {
            try {
                await this.initializeSession(this.metadata)
            } catch (error) {
                console.warn('⚠️ Could not initialize session, will retry later')
                this.isUploading = false
                return
            }
        }

        if (!this.sessionId) {
            this.isUploading = false
            return
        }

        // Process queue while there are chunks and we're online
        while (this.uploadQueue.length > 0 && connectivityService.isOnline && this.sessionId) {
            // Get up to maxConcurrentUploads chunks to upload in parallel
            const chunksToUpload = this.uploadQueue
                .filter((item) => !this.uploadedChunks.has(item.chunkIndex))
                .slice(0, this.maxConcurrentUploads)

            if (chunksToUpload.length === 0) {
                // All chunks in queue are already uploaded, remove them
                this.uploadQueue = this.uploadQueue.filter((item) => !this.uploadedChunks.has(item.chunkIndex))
                break
            }

            // Upload chunks in parallel
            const uploadPromises = chunksToUpload.map((item) => this.uploadChunk(item.blob, item.chunkIndex))

            try {
                await Promise.allSettled(uploadPromises)
            } catch (error) {
                console.error('Error in parallel upload batch:', error)
            }

            // Remove uploaded chunks from queue
            this.uploadQueue = this.uploadQueue.filter((item) => !this.uploadedChunks.has(item.chunkIndex))
        }

        this.isUploading = false

        // If queue still has items and we're online, process again
        if (this.uploadQueue.length > 0 && connectivityService.isOnline && this.sessionId) {
            setTimeout(() => this.processQueue(), 100)
        }
    }

    /**
     * Upload a single chunk with retry logic
     * @param {Blob} chunkBlob - Video chunk blob
     * @param {number} chunkIndex - Zero-based chunk index
     */
    async uploadChunk(chunkBlob, chunkIndex) {
        // Skip if already uploaded
        if (this.uploadedChunks.has(chunkIndex)) {
            return
        }

        // Skip if offline
        if (!connectivityService.isOnline) {
            console.log(`📵 Offline - Chunk ${chunkIndex} will be uploaded when online`)
            return
        }

        // Skip if no session
        if (!this.sessionId) {
            console.log(`⏸️ No session - Chunk ${chunkIndex} will be uploaded when session is ready`)
            return
        }

        const retryCount = this.failedChunks.get(chunkIndex) || 0

        // Don't retry if exceeded max retries
        if (retryCount >= this.maxRetries) {
            console.error(`❌ Chunk ${chunkIndex} exceeded max retries (${this.maxRetries}), giving up`)
            return
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

            // If it's a network error and we're offline, don't retry immediately
            if (!connectivityService.isOnline || error.isNetworkError) {
                console.log(`📵 Network error uploading chunk ${chunkIndex}, will retry when online`)
                return
            }

            // Calculate retry delay (exponential backoff)
            const delay = this.retryDelays[Math.min(newRetryCount - 1, this.retryDelays.length - 1)]

            console.warn(
                `⚠️ Failed to upload chunk ${chunkIndex} (attempt ${newRetryCount}/${this.maxRetries}). Retrying in ${delay}ms...`,
                error.message
            )

            // Retry after delay
            await new Promise((resolve) => setTimeout(resolve, delay))

            // Retry upload
            return this.uploadChunk(chunkBlob, chunkIndex)
        }
    }

    /**
     * Finalize upload session
     * @param {Object} finalMetadata - Final metadata (duration, totalChunks, etc.)
     * @returns {Promise<Object>} Finalization result
     */
    async finalizeSession(finalMetadata = {}) {
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

        // Wait for all pending uploads to complete (with timeout)
        console.log('⏳ Waiting for pending uploads to complete...')
        const maxWaitTime = 60000 // 60 seconds max wait
        const startTime = Date.now()

        while ((this.uploadQueue.length > 0 || this.isUploading) && Date.now() - startTime < maxWaitTime) {
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        // Upload any remaining failed chunks one more time
        if (this.uploadQueue.length > 0 && connectivityService.isOnline) {
            console.log(`🔄 Retrying ${this.uploadQueue.length} remaining chunks...`)
            await this.processQueue()
        }

        try {
            const response = await apiClient.post('/videos/finalize', {
                sessionId: this.sessionId,
                totalChunks: finalMetadata.totalChunks || this.uploadedChunks.size,
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
                totalChunks: finalMetadata.totalChunks || this.uploadedChunks.size
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

            // Try to initialize session if not initialized
            if (!this.sessionId && this.metadata) {
                this.initializeSession(this.metadata)
                    .then(() => {
                        // Process queue after session is initialized
                        if (this.uploadQueue.length > 0) {
                            this.processQueue()
                        }
                    })
                    .catch((error) => {
                        console.error('Failed to initialize session after connectivity restore:', error)
                    })
            } else if (this.sessionId && this.uploadQueue.length > 0) {
                // Resume processing queue
                this.processQueue()
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
        this.isUploading = false
        this.metadata = null
        this.uploadPromises.clear()

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
