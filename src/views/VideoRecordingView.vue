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
    const processingProgress = ref(0)

    // Recording state
    const isRecording = ref(false)
    const recordingId = ref(null)
    const mediaRecorder = ref(null)
    const recordedChunks = ref([])
    const recordingStartTime = ref(null)
    const recordingDuration = ref(0)
    const recordingInterval = ref(null)
    const stream = ref(null)
    const stopRecordingShortcutCallback = ref(null)
    const cropBounds = ref(null) // Store crop bounds for post-processing

    // Video recording configuration
    const VIDEO_CONFIG = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000,
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
        try {
            const { left, top, width, height } = selectionRect.value
            const isFullScreenSelection = isFullScreen.value

            // Store crop bounds for post-processing if custom area
            if (!isFullScreenSelection) {
                cropBounds.value = { left, top, width, height }
            } else {
                cropBounds.value = null
            }

            // Always request full screen recording (backend returns full screen source)
            const result = await window.electron?.startVideoRecording({
                type: 'fullscreen',
                displayId: displayId.value || null,
                isFullScreen: true
            })

            if (!result?.success) {
                alert(`Failed to start recording: ${result?.error || 'Unknown error'}`)
                return
            }

            if (!result.sourceId || !result.recordingId) {
                alert('Failed to start recording: Missing source or recording ID')
                return
            }

            recordingId.value = result.recordingId

            // Get media stream from screen
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: result.sourceId
                    }
                }
            }

            stream.value = await navigator.mediaDevices.getUserMedia(constraints)

            if (!stream.value?.getVideoTracks().length) {
                throw new Error('Failed to get video stream')
            }

            // Create MediaRecorder with the full screen stream
            mediaRecorder.value = new MediaRecorder(stream.value, VIDEO_CONFIG)
            recordedChunks.value = []

            // Handle data available
            mediaRecorder.value.ondataavailable = (event) => {
                if (event.data?.size > 0) {
                    recordedChunks.value.push(event.data)
                }
            }

            // Handle recording stop
            mediaRecorder.value.onstop = async () => {
                try {
                    console.log('MediaRecorder onstop handler started')
                    
                    // Show window immediately
                    const currentWindowType = windowType.value
                    window.electronWindows?.makeWindowBlocking(currentWindowType)
                    window.electronWindows?.showWindow(currentWindowType)

                    // Wait for all chunks to be collected
                    await new Promise((resolve) => setTimeout(resolve, 300))

                    if (recordedChunks.value.length === 0) {
                        throw new Error('No video data captured')
                    }

                    console.log('Creating blob from', recordedChunks.value.length, 'chunks')
                    
                    // Create blob from recorded chunks
                    let blob = new Blob(recordedChunks.value, { type: VIDEO_CONFIG.mimeType })
                    console.log('Blob created, size:', blob.size)

                    // If custom area, crop the video
                    if (cropBounds.value) {
                        console.log('Custom area detected, starting crop...')
                        try {
                            blob = await cropVideo(blob, cropBounds.value)
                            console.log('Crop completed, new blob size:', blob.size)
                        } catch (cropError) {
                            console.error('Crop error:', cropError)
                            throw new Error(`Crop failed: ${cropError.message}`)
                        }
                    }

                    // Set preview
                    recordedVideoBlob.value = blob
                    previewVideoUrl.value = URL.createObjectURL(blob)
                    mode.value = 'previewing'

                    // Cleanup streams
                    cleanupRecording()
                    console.log('Recording processed successfully')
                } catch (error) {
                    console.error('Error processing recording:', error)
                    console.error('Error stack:', error.stack)
                    cleanupRecording()
                    mode.value = 'idle'
                    alert(`Recording error: ${error.message || 'Unknown error'}`)
                    window.electron?.cancelVideoRecordingMode()
                }
            }

            mediaRecorder.value.onerror = (event) => {
                console.error('MediaRecorder error:', event.error)
                alert(`Recording error: ${event.error?.message || 'Unknown error'}`)
                stopRecording()
            }

            // Start MediaRecorder
            mediaRecorder.value.start(500)

            isRecording.value = true
            mode.value = 'recording'
            recordingStartTime.value = Date.now()
            recordingDuration.value = 0

            // Update duration timer
            recordingInterval.value = setInterval(() => {
                if (isRecording.value) {
                    recordingDuration.value = Math.floor((Date.now() - recordingStartTime.value) / 1000)
                }
            }, 1000)
        } catch (error) {
            console.error('Error starting recording:', error)
            alert(`Recording failed: ${error.message || 'Unknown error'}`)
            cleanupRecording()
            isRecording.value = false
            mode.value = 'confirming'
        }
    }

    // Crop video using FFmpeg (FAST!)
    const cropVideo = async (videoBlob, bounds) => {
        let tempInputPath = null
        let tempOutputPath = null

        try {
            processingProgress.value = 0

            // Listen for progress updates from FFmpeg
            const progressHandler = (progress) => {
                processingProgress.value = progress
            }
            window.electron.onFFmpegProgress(progressHandler)

            // Step 1: Create temp file path
            console.log('Step 1: Creating temp file path')
            let pathResult
            try {
                pathResult = await window.electron.createTempVideoPath()
            } catch (e) {
                console.error('IPC ERROR in createTempVideoPath:', e)
                throw new Error(`IPC call failed (createTempVideoPath): ${e.message}`)
            }
            if (!pathResult.success) {
                throw new Error('Failed to create temp path')
            }
            tempInputPath = pathResult.path
            console.log('Temp path created:', tempInputPath)

            // Step 2: Write video to temp file in chunks (avoid IPC size limits)
            console.log('Starting to write video chunks...')
            const arrayBuffer = await videoBlob.arrayBuffer()
            console.log('ArrayBuffer size:', arrayBuffer.byteLength)
            
            const uint8Array = new Uint8Array(arrayBuffer)
            const chunkSize = 64 * 1024 // 64KB chunks (very safe for IPC)
            const totalChunks = Math.ceil(uint8Array.length / chunkSize)
            console.log('Total chunks to write:', totalChunks, 'chunk size:', chunkSize)

            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize
                const end = Math.min(start + chunkSize, uint8Array.length)
                const chunkTypedArray = uint8Array.slice(start, end)
                // Convert Uint8Array to plain array for IPC compatibility
                const chunkArray = Array.from(chunkTypedArray)
                
                console.log(`Writing chunk ${i + 1}/${totalChunks}, size: ${chunkArray.length}`)
                
                let writeResult
                try {
                    writeResult = await window.electron.writeVideoChunk({
                        filePath: tempInputPath,
                        chunk: chunkArray,
                        isFirst: i === 0
                    })
                } catch (e) {
                    console.error(`IPC ERROR in writeVideoChunk (chunk ${i + 1}/${totalChunks}):`, e)
                    throw new Error(`IPC call failed (writeVideoChunk chunk ${i + 1}): ${e.message}`)
                }
                
                if (!writeResult.success) {
                    throw new Error('Failed to write video chunk ' + (i + 1))
                }
            }
            console.log('All chunks written successfully')

            // Step 3: Crop video with FFmpeg
            console.log('Step 3: Calling FFmpeg crop with bounds:', bounds)
            
            // Create a plain object for IPC (avoid non-serializable properties)
            const plainBounds = {
                left: Number(bounds.left),
                top: Number(bounds.top),
                width: Number(bounds.width),
                height: Number(bounds.height)
            }
            
            const cropResult = await window.electron.cropVideoFFmpeg({
                inputPath: tempInputPath,
                cropBounds: plainBounds,
                displayWidth: Number(window.innerWidth),
                displayHeight: Number(window.innerHeight)
            })
            console.log('FFmpeg crop result:', cropResult)

            if (!cropResult.success) {
                throw new Error(cropResult.error || 'Failed to crop video')
            }
            tempOutputPath = cropResult.outputPath

            // Step 4: Get file size for memory-efficient chunked reading
            console.log('Step 4: Getting cropped video file size')
            const sizeResult = await window.electron.getFileSize(tempOutputPath)
            if (!sizeResult.success) {
                throw new Error('Failed to get file size: ' + sizeResult.error)
            }
            const fileSize = sizeResult.size
            console.log('Cropped video size:', fileSize, 'bytes')

            // Step 5: Read video in chunks (memory-efficient, prevents OOM)
            console.log('Step 5: Reading cropped video in chunks')
            const readChunkSize = 256 * 1024 // 256KB chunks for reading
            const chunks = []
            let position = 0
            
            while (position < fileSize) {
                const length = Math.min(readChunkSize, fileSize - position)
                const chunkResult = await window.electron.readFileChunk({
                    filePath: tempOutputPath,
                    start: position,
                    length: length
                })
                
                if (!chunkResult.success) {
                    throw new Error('Failed to read chunk: ' + chunkResult.error)
                }
                
                chunks.push(new Uint8Array(chunkResult.chunk))
                position += chunkResult.bytesRead
                
                const progress = Math.round(position/fileSize*100)
                if (progress % 10 === 0) {
                    console.log(`Reading: ${progress}%`)
                }
            }
            
            const croppedBlob = new Blob(chunks, { type: VIDEO_CONFIG.mimeType })
            console.log('Cropped blob created, size:', croppedBlob.size)

            // Step 6: Cleanup temp files
            await window.electron.cleanupTempFiles([tempInputPath, tempOutputPath])

            // Cleanup progress listener
            window.electron.removeFFmpegProgressListener()

            return croppedBlob
        } catch (error) {
            // Cleanup on error
            if (tempInputPath || tempOutputPath) {
                const filesToClean = [tempInputPath, tempOutputPath].filter(Boolean)
                await window.electron.cleanupTempFiles(filesToClean)
            }
            window.electron.removeFFmpegProgressListener()
            throw error
        }
    }

    const cleanupRecording = () => {
        if (stream.value) {
            stream.value.getTracks().forEach((track) => track.stop())
            stream.value = null
        }
    }

    const stopRecording = async () => {
        if (!mediaRecorder.value || !isRecording.value) return

        try {
            isRecording.value = false

            if (recordingInterval.value) {
                clearInterval(recordingInterval.value)
                recordingInterval.value = null
            }

            mode.value = 'stopping'

            // Show window
            const currentWindowType = windowType.value
            window.electronWindows?.makeWindowBlocking(currentWindowType)
            window.electronWindows?.showWindow(currentWindowType)

            // Request final data and stop
            if (mediaRecorder.value.state === 'recording') {
                mediaRecorder.value.requestData()
                await new Promise((resolve) => setTimeout(resolve, 100))
            }

            if (mediaRecorder.value.state !== 'inactive') {
                mediaRecorder.value.stop()
            }

            if (recordingId.value) {
                await window.electron?.stopVideoRecording(recordingId.value)
                recordingId.value = null
            }
        } catch (error) {
            console.error('Error stopping recording:', error)
            isRecording.value = false
            mode.value = 'idle'
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
            class="pointer-events-none fixed top-1/2 left-1/2 z-100 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select an area or click to record full screen</p>
        </div>

        <!-- Crosshair -->
        <div
            v-if="shouldShowCrosshair && mode !== 'confirming' && mode !== 'recording' && isWindowActive"
            class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-99 h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div
            v-if="shouldShowCrosshair && mode !== 'confirming' && mode !== 'recording' && isWindowActive"
            class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-99 w-px transition-none"
            :style="{ left: mouseX + 'px' }" />

        <!-- Magnifier -->
        <div
            v-if="shouldShowMagnifier && magnifierActive"
            class="pointer-events-none fixed z-101 flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
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
            class="pointer-events-auto fixed top-4 left-1/2 z-200 -translate-x-1/2">
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
            class="fixed inset-0 z-200 flex items-center justify-center bg-black/90">
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
            class="fixed inset-0 z-200 flex items-center justify-center bg-black/90">
            <div class="text-center">
                <div
                    class="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
                <p class="text-lg font-semibold text-white">Processing recording...</p>
                <p
                    v-if="processingProgress > 0"
                    class="mt-2 text-xl font-bold text-green-400">
                    {{ processingProgress }}%
                </p>
                <p class="mt-2 text-sm text-gray-400">Please wait</p>
            </div>
        </div>
    </div>
</template>
