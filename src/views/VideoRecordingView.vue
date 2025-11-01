<script setup>
    import { ref, onMounted, onUnmounted, computed } from 'vue'
    import { useStore } from '@/store'

    const store = useStore()

    // Core selection state
    const startX = ref(0)
    const startY = ref(0)
    const endX = ref(0)
    const endY = ref(0)
    const mouseX = ref(0)
    const mouseY = ref(0)
    const displayId = ref(null)
    const mode = ref('idle') // 'idle', 'selecting', 'resizing', 'confirming', 'recording', 'stopping', 'previewing'
    const resizingHandle = ref(null)

    // Dragging state
    const dragStartMouseX = ref(0)
    const dragStartMouseY = ref(0)
    const dragStartSelectionX = ref(0)
    const dragStartSelectionY = ref(0)

    // Magnifier state
    const magnifierActive = ref(false)
    const isWindowActive = ref(false)
    const magnifierSize = 200
    const zoomFactor = 2
    const magnifierCanvas = ref(null)
    const fullScreenImage = ref(null)

    // Preview state
    const recordedVideoBlob = ref(null)
    const recordedVideoPath = ref(null)
    const previewVideoUrl = ref(null)

    // Recording state
    const isRecording = ref(false)
    const recordingId = ref(null)
    const mediaRecorder = ref(null)
    const recordedChunks = ref([])
    const recordingStartTime = ref(null)
    const recordingDuration = ref(0)
    const recordingInterval = ref(null)
    const stream = ref(null)
    const videoElement = ref(null)
    const cropCanvas = ref(null)
    const cropStream = ref(null)
    const animationFrameId = ref(null)
    const stopRecordingShortcutCallback = ref(null)

    // Video recording configuration
    const VIDEO_CONFIG = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000
    }

    const selectionRect = computed(() => {
        const left = Math.min(startX.value, endX.value)
        const top = Math.min(startY.value, endY.value)
        const width = Math.abs(endX.value - startX.value)
        const height = Math.abs(endY.value - startY.value)
        return { left, top, width, height }
    })

    const isFullScreen = computed(() => {
        const { left, top, width, height } = selectionRect.value
        return left === 0 && top === 0 && width === window.innerWidth && height === window.innerHeight
    })

    const shouldShowMagnifier = computed(() => {
        return store.settings.showMagnifier !== false
    })

    const shouldShowCrosshair = computed(() => {
        return store.settings.showCrosshair === true
    })

    const selectionBorderClass = computed(() => {
        if (mode.value !== 'selecting') return 'animated-dashed-border'

        if (!shouldShowCrosshair.value) {
            return 'animated-dashed-border'
        }

        const draggingRight = endX.value >= startX.value
        const draggingDown = endY.value >= startY.value

        if (draggingRight && draggingDown) {
            return 'animated-dashed-border-selecting-top-left'
        } else if (!draggingRight && draggingDown) {
            return 'animated-dashed-border-selecting-top-right'
        } else if (draggingRight && !draggingDown) {
            return 'animated-dashed-border-selecting-bottom-left'
        } else {
            return 'animated-dashed-border-selecting-bottom-right'
        }
    })

    const magnifierStyle = computed(() => {
        const offset = 10
        let left = mouseX.value + offset
        let top = mouseY.value + offset

        if (left + magnifierSize > window.innerWidth) {
            left = mouseX.value - magnifierSize - offset
        }
        if (top + magnifierSize > window.innerHeight) {
            top = mouseY.value - magnifierSize - offset
        }

        return { left: `${left}px`, top: `${top}px` }
    })

    const toolbarStyle = computed(() => {
        const { left, top, width, height } = selectionRect.value
        const toolbarWidth = 300
        const margin = 10

        let toolbarLeft = Math.max(
            margin,
            Math.min(left + width / 2 - toolbarWidth / 2, window.innerWidth - toolbarWidth - margin)
        )

        const toolbarTop = top + height + 70 > window.innerHeight ? top + height - 60 : top + height + 10

        return { left: `${toolbarLeft}px`, top: `${toolbarTop}px` }
    })

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const windowType = computed(() => {
        return displayId.value ? `video-recording-${displayId.value}` : 'video-recording'
    })

    const handleMouseDown = async (e) => {
        if (mode.value === 'confirming' || mode.value === 'recording' || mode.value === 'previewing') return

        try {
            await window.electronWindows?.closeOtherVideoRecordingWindows(displayId.value)
        } catch (error) {
            console.error('Error closing other video recording windows:', error)
        }

        isWindowActive.value = true
        mode.value = 'selecting'
        magnifierActive.value = shouldShowMagnifier.value
        startX.value = endX.value = e.clientX
        startY.value = endY.value = e.clientY
    }

    const handleResizeHandleMouseDown = (e, handle) => {
        e.stopPropagation()
        mode.value = 'resizing'
        magnifierActive.value = shouldShowMagnifier.value
        resizingHandle.value = handle
    }

    const handleSelectionMouseDown = (e) => {
        if (mode.value !== 'confirming') return
        e.stopPropagation()
        mode.value = 'moving'
        dragStartMouseX.value = e.clientX
        dragStartMouseY.value = e.clientY
        dragStartSelectionX.value = Math.min(startX.value, endX.value)
        dragStartSelectionY.value = Math.min(startY.value, endY.value)
    }

    const handleMouseMove = (e) => {
        mouseX.value = e.clientX
        mouseY.value = e.clientY

        if (mode.value === 'selecting') {
            endX.value = e.clientX
            endY.value = e.clientY
        } else if (mode.value === 'resizing') {
            const handle = resizingHandle.value
            if (handle.includes('left')) startX.value = e.clientX
            if (handle.includes('right')) endX.value = e.clientX
            if (handle.includes('top')) startY.value = e.clientY
            if (handle.includes('bottom')) endY.value = e.clientY
        } else if (mode.value === 'moving') {
            const deltaX = e.clientX - dragStartMouseX.value
            const deltaY = e.clientY - dragStartMouseY.value
            const width = Math.abs(endX.value - startX.value)
            const height = Math.abs(endY.value - startY.value)

            const newLeft = dragStartSelectionX.value + deltaX
            const newTop = dragStartSelectionY.value + deltaY

            const constrainedLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width))
            const constrainedTop = Math.max(0, Math.min(newTop, window.innerHeight - height))

            startX.value = constrainedLeft
            startY.value = constrainedTop
            endX.value = constrainedLeft + width
            endY.value = constrainedTop + height
        }

        if (isWindowActive.value && magnifierActive.value) {
            updateMagnifier(e.clientX, e.clientY)
        }
    }

    const handleMouseUp = () => {
        if (mode.value === 'selecting') {
            magnifierActive.value = false
            const { width, height } = selectionRect.value

            if (width < 10 && height < 10) {
                startX.value = startY.value = 0
                endX.value = window.innerWidth
                endY.value = window.innerHeight
            }

            const normalizedLeft = Math.min(startX.value, endX.value)
            const normalizedTop = Math.min(startY.value, endY.value)
            const normalizedRight = Math.max(startX.value, endX.value)
            const normalizedBottom = Math.max(startY.value, endY.value)

            startX.value = normalizedLeft
            startY.value = normalizedTop
            endX.value = normalizedRight
            endY.value = normalizedBottom

            mode.value = 'confirming'
        } else if (mode.value === 'resizing') {
            magnifierActive.value = false

            const normalizedLeft = Math.min(startX.value, endX.value)
            const normalizedTop = Math.min(startY.value, endY.value)
            const normalizedRight = Math.max(startX.value, endX.value)
            const normalizedBottom = Math.max(startY.value, endY.value)

            startX.value = normalizedLeft
            startY.value = normalizedTop
            endX.value = normalizedRight
            endY.value = normalizedBottom

            mode.value = 'confirming'
            resizingHandle.value = null
        } else if (mode.value === 'moving') {
            magnifierActive.value = false
            mode.value = 'confirming'
        }
    }

    const updateMagnifier = (x, y) => {
        if (!magnifierCanvas.value || !fullScreenImage.value) return

        if (!fullScreenImage.value.complete || fullScreenImage.value.naturalWidth === 0) {
            fullScreenImage.value.onload = () => updateMagnifier(x, y)
            return
        }

        try {
            const canvas = magnifierCanvas.value
            const ctx = canvas.getContext('2d', { alpha: false })
            if (!ctx) return

            ctx.imageSmoothingEnabled = false
            ctx.clearRect(0, 0, magnifierSize, magnifierSize)

            const img = fullScreenImage.value
            const imgW = img.naturalWidth
            const imgH = img.naturalHeight
            const viewW = window.innerWidth
            const viewH = window.innerHeight
            const scaleX = imgW / viewW
            const scaleY = imgH / viewH

            const sourceSizeView = magnifierSize / zoomFactor
            const sourceWImg = sourceSizeView * scaleX
            const sourceHImg = sourceSizeView * scaleY
            const centerXImg = x * scaleX
            const centerYImg = y * scaleY
            const desiredLeft = centerXImg - sourceWImg / 2
            const desiredTop = centerYImg - sourceHImg / 2
            const desiredRight = desiredLeft + sourceWImg
            const desiredBottom = desiredTop + sourceHImg

            const interLeft = Math.max(0, desiredLeft)
            const interTop = Math.max(0, desiredTop)
            const interRight = Math.min(imgW, desiredRight)
            const interBottom = Math.min(imgH, desiredBottom)
            const interW = Math.max(0, interRight - interLeft)
            const interH = Math.max(0, interBottom - interTop)

            const patternCanvas = document.createElement('canvas')
            const size = 10
            patternCanvas.width = size * 2
            patternCanvas.height = size * 2

            const pctx = patternCanvas.getContext('2d')
            const color1 = '#eee'
            const color2 = '#ccc'

            pctx.fillStyle = color1
            pctx.fillRect(0, 0, size * 2, size * 2)

            pctx.fillStyle = color2
            pctx.fillRect(0, 0, size, size)
            pctx.fillRect(size, size, size, size)

            const pattern = ctx.createPattern(patternCanvas, 'repeat')

            ctx.fillStyle = pattern
            ctx.fillRect(0, 0, magnifierSize, magnifierSize)

            if (interW > 0 && interH > 0) {
                const destX = ((interLeft - desiredLeft) / sourceWImg) * magnifierSize
                const destY = ((interTop - desiredTop) / sourceHImg) * magnifierSize
                const destW = (interW / sourceWImg) * magnifierSize
                const destH = (interH / sourceHImg) * magnifierSize

                ctx.drawImage(img, interLeft, interTop, interW, interH, destX, destY, destW, destH)
            }

            const center = magnifierSize / 2
            ctx.strokeStyle = 'white'
            ctx.lineWidth = 4
            ctx.beginPath()
            ctx.moveTo(center, 0)
            ctx.lineTo(center, magnifierSize)
            ctx.moveTo(0, center)
            ctx.lineTo(magnifierSize, center)
            ctx.stroke()

            ctx.strokeStyle = 'black'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(center, 0)
            ctx.lineTo(center, magnifierSize)
            ctx.moveTo(0, center)
            ctx.lineTo(magnifierSize, center)
            ctx.stroke()
        } catch (error) {
            console.warn('Magnifier error:', error)
        }
    }

    const startRecording = async () => {
        let result = null
        try {
            const { left, top, width, height } = selectionRect.value
            const isFullScreenSelection = isFullScreen.value

            console.log('Starting recording with bounds:', { left, top, width, height, isFullScreenSelection })
            console.log('DisplayId:', displayId.value)

            result = await window.electron?.startVideoRecording({
                type: isFullScreenSelection ? 'fullscreen' : 'area',
                bounds: {
                    x: Math.round(left),
                    y: Math.round(top),
                    width: Math.round(width),
                    height: Math.round(height)
                },
                displayId: displayId.value || null,
                isFullScreen: isFullScreenSelection
            })

            console.log('Result from startVideoRecording:', result)

            if (!result) {
                console.error('No result returned from startVideoRecording')
                alert('Failed to start recording: No response from service')
                return
            }

            if (!result.success) {
                console.error('Failed to start recording:', result?.error)
                alert(`Failed to start recording: ${result?.error || 'Unknown error'}`)
                return
            }

            if (!result.recordingId) {
                console.error('Recording started but no recordingId returned:', result)
                alert('Failed to start recording: No recording ID received')
                return
            }

            if (!result.sourceId) {
                console.error('Recording started but no sourceId returned:', result)
                alert('Failed to start recording: No source ID received')
                return
            }

            console.log('Recording started, sourceId:', result.sourceId, 'recordingId:', result.recordingId)
            recordingId.value = result.recordingId

            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: result.sourceId
                    }
                }
            }

            console.log('Requesting media stream with constraints:', constraints)

            try {
                stream.value = await navigator.mediaDevices.getUserMedia(constraints)
                console.log('Media stream obtained:', stream.value)
            } catch (getUserMediaError) {
                console.error('getUserMedia error:', getUserMediaError)
                alert(`Failed to access screen: ${getUserMediaError.message || getUserMediaError.name}`)
                cleanupRecording()
                mode.value = 'confirming'
                return
            }

            if (!stream.value || stream.value.getVideoTracks().length === 0) {
                console.error('No video tracks in stream')
                alert('Failed to get video stream from screen')
                cleanupRecording()
                mode.value = 'confirming'
                return
            }

            const videoTrack = stream.value.getVideoTracks()[0]
            console.log('Video track:', videoTrack)
            console.log('Video track settings:', videoTrack.getSettings())

            if (isFullScreenSelection) {
                console.log('Setting up fullscreen recording')
                mediaRecorder.value = new MediaRecorder(stream.value, VIDEO_CONFIG)
            } else {
                console.log('Setting up partial screen recording with cropping')
                videoElement.value = document.createElement('video')
                videoElement.value.srcObject = stream.value
                videoElement.value.autoplay = true
                videoElement.value.muted = true
                videoElement.value.playsInline = true

                // Wait for video to be ready and playing
                await new Promise((resolve, reject) => {
                    const checkVideoReady = () => {
                        if (videoElement.value.readyState >= 2) {
                            // Video has loaded enough data
                            videoElement.value
                                .play()
                                .then(() => {
                                    console.log('Video element playing, starting canvas cropping')
                                    // Wait a bit more to ensure frames are available
                                    setTimeout(() => resolve(), 100)
                                })
                                .catch((error) => {
                                    console.error('Error playing video:', error)
                                    reject(error)
                                })
                        } else {
                            setTimeout(checkVideoReady, 50)
                        }
                    }

                    videoElement.value.onloadedmetadata = () => {
                        checkVideoReady()
                    }
                    videoElement.value.onerror = (e) => {
                        console.error('Video element error:', e)
                        reject(new Error('Video element failed to load'))
                    }
                    setTimeout(() => reject(new Error('Video load timeout')), 10000)
                })

                cropCanvas.value = document.createElement('canvas')
                cropCanvas.value.width = Math.round(width)
                cropCanvas.value.height = Math.round(height)
                const ctx = cropCanvas.value.getContext('2d', { alpha: false })

                if (!ctx) {
                    throw new Error('Failed to get canvas context')
                }

                // Get video element dimensions after it's loaded
                const videoWidth = videoElement.value.videoWidth || videoElement.value.clientWidth || window.innerWidth
                const videoHeight =
                    videoElement.value.videoHeight || videoElement.value.clientHeight || window.innerHeight
                const viewWidth = window.innerWidth
                const viewHeight = window.innerHeight

                console.log('Video dimensions:', { videoWidth, videoHeight, viewWidth, viewHeight })

                // Calculate scale factors between viewport and video element
                const scaleX = videoWidth / viewWidth
                const scaleY = videoHeight / viewHeight

                console.log('Scale factors:', { scaleX, scaleY })

                // Convert selection coordinates from viewport to video element coordinates
                const cropLeft = Math.round(left * scaleX)
                const cropTop = Math.round(top * scaleY)
                const cropWidth = Math.round(width * scaleX)
                const cropHeight = Math.round(height * scaleY)

                console.log('Crop coordinates:', { left, top, width, height, cropLeft, cropTop, cropWidth, cropHeight })

                // Draw initial frame before capturing stream
                try {
                    ctx.drawImage(
                        videoElement.value,
                        cropLeft,
                        cropTop,
                        cropWidth,
                        cropHeight,
                        0,
                        0,
                        Math.round(width),
                        Math.round(height)
                    )
                    console.log('Initial frame drawn to canvas')
                } catch (error) {
                    console.warn('Error drawing initial frame:', error)
                }

                // Start capturing stream from canvas AFTER drawing initial frame
                cropStream.value = cropCanvas.value.captureStream(30)
                console.log('Canvas stream created, fps:', 30)

                // Ensure stream is active
                if (!cropStream.value || cropStream.value.getVideoTracks().length === 0) {
                    throw new Error('Failed to create canvas stream')
                }

                const cropVideoTrack = cropStream.value.getVideoTracks()[0]
                if (!cropVideoTrack) {
                    throw new Error('Failed to get crop video track')
                }

                console.log('Canvas video track:', {
                    enabled: cropVideoTrack.enabled,
                    readyState: cropVideoTrack.readyState,
                    muted: cropVideoTrack.muted,
                    settings: cropVideoTrack.getSettings()
                })

                // Ensure track is enabled
                cropVideoTrack.enabled = true

                // Start drawing loop BEFORE creating MediaRecorder
                // This ensures frames are being produced before MediaRecorder starts
                let frameCount = 0
                const drawFrame = () => {
                    if (!cropCanvas.value || !videoElement.value) {
                        return
                    }

                    try {
                        // Check if video has frames available and isRecording is true
                        if (videoElement.value.readyState >= 2) {
                            // Recalculate scale factors in case video dimensions changed
                            const currentVideoWidth =
                                videoElement.value.videoWidth || videoElement.value.clientWidth || window.innerWidth
                            const currentVideoHeight =
                                videoElement.value.videoHeight || videoElement.value.clientHeight || window.innerHeight
                            const currentScaleX = currentVideoWidth / viewWidth
                            const currentScaleY = currentVideoHeight / viewHeight

                            const currentCropLeft = Math.round(left * currentScaleX)
                            const currentCropTop = Math.round(top * currentScaleY)
                            const currentCropWidth = Math.round(width * currentScaleX)
                            const currentCropHeight = Math.round(height * currentScaleY)

                            ctx.drawImage(
                                videoElement.value,
                                currentCropLeft,
                                currentCropTop,
                                currentCropWidth,
                                currentCropHeight,
                                0,
                                0,
                                Math.round(width),
                                Math.round(height)
                            )
                            frameCount++
                            if (frameCount % 30 === 0) {
                                console.log(`Drawn ${frameCount} frames to canvas`)
                            }
                        }
                    } catch (error) {
                        console.warn('Error drawing frame:', error)
                    }

                    // Continue drawing as long as we have the canvas and video element
                    // isRecording will be set to false when stopping, but we check cropCanvas instead
                    if (cropCanvas.value && videoElement.value) {
                        animationFrameId.value = requestAnimationFrame(drawFrame)
                    }
                }

                // Start drawing frames immediately
                drawFrame()
                console.log('Canvas cropping started, drawing frames...')

                // Wait a bit to ensure frames are being produced before starting MediaRecorder
                await new Promise((resolve) => setTimeout(resolve, 300))
                console.log(`Drawn ${frameCount} frames before starting MediaRecorder`)

                // Create MediaRecorder with the canvas stream
                const croppedStream = new MediaStream([cropVideoTrack])
                mediaRecorder.value = new MediaRecorder(croppedStream, VIDEO_CONFIG)

                console.log('MediaRecorder created with canvas stream, track state:', cropVideoTrack.readyState)
            }

            if (!mediaRecorder.value) {
                throw new Error('Failed to create MediaRecorder')
            }

            recordedChunks.value = []

            mediaRecorder.value.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.value.push(event.data)
                    console.log(
                        'Received data chunk:',
                        event.data.size,
                        'bytes, total chunks:',
                        recordedChunks.value.length
                    )
                } else {
                    console.warn('Received empty data chunk')
                }
            }

            mediaRecorder.value.onstop = async () => {
                try {
                    console.log('MediaRecorder onstop fired!')
                    console.log('Chunks count:', recordedChunks.value.length)
                    console.log('Current mode before onstop:', mode.value)

                    // Ensure window is shown and blocking immediately
                    const currentWindowType = windowType.value
                    console.log('Window type:', currentWindowType)
                    window.electronWindows?.makeWindowBlocking(currentWindowType)
                    window.electronWindows?.showWindow(currentWindowType)

                    // Don't cleanup streams yet - wait until we have the blob
                    // cleanupRecording()

                    // Wait a bit to ensure all chunks are collected
                    await new Promise((resolve) => setTimeout(resolve, 300))

                    const totalSize = recordedChunks.value.reduce((sum, chunk) => sum + chunk.size, 0)
                    console.log('Total chunks size:', totalSize, 'bytes')

                    if (totalSize === 0) {
                        console.error('No chunks collected!')
                        cleanupRecording()
                        mode.value = 'idle'
                        alert('Recording failed: No video data captured')
                        window.electron?.cancelVideoRecordingMode()
                        return
                    }

                    const blob = new Blob(recordedChunks.value, { type: VIDEO_CONFIG.mimeType })
                    console.log('Recording blob created, size:', blob.size, 'bytes')

                    if (blob.size > 0) {
                        recordedVideoBlob.value = blob
                        previewVideoUrl.value = URL.createObjectURL(blob)
                        console.log(
                            'Setting mode to previewing, blob URL created:',
                            previewVideoUrl.value.substring(0, 50)
                        )
                        // IMPORTANT: Set previewing mode BEFORE cleanup and ensure it sticks
                        mode.value = 'previewing'
                        console.log('Mode set to previewing:', mode.value)

                        // Cleanup streams after creating preview
                        cleanupRecording()

                        console.log('Preview ready, window shown, mode:', mode.value)

                        // Double-check window is shown and focused
                        window.electronWindows?.makeWindowBlocking(currentWindowType)
                        window.electronWindows?.showWindow(currentWindowType)

                        // Force Vue to update by using nextTick
                        await new Promise((resolve) => setTimeout(resolve, 50))
                        console.log('Final mode check:', mode.value)
                    } else {
                        console.error('Recording blob is empty after creation')
                        cleanupRecording()
                        mode.value = 'idle'
                        alert('Recording failed: No video data captured')
                        window.electron?.cancelVideoRecordingMode()
                    }
                } catch (error) {
                    console.error('Error in onstop handler:', error)
                    console.error('Error stack:', error.stack)
                    // Make sure window is still usable even if there's an error
                    cleanupRecording()
                    mode.value = 'idle'
                    const currentWindowType = windowType.value
                    window.electronWindows?.makeWindowBlocking(currentWindowType)
                    window.electronWindows?.showWindow(currentWindowType)
                    alert(`Recording error: ${error.message || 'Unknown error'}`)
                    window.electron?.cancelVideoRecordingMode()
                }
            }

            mediaRecorder.value.onerror = (event) => {
                console.error('MediaRecorder error:', event.error)
                alert(`Recording error: ${event.error?.message || 'Unknown error'}`)
                stopRecording()
            }

            console.log('Starting MediaRecorder...')
            mediaRecorder.value.start(1000)
            isRecording.value = true
            mode.value = 'recording'
            recordingStartTime.value = Date.now()
            recordingDuration.value = 0

            recordingInterval.value = setInterval(() => {
                if (isRecording.value) {
                    recordingDuration.value = Math.floor((Date.now() - recordingStartTime.value) / 1000)
                }
            }, 1000)

            console.log('Recording started successfully')

            // The window will be hidden by the service automatically
            // No need to hide here - service handles all video recording windows
        } catch (error) {
            console.error('Error starting recording:', error)
            console.error('Error stack:', error.stack)
            console.error('Error details:', {
                message: error.message,
                name: error.name,
                recordingId: recordingId.value,
                result: result
            })
            alert(`Recording failed: ${error.message || error.name || 'Unknown error'}`)
            cleanupRecording()
            isRecording.value = false
            mode.value = 'confirming'
        }
    }

    const cleanupRecording = () => {
        if (animationFrameId.value) {
            cancelAnimationFrame(animationFrameId.value)
            animationFrameId.value = null
        }

        if (videoElement.value) {
            videoElement.value.srcObject = null
            videoElement.value.onloadedmetadata = null
            videoElement.value.onerror = null
            videoElement.value = null
        }

        if (cropCanvas.value) {
            cropCanvas.value = null
        }

        if (cropStream.value) {
            cropStream.value.getTracks().forEach((track) => track.stop())
            cropStream.value = null
        }

        if (stream.value) {
            stream.value.getTracks().forEach((track) => track.stop())
            stream.value = null
        }
    }

    const stopRecording = async () => {
        if (!mediaRecorder.value || !isRecording.value) {
            console.log('stopRecording called but not recording')
            return
        }

        try {
            console.log('Stopping recording...')
            isRecording.value = false

            if (recordingInterval.value) {
                clearInterval(recordingInterval.value)
                recordingInterval.value = null
            }

            // Set mode to stopping FIRST to prevent selection screen from showing
            mode.value = 'stopping'
            console.log('Mode set to stopping:', mode.value)

            // Show window immediately before stopping (so preview can appear)
            const currentWindowType = windowType.value
            window.electronWindows?.makeWindowBlocking(currentWindowType)
            window.electronWindows?.showWindow(currentWindowType)

            // Request final data chunk before stopping
            if (mediaRecorder.value.state === 'recording' || mediaRecorder.value.state === 'paused') {
                try {
                    mediaRecorder.value.requestData()
                    await new Promise((resolve) => setTimeout(resolve, 100))
                } catch (error) {
                    console.warn('Error requesting final data:', error)
                }
            }

            // Stop the MediaRecorder
            try {
                if (mediaRecorder.value.state !== 'inactive') {
                    console.log('Stopping MediaRecorder, current state:', mediaRecorder.value.state)
                    mediaRecorder.value.stop()
                    console.log('MediaRecorder.stop() called, new state:', mediaRecorder.value.state)
                    // Wait for onstop handler to fire - it will set mode to 'previewing'
                    // Don't do anything else here, let onstop handler manage the transition
                } else {
                    console.log('MediaRecorder already inactive, state:', mediaRecorder.value.state)
                    // If already inactive, manually trigger preview if we have chunks
                    if (recordedChunks.value.length > 0) {
                        const totalSize = recordedChunks.value.reduce((sum, chunk) => sum + chunk.size, 0)
                        if (totalSize > 0) {
                            const blob = new Blob(recordedChunks.value, { type: VIDEO_CONFIG.mimeType })
                            recordedVideoBlob.value = blob
                            previewVideoUrl.value = URL.createObjectURL(blob)
                            mode.value = 'previewing'
                            cleanupRecording()
                            console.log('Manually triggered preview (MediaRecorder was inactive)')
                        } else {
                            mode.value = 'idle'
                            cleanupRecording()
                        }
                    } else {
                        mode.value = 'idle'
                        cleanupRecording()
                    }
                }
            } catch (error) {
                console.error('Error stopping MediaRecorder:', error)
                // If stopping fails, manually trigger cleanup
                cleanupRecording()
                mode.value = 'idle'
                window.electronWindows?.makeWindowBlocking(currentWindowType)
                window.electronWindows?.showWindow(currentWindowType)
            }

            if (recordingId.value) {
                try {
                    await window.electron?.stopVideoRecording(recordingId.value)
                } catch (error) {
                    console.error('Error calling stopVideoRecording:', error)
                }
                recordingId.value = null
            }

            // Timeout safety: if preview doesn't appear within 5 seconds, show error
            setTimeout(() => {
                if (mode.value === 'stopping' && !previewVideoUrl.value) {
                    console.error('Preview timeout - forcing cleanup')
                    mode.value = 'idle'
                    window.electronWindows?.makeWindowBlocking(currentWindowType)
                    window.electronWindows?.showWindow(currentWindowType)
                    alert('Recording stopped but preview failed to load. Please try again.')
                    window.electron?.cancelVideoRecordingMode()
                }
            }, 5000)
        } catch (error) {
            console.error('Error in stopRecording:', error)
            // Ensure window is still usable
            isRecording.value = false
            mode.value = 'idle'
            const currentWindowType = windowType.value
            window.electronWindows?.makeWindowBlocking(currentWindowType)
            window.electronWindows?.showWindow(currentWindowType)
            cleanupRecording()
        }
    }

    const saveRecording = async () => {
        if (!recordedVideoBlob.value) return

        try {
            const arrayBuffer = await recordedVideoBlob.value.arrayBuffer()
            const buffer = Array.from(new Uint8Array(arrayBuffer))

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
            const filename = `Recording_${timestamp}.webm`

            const result = await window.electron?.invoke('save-video-recording', {
                buffer,
                filename
            })

            if (result?.success) {
                console.log('Recording saved successfully:', result.path)
                handleClosePreview()
            } else {
                console.error('Failed to save recording:', result?.error)
            }

            return result || { success: false }
        } catch (error) {
            console.error('Error saving recording:', error)
            return { success: false, error: error.message }
        }
    }

    const handleDeleteRecording = () => {
        if (previewVideoUrl.value) {
            URL.revokeObjectURL(previewVideoUrl.value)
            previewVideoUrl.value = null
        }
        recordedVideoBlob.value = null
        recordedVideoPath.value = null
        mode.value = 'idle'
        window.electron?.cancelVideoRecordingMode()
    }

    const handleClosePreview = () => {
        if (previewVideoUrl.value) {
            URL.revokeObjectURL(previewVideoUrl.value)
            previewVideoUrl.value = null
        }
        recordedVideoBlob.value = null
        recordedVideoPath.value = null
        mode.value = 'idle'
        window.electron?.cancelVideoRecordingMode()
    }

    const handleCancel = () => {
        if (isRecording.value) {
            stopRecording()
        }
        window.electron?.cancelVideoRecordingMode()
    }

    const handleEscapeKeyCancel = (event) => {
        if (event.key === 'Escape') {
            if (isRecording.value) {
                stopRecording()
            } else if (mode.value === 'previewing') {
                handleDeleteRecording()
            } else if (mode.value === 'stopping') {
                // Allow escape even during stopping to cancel
                mode.value = 'idle'
                window.electron?.cancelVideoRecordingMode()
            } else {
                handleCancel()
            }
        } else if (event.key === ' ' && isRecording.value) {
            event.preventDefault()
            stopRecording()
        }
    }

    onMounted(async () => {
        const params = new URLSearchParams(window.location.search)
        displayId.value = params.get('displayId')
        mouseX.value = parseInt(params.get('initialMouseX') || '0', 10)
        mouseY.value = parseInt(params.get('initialMouseY') || '0', 10)

        document.addEventListener('keydown', handleEscapeKeyCancel)

        // Listen for global Space shortcut to stop recording
        stopRecordingShortcutCallback.value = () => {
            if (isRecording.value) {
                stopRecording()
            }
        }
        window.electron?.ipcRenderer?.on('stop-recording-shortcut', stopRecordingShortcutCallback.value)

        window.electronWindows?.onDisplayActivationChanged?.((activationData) => {
            isWindowActive.value = activationData.isActive

            if (activationData.isActive) {
                magnifierActive.value = shouldShowMagnifier.value
                mouseX.value = Math.max(0, Math.min(activationData.mouseX, window.innerWidth))
                mouseY.value = Math.max(0, Math.min(activationData.mouseY, window.innerHeight))

                if (mode.value === 'idle') {
                    updateMagnifier(mouseX.value, mouseY.value)
                }
            } else {
                magnifierActive.value = false
            }
        })

        const processMagnifierData = (dataURL) => {
            if (!dataURL) return
            const img = new Image()
            img.src = dataURL
            img.onload = () => {
                fullScreenImage.value = img
                if (mouseX.value || mouseY.value) {
                    updateMagnifier(mouseX.value, mouseY.value)
                }
            }
            img.onerror = (e) => console.error('Error loading magnifier image from data URL:', e)
        }

        try {
            const handlerKey = `get-initial-magnifier-data-${displayId.value}`
            const initialDataURL = await window.electron?.invoke(handlerKey)
            processMagnifierData(initialDataURL)
        } catch (error) {
            console.error('Failed to get initial magnifier data:', error)
        }
    })

    onUnmounted(() => {
        document.removeEventListener('keydown', handleEscapeKeyCancel)
        window.electronWindows?.removeDisplayActivationChangedListener?.()
        if (stopRecordingShortcutCallback.value) {
            window.electron?.ipcRenderer?.removeListener('stop-recording-shortcut', stopRecordingShortcutCallback.value)
        }
        stopRecording()
        cleanupRecording()
    })
