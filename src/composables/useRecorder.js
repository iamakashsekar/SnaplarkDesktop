import { ref, watch, nextTick } from 'vue'

import { BASE_URL } from '../api/config'
import { useStore } from '../store'

export function useRecorder() {
    const store = useStore()
    // Refs for video/canvas elements
    const previewCanvas = ref(null)
    const recordingCanvas = ref(null)
    const screenVideo = ref(null)
    const recordedVideo = ref(null)

    // State
    const uiMode = ref('select') // select, record, preview
    const sources = ref([])
    const selectedSourceId = ref('')
    const audioDevices = ref([])
    const selectedAudioDeviceId = ref('default')
    const videoDevices = ref([])
    const selectedVideoDeviceId = ref(null)
    const fps = ref(30)
    const enableCrop = ref(false)
    const isRecording = ref(false)
    const recordingTime = ref('00:00')
    const recordedVideoUrl = ref('')
    const filename = ref(null)
    const isProcessing = ref(false)
    const savedFilePath = ref('')
    const tempRecordingPath = ref('')
    const uploadProgress = ref({ uploaded: 0, total: 0, percentage: 0, isOnline: true })
    const isUploading = ref(false)
    const windowType = ref(null)

    // Crop region - set externally via setCropRegion()
    const cropRegion = ref({
        x: 0,
        y: 0,
        width: 1280,
        height: 720
    })

    // Streams and recording
    let screenStream = null
    let audioStream = null
    let mediaRecorder = null
    let recordedChunks = [] // For fallback only
    let animationFrameId = null
    let recordingStartTime = null
    let recordingInterval = null
    let recordingDuration = 0
    let recordingTimestamp = null
    let recordingTempPath = null // Real-time disk write path
    let totalChunks = 0 // Track total chunks for upload
    let uploadId = null // Unique ID for upload session

    // Function to set crop region externally
    const setCropRegion = (x, y, width, height) => {
        cropRegion.value = { x, y, width, height }
    }

    const setEnableCrop = (value) => {
        enableCrop.value = value
    }

    // Methods

    const refreshSources = async () => {
        try {
            if (window.electron) {
                sources.value = await window.electron.getSources()
            }
        } catch (error) {
            console.error('Error getting sources:', error)
        }
    }

    const getAudioDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            audioDevices.value = devices.filter((device) => device.kind === 'audioinput')
        } catch (error) {
            console.error('Error getting audio devices:', error)
        }
    }

    const getVideoDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            videoDevices.value = devices.filter((device) => device.kind === 'videoinput')
        } catch (error) {
            console.error('Error getting video devices:', error)
        }
    }

    const startPreview = async () => {
        if (!selectedSourceId.value) return
        // Ensure no stale processing overlay blocks the preview
        isProcessing.value = false

        try {
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSourceId.value,
                        minWidth: 1280,
                        maxWidth: 3840,
                        minHeight: 720,
                        maxHeight: 2160
                    }
                }
            }

            screenStream = await navigator.mediaDevices.getUserMedia(constraints)
            screenVideo.value.srcObject = screenStream

            // Wait for screen video to be ready
            await new Promise((resolve) => {
                screenVideo.value.onloadedmetadata = () => {
                    screenVideo.value
                        .play()
                        .then(resolve)
                        .catch((err) => {
                            console.error('Error playing screen video:', err)
                            resolve()
                        })
                }
            })

            renderPreview()
        } catch (error) {
            console.error('Error starting preview:', error)
            alert('Error accessing screen. Please select a valid source.')
        }
    }

    const stopPreview = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
        }

        if (screenStream) {
            screenStream.getTracks().forEach((track) => track.stop())
            screenStream = null
        }

        if (audioStream) {
            audioStream.getTracks().forEach((track) => track.stop())
            audioStream = null
        }
    }

    const renderPreview = () => {
        if (!previewCanvas.value || !screenVideo.value) return

        // Cancel any existing animation frame to prevent multiple render loops
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
        }

        const canvas = previewCanvas.value
        const ctx = canvas.getContext('2d')
        const video = screenVideo.value

        const render = () => {
            if (!video.videoWidth || !video.videoHeight) {
                animationFrameId = requestAnimationFrame(render)
                return
            }

            // Set canvas size: crop size when enabled, otherwise full video size
            if (enableCrop.value) {
                const { width, height } = cropRegion.value
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = Math.max(1, Math.floor(width))
                    canvas.height = Math.max(1, Math.floor(height))
                }
            } else {
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                }
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Draw cropped region or full screen for preview
            if (enableCrop.value) {
                const { x, y, width, height } = cropRegion.value
                const sx = Math.max(0, Math.floor(x))
                const sy = Math.max(0, Math.floor(y))
                const sw = Math.max(1, Math.floor(width))
                const sh = Math.max(1, Math.floor(height))
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
            } else {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            }

            animationFrameId = requestAnimationFrame(render)
        }

        render()
    }

    const startRecording = async () => {
        uiMode.value = 'record'

        try {
            const canvas = recordingCanvas.value
            const ctx = canvas.getContext('2d')
            const video = screenVideo.value

            // Ensure screen video is ready
            if (!video || video.readyState < 2 || video.videoWidth === 0) {
                alert('Screen video not ready. Please wait a moment and try again.')
                console.error('❌ Screen video not ready:', {
                    exists: !!video,
                    readyState: video?.readyState,
                    videoWidth: video?.videoWidth,
                    videoHeight: video?.videoHeight
                })
                return
            }

            console.log('✅ Screen video ready:', video.videoWidth, 'x', video.videoHeight)

            // Configure canvas for recording: crop size when enabled, otherwise full size
            if (enableCrop.value) {
                const { width, height } = cropRegion.value
                canvas.width = Math.max(1, Math.floor(width))
                canvas.height = Math.max(1, Math.floor(height))
            } else {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
            }

            console.log('🖼️ Canvas configured:', canvas.width, 'x', canvas.height)

            // CRITICAL: Start drawing to canvas BEFORE capturing stream
            // Canvas must be actively rendering for captureStream to work
            let renderFrameId = null
            let frameCount = 0

            const startCanvasRendering = () => {
                const render = () => {
                    if (!canvas || !video) return
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                    // Draw cropped region or full screen
                    if (enableCrop.value) {
                        const { x, y, width, height } = cropRegion.value
                        const sx = Math.max(0, Math.floor(x))
                        const sy = Math.max(0, Math.floor(y))
                        const sw = Math.max(1, Math.floor(width))
                        const sh = Math.max(1, Math.floor(height))
                        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
                    } else {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    }
                    frameCount++
                    renderFrameId = requestAnimationFrame(render)
                }
                render()
            }

            startCanvasRendering()
            console.log('🎨 Canvas rendering started')

            // Wait for at least 30 frames to be rendered (1 second at 30fps)
            // This ensures canvas has stable video data before capturing stream
            console.log('⏳ Waiting for canvas to stabilize...')
            const startTime = Date.now()
            while (frameCount < 30 && Date.now() - startTime < 2000) {
                await new Promise((resolve) => setTimeout(resolve, 50))
            }
            console.log(`✅ Canvas stabilized with ${frameCount} frames rendered`)

            if (selectedAudioDeviceId.value) {
                try {
                    const audioConstraints = { deviceId: selectedAudioDeviceId.value }
                    // Force channel count based on setting to avoid defaulting to mono
                    audioConstraints.channelCount = store.settings.recordAudioMono ? 1 : 2

                    audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
                } catch (error) {
                    console.error('Error getting audio:', error)
                }
            }

            // Capture canvas stream at specified FPS (canvas MUST be actively drawing)
            const canvasStream = canvas.captureStream(fps.value)

            // Stop the temporary rendering (renderRecording will take over)
            if (renderFrameId) {
                cancelAnimationFrame(renderFrameId)
            }
            console.log('🎥 Canvas stream created at', fps.value, 'FPS')
            console.log('📹 Video tracks:', canvasStream.getVideoTracks().length)

            if (canvasStream.getVideoTracks().length === 0) {
                alert('ERROR: Canvas stream has no video track! Cannot record.')
                console.error('❌ Canvas stream has no video tracks!')
                return
            }

            const videoTrack = canvasStream.getVideoTracks()[0]
            console.log('📹 Video track settings:', videoTrack.getSettings())
            console.log('🎤 Audio tracks:', canvasStream.getAudioTracks().length)

            let finalStream
            if (audioStream) {
                finalStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()])
                console.log('🎬 Final stream (with audio):', finalStream)
                console.log('📹 Final video tracks:', finalStream.getVideoTracks().length)
                console.log('🎤 Final audio tracks:', finalStream.getAudioTracks().length)
            } else {
                finalStream = canvasStream
                console.log('🎬 Final stream (no audio):', finalStream)
            }

            recordedChunks = []
            recordingTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
            filename.value = `recording_${recordingTimestamp}.webm`

            // Use VP9 with proper keyframe intervals for smooth seeking
            let options = {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 2500000, // 2.5 Mbps
                videoKeyFrameIntervalDuration: 2000 // Keyframe every 2 seconds for smooth seeking
            }

            // Fallback to VP8 if VP9 not supported
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = {
                    mimeType: 'video/webm;codecs=vp8',
                    videoBitsPerSecond: 2500000
                }
                console.warn('VP9 not supported, using VP8')
            }

            mediaRecorder = new MediaRecorder(finalStream, options)
            console.log('🎬 Recording with:', options.mimeType, 'at', options.videoBitsPerSecond / 1000000, 'Mbps')

            // Initialize real-time disk streaming
            if (window.electron) {
                const initResult = await window.electron.initRecordingStream(recordingTimestamp)
                if (initResult.success) {
                    recordingTempPath = initResult.tempPath
                    tempRecordingPath.value = recordingTempPath
                    console.log('💾 Streaming to disk:', recordingTempPath)
                }
            }

            // Initialize chunk upload session (via notification system)
            totalChunks = 0
            if (window.electronNotifications) {
                uploadId = crypto.randomUUID()
                const metadata = {
                    filename: filename.value,
                    timestamp: recordingTimestamp,
                    fps: fps.value,
                    codec: options.mimeType,
                    bitrate: options.videoBitsPerSecond,
                    resolution: {
                        width: canvas.width,
                        height: canvas.height
                    }
                }

                // Show notification immediately
                window.electronNotifications.notify({
                    variant: 'video-upload',
                    id: uploadId,
                    fileInfo: {
                        metadata: metadata
                    }
                })

                console.log('☁️ Upload notification started:', uploadId)
            }

            isUploading.value = true

            let pendingWrites = 0

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data && event.data.size > 0) {
                    const chunkIndex = totalChunks++
                    console.log(`Chunk ${chunkIndex}: ${(event.data.size / 1024).toFixed(2)} KB`)

                    // Write to disk immediately (streaming mode - no memory accumulation)
                    if (window.electron && recordingTempPath) {
                        pendingWrites++
                        try {
                            const arrayBuffer = await event.data.arrayBuffer()
                            await window.electron.appendRecordingChunk(arrayBuffer)
                        } catch (error) {
                            console.error('❌ Error writing chunk:', error)
                        } finally {
                            pendingWrites--
                        }
                    } else {
                        // Fallback: keep in memory if disk streaming not available
                        recordedChunks.push(event.data)
                    }

                    // Queue chunk for upload (via notification system)
                    try {
                        if (uploadId && window.electronNotifications) {
                            // Convert Blob to ArrayBuffer for IPC
                            const buffer = await event.data.arrayBuffer()
                            // Send as Uint8Array (which Electron handles well)
                            window.electronNotifications.sendVideoChunk({
                                id: uploadId,
                                chunk: new Uint8Array(buffer),
                                chunkIndex: chunkIndex
                            })
                        }
                    } catch (error) {
                        console.warn('⚠️ Error queueing chunk for upload:', error)
                        // Continue recording even if upload queueing fails
                    }
                }
            }

            mediaRecorder.onstop = async () => {
                console.log('⏹️ Recording stopped, finalizing...')
                isProcessing.value = true

                try {
                    stopPreview()

                    if (recordingInterval) {
                        clearInterval(recordingInterval)
                        recordingInterval = null
                    }

                    // Calculate actual duration
                    recordingDuration = Date.now() - recordingStartTime
                    console.log(`📊 Duration: ${(recordingDuration / 1000).toFixed(1)}s`)
                    console.log(`📦 Total chunks recorded: ${totalChunks}`)

                    // Wait for all pending writes to complete
                    console.log('⏳ Waiting for disk writes to complete...')
                    let waitCount = 0
                    while (pendingWrites > 0 && waitCount < 100) {
                        await new Promise((resolve) => setTimeout(resolve, 100))
                        waitCount++
                    }

                    if (pendingWrites > 0) {
                        console.warn('⚠️ Warning: Some writes still pending')
                    }

                    // Mark recording as finished - no more chunks will be added
                    // Notification system handles the rest
                    console.log('✅ Recording finished locally')

                    // Wait a moment for any final chunks to be queued (ondataavailable might fire after onstop)
                    await new Promise((resolve) => setTimeout(resolve, 1000))

                    // Close the disk write stream
                    if (window.electron && recordingTempPath) {
                        try {
                            await window.electron.stopRecordingStream()
                            console.log('✅ Disk stream closed')

                            // Wait for file to be fully written
                            console.log('⏳ Waiting for file write to complete...')
                            await new Promise((resolve) => setTimeout(resolve, 1000))

                            // Use the single file directly for preview (no duplicate file creation)
                            tempRecordingPath.value = recordingTempPath
                            const fileUrl = 'local-video://' + recordingTempPath
                            recordedVideoUrl.value = fileUrl

                            console.log('📺 Preview URL set:', recordedVideoUrl.value)
                            console.log('✅ File ready for preview')
                        } catch (error) {
                            console.error('❌ Error closing stream:', error)
                            // Try to set URL anyway
                            if (recordingTempPath) {
                                tempRecordingPath.value = recordingTempPath
                                const fileUrl = 'local-video://' + recordingTempPath
                                recordedVideoUrl.value = fileUrl
                                console.log('📺 Fallback URL set:', recordedVideoUrl.value)
                            }
                        }
                    } else if (recordedChunks.length > 0) {
                        // Fallback: save from memory chunks (only if disk streaming not available)
                        console.log('Fallback: saving from memory chunks')
                        const mimeType = options.mimeType || 'video/webm'
                        const videoBlob = new Blob(recordedChunks, { type: mimeType })

                        if (window.electron) {
                            const arrayBuffer = await videoBlob.arrayBuffer()
                            const result = await window.electron.saveVideo(arrayBuffer, filename.value)
                            if (result.success) {
                                tempRecordingPath.value = result.path
                                const fileUrl = 'local-video://' + result.path
                                recordedVideoUrl.value = fileUrl
                            }
                        } else {
                            recordedVideoUrl.value = URL.createObjectURL(videoBlob)
                        }
                    }

                    // Trigger video load and wait for metadata
                    await nextTick()
                    if (recordedVideo.value && recordedVideoUrl.value) {
                        try {
                            console.log('⏳ Loading video metadata...')
                            recordedVideo.value.load()

                            // Wait for video metadata to load
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(() => {
                                    console.warn('⚠️ Video metadata load timeout')
                                    resolve() // Don't reject, just continue
                                }, 5000)

                                recordedVideo.value.onloadedmetadata = () => {
                                    clearTimeout(timeout)
                                    console.log('✅ Video metadata loaded')
                                    console.log('📊 Video duration:', recordedVideo.value.duration, 'seconds')
                                    console.log(
                                        '📐 Video dimensions:',
                                        recordedVideo.value.videoWidth,
                                        'x',
                                        recordedVideo.value.videoHeight
                                    )
                                    resolve()
                                }

                                recordedVideo.value.onerror = (e) => {
                                    clearTimeout(timeout)
                                    console.error('❌ Video load error:', e)
                                    resolve() // Don't reject, just continue
                                }
                            })
                        } catch (e) {
                            console.warn('Could not load video:', e)
                        }
                    }

                    console.log('✅ Recording ready for playback')
                    console.log('🔍 Debug - recordedVideoUrl:', recordedVideoUrl.value)
                    console.log('🔍 Debug - isProcessing:', isProcessing.value)

                    // Finalize upload session (non-blocking)
                    console.log('☁️ Sending finalize signal to notification...')
                    if (uploadId && window.electronNotifications) {
                        try {
                            window.electronNotifications.sendVideoFinalize({
                                id: uploadId,
                                metadata: {
                                    totalChunks: totalChunks,
                                    duration: recordingDuration
                                }
                            })

                            // Close window immediately if it's a dedicated recording window
                            // We don't wait for upload to finish anymore!
                            if (windowType.value) {
                                console.log('� Closing recording window (upload continues in notification)')
                                setTimeout(() => {
                                    window.electronWindows?.closeWindow?.(windowType.value)
                                }, 500)
                            }
                        } catch (error) {
                            console.error('❌ Error sending finalize signal:', error)
                        } finally {
                            isUploading.value = false
                        }
                    }
                } catch (error) {
                    console.error('❌ Error in onstop:', error)
                    alert('Error processing recording: ' + error.message)
                } finally {
                    isProcessing.value = false
                    console.log('🔍 Debug - isProcessing set to false')
                    console.log('🔍 Debug - Final recordedVideoUrl:', recordedVideoUrl.value)
                }
            }

            // Request data every 2 seconds for better seeking and reliability
            // Smaller chunks = more keyframes = smoother playback
            mediaRecorder.start(2000)

            // Request initial data immediately to ensure first chunk has video
            setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.requestData()
                    console.log('📹 Initial keyframe requested')
                }
            }, 100)

            isRecording.value = true

            recordingStartTime = Date.now()

            recordingInterval = setInterval(() => {
                const elapsed = Date.now() - recordingStartTime
                const hours = Math.floor(elapsed / 3600000)
                const minutes = Math.floor((elapsed % 3600000) / 60000)
                const seconds = Math.floor((elapsed % 60000) / 1000)

                // Display format: HH:MM:SS for recordings over 1 hour, MM:SS otherwise
                if (hours > 0) {
                    recordingTime.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                } else {
                    recordingTime.value = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                }
            }, 1000)

            renderRecording()
        } catch (error) {
            console.error('Error starting recording:', error)
            alert('Error starting recording: ' + error.message)
            isRecording.value = false
        }
    }

    const renderRecording = () => {
        if (!isRecording.value) return

        const canvas = recordingCanvas.value
        const ctx = canvas.getContext('2d')
        const video = screenVideo.value

        console.log('🎬 Starting render loop')
        console.log('📺 Screen video ready:', video.readyState, 'Size:', video.videoWidth, 'x', video.videoHeight)
        console.log('🖼️ Canvas size:', canvas.width, 'x', canvas.height)

        // Use interval matching the FPS for consistent frame timing
        // This prevents frame drops and ensures smooth playback
        const frameInterval = 1000 / fps.value
        let lastFrameTime = performance.now()
        let frameCount = 0

        const render = () => {
            if (!isRecording.value) return

            frameCount++
            if (frameCount === 1 || frameCount % 30 === 0) {
                console.log(`🎞️ Rendering frame ${frameCount}`)
            }

            const currentTime = performance.now()
            const elapsed = currentTime - lastFrameTime

            // Only render when enough time has passed for the next frame
            if (elapsed >= frameInterval) {
                lastFrameTime = currentTime - (elapsed % frameInterval)

                ctx.clearRect(0, 0, canvas.width, canvas.height)

                // Draw cropped region or full screen
                if (enableCrop.value) {
                    const { x, y, width, height } = cropRegion.value
                    const sx = Math.max(0, Math.floor(x))
                    const sy = Math.max(0, Math.floor(y))
                    const sw = Math.max(1, Math.floor(width))
                    const sh = Math.max(1, Math.floor(height))
                    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
                } else {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                }
            }

            requestAnimationFrame(render)
        }

        render()
    }

    const stopRecording = () => {
        // uiMode.value = 'preview'

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            // Request any remaining data before stopping
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.requestData()
            }
            mediaRecorder.stop()
        }
        isRecording.value = false
    }

    const resetRecording = () => {
        if (recordedVideoUrl.value && recordedVideoUrl.value.startsWith('blob:')) {
            URL.revokeObjectURL(recordedVideoUrl.value)
        }
        recordedVideoUrl.value = ''
        savedFilePath.value = ''
        tempRecordingPath.value = ''
        isProcessing.value = false
        recordingTime.value = '00:00'
        recordedChunks = []
        totalChunks = 0
        isUploading.value = false
        uploadProgress.value = { uploaded: 0, total: 0, percentage: 0, isOnline: true }

        // Reset upload manager
        uploadId = null

        startPreview()
    }

    const handleDeviceChange = async () => {
        await getAudioDevices()
        await getVideoDevices()
    }

    const initialize = async () => {
        await refreshSources()
        await getAudioDevices()
        await getVideoDevices()

        // Listen for device changes
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    }

    const cleanup = () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)

        stopPreview()
        if (recordedVideoUrl.value && recordedVideoUrl.value.startsWith('blob:')) {
            URL.revokeObjectURL(recordedVideoUrl.value)
        }
        // Reset upload manager on cleanup
        uploadId = null
    }

    // Watchers
    watch(recordedVideoUrl, () => {
        // Never let the processing overlay get stuck
        isProcessing.value = false
    })
    watch(selectedSourceId, () => {
        if (selectedSourceId.value && !isRecording.value) {
            isProcessing.value = false
            stopPreview()
            startPreview()
        }
    })

    return {
        uiMode,
        previewCanvas,
        recordingCanvas,
        screenVideo,
        recordedVideo,
        sources,
        selectedSourceId,
        audioDevices,
        selectedAudioDeviceId,
        videoDevices,
        selectedVideoDeviceId,
        fps,
        enableCrop,
        isRecording,
        recordingTime,
        recordedVideoUrl,
        filename,
        isProcessing,
        tempRecordingPath,
        savedFilePath,
        uploadProgress,
        isUploading,
        cropRegion,
        windowType,
        setCropRegion,
        setEnableCrop,
        refreshSources,
        startRecording,
        stopRecording,
        resetRecording,
        initialize,
        cleanup
    }
}