</script>

<template>
    <div
        :class="{
            'cursor-crosshair select-none': mode !== 'recording' && mode !== 'previewing',
            'pointer-events-none': isRecording
        }"
        class="fixed top-0 left-0 h-screen w-screen"
        :style="{
            backgroundImage: fullScreenImage ? `url(${fullScreenImage.src})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'top left',
            backgroundRepeat: 'no-repeat'
        }"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp">
        <!-- Dark overlay for everything outside the selection (only when confirming, not recording) -->
        <div
            v-if="mode === 'confirming'"
            class="pointer-events-none absolute top-0 left-0 h-full w-full bg-black/50"
            :style="{
                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${
                    selectionRect.left
                }px ${selectionRect.top}px, ${selectionRect.left}px ${
                    selectionRect.top + selectionRect.height
                }px, ${selectionRect.left + selectionRect.width}px ${
                    selectionRect.top + selectionRect.height
                }px, ${selectionRect.left + selectionRect.width}px ${
                    selectionRect.top
                }px, ${selectionRect.left}px ${selectionRect.top}px)`
            }"></div>

        <!-- Red border overlay when recording partial screen - Hidden when recording starts (window is hidden) -->

        <!-- Selection rectangle -->
        <div
            v-if="mode !== 'idle' && mode !== 'recording' && mode !== 'previewing' && mode !== 'stopping'"
            :class="[
                'absolute',
                mode === 'selecting'
                    ? `${selectionBorderClass} pointer-events-none`
                    : mode === 'confirming' || mode === 'resizing' || mode === 'moving'
                      ? 'animated-dashed-border pointer-events-all'
                      : 'animated-dashed-border pointer-events-none',
                mode === 'confirming' ? 'cursor-move' : ''
            ]"
            :style="{
                left: `${selectionRect.left}px`,
                top: `${selectionRect.top}px`,
                width: `${selectionRect.width}px`,
                height: `${selectionRect.height}px`,
                zIndex: 40
            }"
            @mousedown="handleSelectionMouseDown">
            <!-- Resize handles -->
            <div v-if="mode === 'confirming' || mode === 'resizing'">
                <div
                    class="pointer-events-all absolute -top-[5px] -left-[5px] h-[10px] w-[10px] cursor-nwse-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'top-left')"></div>
                <div
                    class="pointer-events-all absolute -top-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 cursor-ns-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'top')"></div>
                <div
                    class="pointer-events-all absolute -top-[5px] -right-[5px] h-[10px] w-[10px] cursor-nesw-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'top-right')"></div>
                <div
                    class="pointer-events-all absolute top-1/2 -right-[5px] h-[10px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'right')"></div>
                <div
                    class="pointer-events-all absolute -right-[5px] -bottom-[5px] h-[10px] w-[10px] cursor-nwse-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom-right')"></div>
                <div
                    class="pointer-events-all absolute -bottom-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 cursor-ns-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom')"></div>
                <div
                    class="pointer-events-all absolute -bottom-[5px] -left-[5px] h-[10px] w-[10px] cursor-nesw-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom-left')"></div>
                <div
                    class="pointer-events-all absolute top-1/2 -left-[5px] h-[10px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'left')"></div>
            </div>
        </div>

        <!-- Instructions (only show on active window) -->
        <div
            v-if="mode === 'idle' && isWindowActive"
            class="pointer-events-none fixed top-1/2 left-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select an area or click to record full screen</p>
        </div>

        <!-- Crosshair -->
        <div
            v-if="shouldShowCrosshair && mode !== 'confirming' && mode !== 'recording' && isWindowActive"
            class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-[99] h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div
            v-if="shouldShowCrosshair && mode !== 'confirming' && mode !== 'recording' && isWindowActive"
            class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-[99] w-px transition-none"
            :style="{ left: mouseX + 'px' }" />

        <!-- Magnifier -->
        <div
            v-if="shouldShowMagnifier && magnifierActive"
            class="pointer-events-none fixed z-[101] flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
            :style="magnifierStyle">
            <canvas
                ref="magnifierCanvas"
                class="h-full w-full"
                :width="magnifierSize"
                :height="magnifierSize"></canvas>
            <div
                v-if="mode === 'selecting' || mode === 'resizing'"
                class="absolute -top-[30px] left-1/2 -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white">
                <p>{{ Math.round(selectionRect.width) }} x {{ Math.round(selectionRect.height) }}</p>
            </div>
        </div>

        <!-- Recording Toolbar (when recording) - Compact toolbar with timer and stop button -->
        <div
            v-if="isRecording"
            class="pointer-events-auto fixed top-4 left-1/2 z-[200] -translate-x-1/2">
            <div class="flex items-center gap-3 rounded-full bg-black/90 px-6 py-3 shadow-2xl backdrop-blur-sm">
                <!-- Recording indicator -->
                <div class="flex items-center gap-2">
                    <div class="h-3 w-3 animate-pulse rounded-full bg-red-500"></div>
                    <span class="text-sm font-semibold text-white">Recording</span>
                    <span class="font-mono text-sm text-white">{{ formatDuration(recordingDuration) }}</span>
                </div>

                <!-- Stop button -->
                <button
                    @click="stopRecording"
                    class="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-white transition-all hover:scale-105 hover:bg-red-600 active:scale-95">
                    <svg
                        class="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor">
                        <rect
                            x="6"
                            y="6"
                            width="12"
                            height="12"
                            rx="2" />
                    </svg>
                    <span class="text-sm font-bold">Stop</span>
                    <span class="text-xs opacity-75">(Space)</span>
                </button>
            </div>
        </div>

        <!-- Action Toolbar (when confirming) - Start Recording button -->
        <div
            v-if="mode === 'confirming'"
            class="pointer-events-auto absolute z-50 flex items-center gap-4 rounded-full bg-white/90 px-4 py-2 shadow-lg"
            :style="toolbarStyle">
            <button
                @click="startRecording"
                class="flex items-center gap-2 rounded-full bg-red-500 px-6 py-2 text-white transition-colors hover:bg-red-600">
                <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor">
                    <circle
                        cx="12"
                        cy="12"
                        r="10" />
                </svg>
                <span class="font-semibold">Start Recording</span>
            </button>

            <button
                @click="handleCancel"
                class="rounded-full bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300">
                Cancel
            </button>
        </div>

        <!-- Preview Screen (after recording) -->
        <div
            v-if="mode === 'previewing'"
            class="fixed inset-0 z-[200] flex items-center justify-center bg-black/90">
            <div class="relative mx-4 w-full max-w-4xl">
                <!-- Video Preview -->
                <div
                    v-if="previewVideoUrl"
                    class="relative overflow-hidden rounded-lg bg-black shadow-2xl">
                    <video
                        :src="previewVideoUrl"
                        controls
                        autoplay
                        class="h-auto max-h-[70vh] w-full"
                        @loadedmetadata="() => console.log('Video loaded')">
                        Your browser does not support the video tag.
                    </video>
                </div>

                <!-- Loading state if preview URL is not ready yet -->
                <div
                    v-else
                    class="relative overflow-hidden rounded-lg bg-black p-12 shadow-2xl">
                    <div class="text-center">
                        <div
                            class="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
                        <p class="text-lg font-semibold text-white">Loading preview...</p>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div
                    v-if="previewVideoUrl"
                    class="mt-6 flex items-center justify-center gap-4">
                    <button
                        @click="handleDeleteRecording"
                        class="flex items-center gap-2 rounded-full bg-gray-700 px-6 py-3 text-white transition-all hover:scale-105 hover:bg-gray-600">
                        <svg
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2">
                            <path
                                d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                        <span class="font-semibold">Delete</span>
                    </button>

                    <button
                        @click="saveRecording"
                        class="flex items-center gap-2 rounded-full bg-green-500 px-6 py-3 text-white transition-all hover:scale-105 hover:bg-green-600">
                        <svg
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2">
                            <path
                                d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                            <path
                                d="M17 21v-8H7v8"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                            <path
                                d="M7 3v5h8"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                        <span class="font-semibold">Save</span>
                    </button>
                </div>

                <!-- Instruction text -->
                <p
                    v-if="previewVideoUrl"
                    class="mt-4 text-center text-sm text-gray-400">
                    Press <kbd class="rounded bg-gray-800 px-2 py-1">Esc</kbd> to cancel
                </p>
            </div>
        </div>

        <!-- Loading Screen (when stopping) -->
        <div
            v-if="mode === 'stopping'"
            class="fixed inset-0 z-[200] flex items-center justify-center bg-black/90">
            <div class="text-center">
                <div
                    class="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
                <p class="text-lg font-semibold text-white">Processing recording...</p>
                <p class="mt-2 text-sm text-gray-400">Please wait</p>
            </div>
        </div>
    </div>
</template>
