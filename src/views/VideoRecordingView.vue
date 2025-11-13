<script setup>
    import { ref, onMounted, onUnmounted, computed } from 'vue'
    import { useStore } from '../store'

    const store = useStore()

    const loading = ref(false)
    // Core selection state
    const startX = ref(0)
    const startY = ref(0)
    const endX = ref(0)
    const endY = ref(0)
    const mouseX = ref(0)
    const mouseY = ref(0)
    const displayId = ref(null)
    const mode = ref('idle') // 'idle', 'selecting', 'resizing', 'confirming', 'editing', 'moving'
    const resizingHandle = ref(null)

    // Dragging state
    const dragStartMouseX = ref(0)
    const dragStartMouseY = ref(0)
    const dragStartSelectionX = ref(0)
    const dragStartSelectionY = ref(0)

    // Magnifier state
    const magnifierActive = ref(false) // Will be activated when window is active
    const isWindowActive = ref(false) // Track if this window is currently active
    const magnifierSize = 200
    const zoomFactor = 2
    const magnifierCanvas = ref(null)
    const fullScreenImage = ref(null)

    const selectionRect = computed(() => {
        const left = Math.min(startX.value, endX.value)
        const top = Math.min(startY.value, endY.value)
        const width = Math.abs(endX.value - startX.value)
        const height = Math.abs(endY.value - startY.value)
        return { left, top, width, height }
    })

    // Settings computed properties
    const shouldShowMagnifier = computed(() => {
        return store.settings.showMagnifier !== false
    })

    const shouldShowCrosshair = computed(() => {
        return store.settings.showCrosshair === true
    })

    const selectionBorderClass = computed(() => {
        if (mode.value !== 'selecting') return 'animated-dashed-border'

        // If crosshair is disabled, show all borders
        if (!shouldShowCrosshair.value) {
            return 'animated-dashed-border'
        }

        // Determine drag direction to hide borders where crosshair is located
        // This only applies when crosshair is enabled
        const draggingRight = endX.value >= startX.value
        const draggingDown = endY.value >= startY.value

        if (draggingRight && draggingDown) {
            // Mouse at bottom-right, hide right and bottom borders
            return 'animated-dashed-border-selecting-top-left'
        } else if (!draggingRight && draggingDown) {
            // Mouse at bottom-left, hide left and bottom borders
            return 'animated-dashed-border-selecting-top-right'
        } else if (draggingRight && !draggingDown) {
            // Mouse at top-right, hide right and top borders
            return 'animated-dashed-border-selecting-bottom-left'
        } else {
            // Mouse at top-left, hide left and top borders
            return 'animated-dashed-border-selecting-bottom-right'
        }
    })

    const magnifierStyle = computed(() => {
        const offset = 10
        let left = mouseX.value + offset
        let top = mouseY.value + offset

        // Keep magnifier on screen
        if (left + magnifierSize > window.innerWidth) {
            left = mouseX.value - magnifierSize - offset
        }
        if (top + magnifierSize > window.innerHeight) {
            top = mouseY.value - magnifierSize - offset
        }

        return { left: `${left}px`, top: `${top}px` }
    })

    // Toolbar dragging state
    const customToolbarPosition = ref(null)
    const isDraggingToolbar = ref(false)
    const toolbarDragStart = ref({ x: 0, y: 0 })

    const toolbarStyle = computed(() => {
        // If user has custom position, use that
        if (customToolbarPosition.value) {
            return {
                left: `${customToolbarPosition.value.x}px`,
                top: `${customToolbarPosition.value.y}px`
            }
        }

        // Otherwise, use automatic positioning
        const { left, top, width, height } = selectionRect.value
        const toolbarWidth = 400
        const margin = 10

        // Center toolbar horizontally, keep on screen
        let toolbarLeft = Math.max(
            margin,
            Math.min(left + width / 2 - toolbarWidth / 2, window.innerWidth - toolbarWidth - margin)
        )

        // Position toolbar below selection, or inside if no space
        const toolbarTop = top + height + 70 > window.innerHeight ? top + height - 60 : top + height + 10

        return { left: `${toolbarLeft}px`, top: `${toolbarTop}px` }
    })

    const handleMouseDown = async (e) => {
        if (mode.value === 'confirming' || mode.value === 'editing' || mode.value === 'edited') return

        // Close other screenshot windows when user starts selecting on this monitor
        try {
            await window.electronWindows?.closeOtherVideoRecordingWindows(displayId.value)
        } catch (error) {
            console.error('Error closing other screenshot windows:', error)
        }

        // Ensure this window is active when user starts selecting
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

            // Keep selection within window bounds
            const constrainedLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width))
            const constrainedTop = Math.max(0, Math.min(newTop, window.innerHeight - height))

            startX.value = constrainedLeft
            startY.value = constrainedTop
            endX.value = constrainedLeft + width
            endY.value = constrainedTop + height
        }

        // Only update magnifier if this window is active
        if (isWindowActive.value && magnifierActive.value) {
            updateMagnifier(e.clientX, e.clientY)
        }
    }

    const handleMouseUp = () => {
        if (mode.value === 'selecting') {
            magnifierActive.value = false
            const { width, height } = selectionRect.value

            // If it's a click (no drag), select full screen
            if (width < 10 && height < 10) {
                startX.value = startY.value = 0
                endX.value = window.innerWidth
                endY.value = window.innerHeight
            }

            // Normalize coordinates so start is always top-left and end is always bottom-right
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

            // Normalize coordinates after resizing to prevent flipped state issues
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

        // Wait for image to be loaded
        if (!fullScreenImage.value.complete || fullScreenImage.value.naturalWidth === 0) {
            fullScreenImage.value.onload = () => updateMagnifier(x, y)
            return
        }

        try {
            const canvas = magnifierCanvas.value
            const ctx = canvas.getContext('2d', { alpha: false })
            if (!ctx) return

            // Clear and setup canvas
            ctx.imageSmoothingEnabled = false
            ctx.clearRect(0, 0, magnifierSize, magnifierSize)

            // Map cursor position in view space to image space
            const img = fullScreenImage.value
            const imgW = img.naturalWidth
            const imgH = img.naturalHeight
            const viewW = window.innerWidth
            const viewH = window.innerHeight
            const scaleX = imgW / viewW
            const scaleY = imgH / viewH

            // Desired source rectangle centered on cursor
            const sourceSizeView = magnifierSize / zoomFactor
            const sourceWImg = sourceSizeView * scaleX
            const sourceHImg = sourceSizeView * scaleY
            const centerXImg = x * scaleX
            const centerYImg = y * scaleY
            const desiredLeft = centerXImg - sourceWImg / 2
            const desiredTop = centerYImg - sourceHImg / 2
            const desiredRight = desiredLeft + sourceWImg
            const desiredBottom = desiredTop + sourceHImg

            // Intersect with image bounds to support edges/corners
            const interLeft = Math.max(0, desiredLeft)
            const interTop = Math.max(0, desiredTop)
            const interRight = Math.min(imgW, desiredRight)
            const interBottom = Math.min(imgH, desiredBottom)
            const interW = Math.max(0, interRight - interLeft)
            const interH = Math.max(0, interBottom - interTop)

            // create an offscreen canvas for pattern
            const patternCanvas = document.createElement('canvas')
            const size = 10 // size of each square
            patternCanvas.width = size * 2
            patternCanvas.height = size * 2

            const pctx = patternCanvas.getContext('2d')

            // colors
            const color1 = '#eee' // light gray
            const color2 = '#ccc' // darker gray

            // draw squares
            pctx.fillStyle = color1
            pctx.fillRect(0, 0, size * 2, size * 2)

            pctx.fillStyle = color2
            pctx.fillRect(0, 0, size, size)
            pctx.fillRect(size, size, size, size)

            // create pattern
            const pattern = ctx.createPattern(patternCanvas, 'repeat')

            // Fill background so out-of-bounds area shows as blank
            ctx.fillStyle = pattern
            ctx.fillRect(0, 0, magnifierSize, magnifierSize)

            if (interW > 0 && interH > 0) {
                // Position the sampled image so the cursor stays centered
                const destX = ((interLeft - desiredLeft) / sourceWImg) * magnifierSize
                const destY = ((interTop - desiredTop) / sourceHImg) * magnifierSize
                const destW = (interW / sourceWImg) * magnifierSize
                const destH = (interH / sourceHImg) * magnifierSize

                ctx.drawImage(img, interLeft, interTop, interW, interH, destX, destY, destW, destH)
            }

            // Draw crosshair
            const center = magnifierSize / 2
            ctx.strokeStyle = 'white'
            ctx.lineWidth = 4 // This will create the white border
            ctx.beginPath()
            ctx.moveTo(center, 0)
            ctx.lineTo(center, magnifierSize)
            ctx.moveTo(0, center)
            ctx.lineTo(magnifierSize, center)
            ctx.stroke()

            ctx.strokeStyle = 'black'
            ctx.lineWidth = 2 // This will be the black line inside the white border
            ctx.beginPath()
            ctx.moveTo(center, 0)
            ctx.lineTo(center, magnifierSize)
            ctx.moveTo(0, center)
            ctx.lineTo(magnifierSize, center)
            ctx.stroke()
        } catch (error) {
            // console.warn('Magnifier error:', error)
            alert(error)
        }
    }

    const isRecording = ref(false)

    const recordedChunks = ref([])
    const mediaRecorder = ref(null)

    // Audio state
    const microphones = ref([])
    const selectedMicrophone = ref(null)
    const isEnumeratingDevices = ref(false)

    // Action handlers
    const handleStart = async () => {
        const { left, top, width, height } = selectionRect.value
        const isFullScreen = width === window.innerWidth && height === window.innerHeight

        try {
            const result = await window.electron?.startVideoRecording(displayId.value, isFullScreen, {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(width),
                height: Math.round(height)
            })

            if (result?.success) {
                console.log('Video recording source obtained:', result.source)
                isRecording.value = true
                recordedChunks.value = [] // Clear any previous chunks

                // Validate source
                if (!result.source || !result.source.id) {
                    throw new Error('Invalid recording source received')
                }

                // Sanitize source ID to avoid IPC issues
                const sourceId = String(result.source.id).trim()
                if (!sourceId || sourceId.length === 0) {
                    throw new Error('Empty or invalid source ID')
                }

                console.log('Using source ID:', sourceId)

                // Additional validation for source
                if (typeof sourceId !== 'string' || sourceId.length < 10) {
                    console.warn('Source ID looks suspicious:', sourceId)
                }

                // Resize window to fit only the toolbar when recording starts
                setTimeout(() => {
                    const toolbar = document.querySelector('.toolbar-container')
                    if (toolbar) {
                        const rect = toolbar.getBoundingClientRect()
                        const toolbarWidth = rect.width + 40 // Add some padding
                        const toolbarHeight = rect.height + 40 // Add some padding

                        window.electronWindows?.resizeWindow?.(displayId.value, toolbarWidth, toolbarHeight)
                    }
                }, 100)

                // Set up screen recording with selected microphone
                console.log('Setting up screen recording...')

                // Build audio constraints for selected microphone
                let audioConstraints = false
                if (selectedMicrophone.value) {
                    audioConstraints = {
                        deviceId: selectedMicrophone.value.deviceId
                    }
                    console.log('Recording with microphone:', selectedMicrophone.value.label)
                } else {
                    console.log('Recording without microphone audio')
                }

                // Get separate streams and combine them to avoid IPC issues
                console.log('Setting up combined screen + audio recording...')

                let videoStream = null
                let audioStream = null
                let combinedStream = null

                try {
                    // Get video stream first
                    const videoConstraints = {
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: sourceId
                            }
                        }
                    }

                    console.log('Getting video stream...')
                    videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints)
                    console.log('Video stream obtained')

                    // Get audio stream if microphone selected
                    if (selectedMicrophone.value) {
                        const audioConstraints = {
                            audio: {
                                deviceId: selectedMicrophone.value.deviceId
                            }
                        }

                        console.log('Getting audio stream...')
                        audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints)
                        console.log('Audio stream obtained')
                    }

                    // Combine streams
                    const tracks = []
                    if (videoStream) {
                        tracks.push(...videoStream.getVideoTracks())
                    }
                    if (audioStream) {
                        tracks.push(...audioStream.getAudioTracks())
                    }

                    combinedStream = new MediaStream(tracks)
                    console.log(`Combined stream created with ${tracks.length} tracks`)
                } catch (mediaError) {
                    console.error('Failed to get media streams:', mediaError)

                    // Clean up any streams that were created
                    if (videoStream) {
                        videoStream.getTracks().forEach((track) => track.stop())
                    }
                    if (audioStream) {
                        audioStream.getTracks().forEach((track) => track.stop())
                    }

                    throw new Error(`Media access failed: ${mediaError.message}`)
                }

                // Basic stream validation
                try {
                    const tracks = combinedStream.getTracks()
                    console.log(`Stream has ${tracks.length} total tracks`)

                    const videoTracks = tracks.filter((track) => track.kind === 'video')
                    if (videoTracks.length === 0) {
                        throw new Error('No video track available')
                    }

                    console.log('Stream validation passed')
                } catch (validationError) {
                    console.error('Stream validation failed:', validationError)
                    throw validationError
                }

                // Create the Media Recorder for screen recording
                let options = { mimeType: 'video/webm; codecs=vp9' }
                try {
                    // Check if VP9 is supported, fallback to VP8 or WebM
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        console.warn('VP9 codec not supported, trying VP8')
                        options = { mimeType: 'video/webm; codecs=vp8' }

                        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                            console.warn('VP8 codec not supported, using basic WebM')
                            options = { mimeType: 'video/webm' }

                            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                                console.warn('WebM not supported, using default')
                                options = {}
                            }
                        }
                    }

                    mediaRecorder.value = new MediaRecorder(combinedStream, options)
                    console.log(
                        'MediaRecorder created for screen recording with mimeType:',
                        options.mimeType || 'default'
                    )
                } catch (recorderError) {
                    console.error('Failed to create MediaRecorder:', recorderError)

                    // Clean up streams
                    if (combinedStream) {
                        combinedStream.getTracks().forEach((track) => track.stop())
                    }
                    throw new Error(`MediaRecorder creation failed: ${recorderError.message}`)
                }

                // Register Event Handlers
                mediaRecorder.value.ondataavailable = (event) => {
                    if (event.data?.size > 0) {
                        recordedChunks.value.push(event.data)
                    }
                }
                mediaRecorder.value.onstop = async () => {
                    // Stop all tracks to free up resources
                    if (combinedStream) {
                        combinedStream.getTracks().forEach((track) => track.stop())
                    }

                    // Use the same mime type that was used for recording
                    const mimeType = mediaRecorder.value.mimeType || 'video/webm'
                    console.log('Creating blob with mime type:', mimeType)

                    const blob = new Blob(recordedChunks.value, {
                        type: mimeType
                    })

                    try {
                        const arrayBuffer = await blob.arrayBuffer()
                        console.log('Video blob size:', blob.size, 'ArrayBuffer size:', arrayBuffer.byteLength)

                        // Validate arrayBuffer before sending
                        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                            throw new Error('Invalid video data: empty array buffer')
                        }

                        const saveResult = await window.electron?.saveVideoRecording(arrayBuffer)

                        if (saveResult?.success) {
                            console.log('Video recording saved successfully:', saveResult.filename)
                            // Reset recording state and restore window size
                            isRecording.value = false
                            recordedChunks.value = []
                            mediaRecorder.value = null
                            combinedStream = null
                            // Restore full screen window size
                            window.electronWindows?.resizeWindow?.(
                                displayId.value,
                                window.innerWidth,
                                window.innerHeight
                            )
                        } else if (saveResult?.canceled) {
                            console.log('Video recording save was canceled')
                            // Reset recording state and restore window size
                            isRecording.value = false
                            recordedChunks.value = []
                            mediaRecorder.value = null
                            combinedStream = null
                            // Restore full screen window size
                            window.electronWindows?.resizeWindow?.(
                                displayId.value,
                                window.innerWidth,
                                window.innerHeight
                            )
                        } else {
                            console.error('Failed to save video recording:', saveResult?.error)
                            // Reset recording state even on error and restore window size
                            isRecording.value = false
                            recordedChunks.value = []
                            mediaRecorder.value = null
                            combinedStream = null
                            // Restore full screen window size
                            window.electronWindows?.resizeWindow?.(
                                displayId.value,
                                window.innerWidth,
                                window.innerHeight
                            )
                        }
                    } catch (error) {
                        console.error('Error saving video recording:', error)
                        // Reset recording state even on error and restore window size
                        isRecording.value = false
                        recordedChunks.value = []
                        mediaRecorder.value = null
                        if (combinedStream) {
                            combinedStream.getTracks().forEach((track) => track.stop())
                            combinedStream = null
                        }
                        // Restore full screen window size
                        window.electronWindows?.resizeWindow?.(displayId.value, window.innerWidth, window.innerHeight)
                    }
                }

                mediaRecorder.value.start()
            } else {
                console.error('Failed to get recording source')
            }
        } catch (error) {
            console.error('Error starting video recording:', error)
            // Reset recording state on error and restore window size
            isRecording.value = false
            recordedChunks.value = []
            mediaRecorder.value = null
            // Clean up any streams that might have been created
            if (typeof videoStream !== 'undefined' && videoStream) {
                videoStream.getTracks().forEach((track) => track.stop())
            }
            if (typeof audioStream !== 'undefined' && audioStream) {
                audioStream.getTracks().forEach((track) => track.stop())
            }
            if (typeof combinedStream !== 'undefined' && combinedStream) {
                combinedStream.getTracks().forEach((track) => track.stop())
            }
            // Restore full screen window size
            window.electronWindows?.resizeWindow?.(displayId.value, window.innerWidth, window.innerHeight)
        }
    }

    const enumerateMicrophones = async () => {
        try {
            isEnumeratingDevices.value = true

            // Request permission to access media devices
            await navigator.mediaDevices.getUserMedia({ audio: true })

            const devices = await navigator.mediaDevices.enumerateDevices()
            microphones.value = devices
                .filter((device) => device.kind === 'audioinput')
                .map((device) => ({
                    deviceId: device.deviceId,
                    label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
                    groupId: device.groupId
                }))

            // Set default microphone if none selected
            if (microphones.value.length > 0 && !selectedMicrophone.value) {
                selectedMicrophone.value = microphones.value[0]
            }
        } catch (error) {
            console.error('Error enumerating microphones:', error)
            microphones.value = []
        } finally {
            isEnumeratingDevices.value = false
        }
    }

    const selectMicrophone = (microphone) => {
        selectedMicrophone.value = microphone
    }

    const handleStop = () => {
        mediaRecorder.value.stop()
    }

    const handleCancel = (event) => {
        window.electron?.cancelVideoRecordingMode()
    }

    const handleEscapeKeyCancel = (event) => {
        // If called from button click (no event) or Escape key, cancel screenshot mode
        if (event.key === 'Escape') {
            window.electron?.cancelVideoRecordingMode()
        }
    }
    // Toolbar dragging handlers
    const handleToolbarDragStart = (e) => {
        e.stopPropagation()
        isDraggingToolbar.value = true

        // Get current toolbar position
        const toolbar = e.currentTarget.closest('.toolbar-container')
        const rect = toolbar.getBoundingClientRect()

        // Store the offset from mouse to toolbar top-left
        toolbarDragStart.value = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }

    const handleToolbarDragMove = (e) => {
        if (!isDraggingToolbar.value) return

        // Calculate new position
        let newX = e.clientX - toolbarDragStart.value.x
        let newY = e.clientY - toolbarDragStart.value.y

        // Keep toolbar within viewport bounds (with some padding)
        const margin = 10
        const toolbarWidth = 400
        const toolbarHeight = 60

        newX = Math.max(margin, Math.min(newX, window.innerWidth - toolbarWidth - margin))
        newY = Math.max(margin, Math.min(newY, window.innerHeight - toolbarHeight - margin))

        customToolbarPosition.value = { x: newX, y: newY }
    }

    const handleToolbarDragEnd = () => {
        isDraggingToolbar.value = false
    }

    const showToolbar = ref(false)

    onMounted(async () => {
        const params = new URLSearchParams(window.location.search)
        displayId.value = params.get('displayId')
        const initialMouseX = parseInt(params.get('initialMouseX') || '0', 10)
        const initialMouseY = parseInt(params.get('initialMouseY') || '0', 10)
        const activeDisplayId = params.get('activeDisplayId')

        // Set initial mouse position immediately
        mouseX.value = Math.max(0, Math.min(initialMouseX, window.innerWidth))
        mouseY.value = Math.max(0, Math.min(initialMouseY, window.innerHeight))

        // Check if this display is the active one
        const isThisDisplayActive = activeDisplayId && displayId.value === activeDisplayId

        // Helper function to update magnifier when both conditions are met
        const tryUpdateMagnifier = () => {
            if (
                magnifierCanvas.value &&
                isWindowActive.value &&
                magnifierActive.value &&
                mode.value === 'idle' &&
                fullScreenImage.value &&
                fullScreenImage.value.complete &&
                fullScreenImage.value.naturalWidth > 0
            ) {
                updateMagnifier(mouseX.value, mouseY.value)
            }
        }

        document.addEventListener('keydown', handleEscapeKeyCancel)

        // Initialize microphone enumeration
        enumerateMicrophones()

        // Set up display activation listener first
        window.electronWindows?.onDisplayActivationChanged?.((activationData) => {
            console.log(`Display ${displayId.value} activation changed:`, activationData.isActive)
            isWindowActive.value = activationData.isActive

            if (activationData.isActive) {
                // This window is now active - show magnifier and update mouse position
                magnifierActive.value = shouldShowMagnifier.value
                mouseX.value = Math.max(0, Math.min(activationData.mouseX, window.innerWidth))
                mouseY.value = Math.max(0, Math.min(activationData.mouseY, window.innerHeight))

                // Try to update magnifier immediately (will work if image is already loaded)
                // Use a small delay to ensure canvas is rendered
                setTimeout(() => {
                    tryUpdateMagnifier()
                    // If canvas still not ready, try again after a short delay
                    if (!magnifierCanvas.value && fullScreenImage.value) {
                        setTimeout(() => {
                            tryUpdateMagnifier()
                        }, 50)
                    }
                }, 10)
            } else {
                // This window is no longer active - hide magnifier and crosshair
                magnifierActive.value = false
            }
        })

        const processMagnifierData = (dataURL) => {
            if (!dataURL) return
            const img = new Image()
            img.src = dataURL
            img.onload = () => {
                fullScreenImage.value = img
                // Try to update magnifier immediately (will work if window is already active)
                // Use a small delay to ensure Vue has updated the refs and canvas is rendered
                setTimeout(() => {
                    tryUpdateMagnifier()
                    // If canvas still not ready, try again after a short delay
                    if (!magnifierCanvas.value && isWindowActive.value && magnifierActive.value) {
                        setTimeout(() => {
                            tryUpdateMagnifier()
                        }, 50)
                    }
                }, 10)
            }
            img.onerror = (e) => console.error('Error loading magnifier image from data URL:', e)
        }

        // Fetch the initial screenshot data for this specific display
        try {
            const handlerKey = `get-initial-magnifier-data-${displayId.value}`
            const initialDataURL = await window.electron?.invoke(handlerKey)
            processMagnifierData(initialDataURL)
        } catch (error) {
            console.error('Failed to get initial magnifier data:', error)
        }

        // Fallback: If activation event hasn't arrived after a short delay,
        // only activate if this display is confirmed to be the active one
        setTimeout(() => {
            if (!isWindowActive.value && isThisDisplayActive) {
                console.log(`Fallback activation for display ${displayId.value} (confirmed active display)`)
                isWindowActive.value = true
                magnifierActive.value = shouldShowMagnifier.value
                // Try to update magnifier (will work if image is already loaded)
                // Use a small delay to ensure canvas is rendered
                setTimeout(() => {
                    tryUpdateMagnifier()
                    // If canvas still not ready, try again after a short delay
                    if (!magnifierCanvas.value && fullScreenImage.value) {
                        setTimeout(() => {
                            tryUpdateMagnifier()
                        }, 50)
                    }
                }, 10)
            }
        }, 150)
    })

    onUnmounted(() => {
        document.removeEventListener('keydown', handleEscapeKeyCancel)
        window.electronWindows?.removeDisplayActivationChangedListener?.()
    })
</script>

<template>
    <!-- Selection Interface (when not recording) -->
    <div
        v-if="!isRecording"
        class="fixed top-0 left-0 h-screen w-screen cursor-crosshair select-none"
        :class="{ 'pointer-events-none': loading }"
        :style="{
            backgroundImage: fullScreenImage ? `url(${fullScreenImage.src})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'top left',
            backgroundRepeat: 'no-repeat'
        }"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp">
        <!-- Dark overlay for everything outside the selection -->
        <div
            v-if="mode === 'confirming' || mode === 'editing' || mode == 'edited'"
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

        <!-- Selection rectangle -->
        <div
            v-if="mode !== 'idle' && !isRecording"
            :class="[
                'absolute',
                mode === 'selecting'
                    ? `${selectionBorderClass} pointer-events-none`
                    : mode === 'confirming' ||
                        mode === 'resizing' ||
                        mode === 'editing' ||
                        mode === 'edited' ||
                        mode === 'moving'
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
            v-if="mode === 'idle' && isWindowActive && !isRecording"
            class="pointer-events-none fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select an area or click to capture full screen</p>
        </div>

        <!-- Crosshair (only when not confirming and window is active) -->
        <div
            v-if="
                shouldShowCrosshair &&
                mode !== 'confirming' &&
                mode !== 'editing' &&
                mode !== 'edited' &&
                isWindowActive &&
                !isRecording
            "
            class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-40 h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div
            v-if="
                shouldShowCrosshair &&
                mode !== 'confirming' &&
                mode !== 'editing' &&
                mode !== 'edited' &&
                isWindowActive &&
                !isRecording
            "
            class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-40 w-px transition-none"
            :style="{ left: mouseX + 'px' }" />

        <!-- Magnifier -->
        <div
            v-if="shouldShowMagnifier && magnifierActive && !isRecording"
            class="pointer-events-none fixed z-50 flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
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

        <!-- Action Toolbar -->
        <div
            v-if="mode === 'confirming' || mode === 'edited' || isRecording"
            class="toolbar-container absolute z-50 flex items-center gap-4 transition-shadow"
            :class="{ 'shadow-2xl': isDraggingToolbar }"
            :style="toolbarStyle">
            <!-- Drag Handle -->
            <div class="group relative">
                <div
                    class="flex cursor-move items-center rounded-full bg-white/90 px-2 py-3 transition-colors hover:bg-gray-100"
                    @mousedown="handleToolbarDragStart"
                    title="Drag to move toolbar">
                    <svg
                        class="size-5 text-gray-600 transition-colors hover:text-gray-800"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg">
                        <circle
                            cx="12"
                            cy="5"
                            r="2" />
                        <circle
                            cx="12"
                            cy="12"
                            r="2" />
                        <circle
                            cx="12"
                            cy="19"
                            r="2" />
                    </svg>
                </div>

                <span
                    class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                    Move
                </span>
            </div>
            <div class="relative">
                <div class="group relative rounded-full bg-white/90">
                    <button
                        @click="isRecording ? handleStop() : handleStart()"
                        title="Start Recording"
                        class="flex cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-transparent px-4 py-2.5 transition-colors">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="#d73a3a">
                            <g clip-path="url(#clip0_4418_8039)">
                                <path
                                    d="M11.97 2C6.44997 2 1.96997 6.48 1.96997 12C1.96997 17.52 6.44997 22 11.97 22C17.49 22 21.97 17.52 21.97 12C21.97 6.48 17.5 2 11.97 2ZM12 16.23C9.65997 16.23 7.76997 14.34 7.76997 12C7.76997 9.66 9.65997 7.77 12 7.77C14.34 7.77 16.23 9.66 16.23 12C16.23 14.34 14.34 16.23 12 16.23Z"
                                    fill="white"
                                    style="fill: var(--fillg)" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8039">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="white" />
                                </clipPath>
                            </defs>
                        </svg>

                        <span>{{ isRecording ? 'Stop' : 'Record' }}</span>
                    </button>

                    <span
                        class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                        Start Recording
                    </span>
                </div>

                <div
                    v-if="!showToolbar"
                    class="absolute top-1.5 -right-5">
                    <div class="group relative rounded-full bg-white/90">
                        <button
                            @click="showToolbar = true"
                            title="Cancel"
                            class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 transition-colors">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M5.9668 13.28L10.3135 8.93333C10.8268 8.42 10.8268 7.58 10.3135 7.06667L5.9668 2.72"
                                    stroke="#6C82A3"
                                    stroke-width="1.5"
                                    stroke-miterlimit="10"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </button>

                        <span
                            class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                            Show Toolbar
                        </span>
                    </div>
                </div>
            </div>

            <div
                v-if="showToolbar"
                class="flex items-center gap-4">
                <div class="flex items-center gap-4 rounded-full bg-white/90">
                    <div class="group relative">
                        <button
                            @click=""
                            title="Cancel"
                            class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-transparent py-2.5 pl-4 transition-colors">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M21.15 6.17C20.74 5.95 19.88 5.72 18.71 6.54L17.24 7.58C17.13 4.47 15.78 3.25 12.5 3.25H6.5C3.08 3.25 1.75 4.58 1.75 8V16C1.75 18.3 3 20.75 6.5 20.75H12.5C15.78 20.75 17.13 19.53 17.24 16.42L18.71 17.46C19.33 17.9 19.87 18.04 20.3 18.04C20.67 18.04 20.96 17.93 21.15 17.83C21.56 17.62 22.25 17.05 22.25 15.62V8.38C22.25 6.95 21.56 6.38 21.15 6.17ZM11 11.38C9.97 11.38 9.12 10.54 9.12 9.5C9.12 8.46 9.97 7.62 11 7.62C12.03 7.62 12.88 8.46 12.88 9.5C12.88 10.54 12.03 11.38 11 11.38Z"
                                    fill="#2178FF" />
                            </svg>

                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M11.6209 5.22083L7.81753 9.02417C7.36836 9.47333 6.63336 9.47333 6.18419 9.02417L2.38086 5.22083"
                                    stroke="#455772"
                                    stroke-width="1.5"
                                    stroke-miterlimit="10"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </button>

                        <span
                            class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                            Enable webcam
                        </span>
                    </div>

                    <!-- Audio Controls -->
                    <div class="group relative">
                        <button
                            @click="enumerateMicrophones"
                            :disabled="isEnumeratingDevices"
                            title="Audio Settings"
                            class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-transparent py-2.5 pr-4 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M19.1197 9.12C18.7297 9.12 18.4197 9.43 18.4197 9.82V11.4C18.4197 14.94 15.5397 17.82 11.9997 17.82C8.45969 17.82 5.57969 14.94 5.57969 11.4V9.81C5.57969 9.42 5.26969 9.11 4.87969 9.11C4.48969 9.11 4.17969 9.42 4.17969 9.81V11.39C4.17969 15.46 7.30969 18.81 11.2997 19.17V21.3C11.2997 21.69 11.6097 22 11.9997 22C12.3897 22 12.6997 21.69 12.6997 21.3V19.17C16.6797 18.82 19.8197 15.46 19.8197 11.39V9.81C19.8097 9.43 19.4997 9.12 19.1197 9.12Z"
                                    fill="#2178FF" />
                                <path
                                    d="M12.0001 2C9.56008 2 7.58008 3.98 7.58008 6.42V11.54C7.58008 13.98 9.56008 15.96 12.0001 15.96C14.4401 15.96 16.4201 13.98 16.4201 11.54V6.42C16.4201 3.98 14.4401 2 12.0001 2ZM13.3101 8.95C13.2401 9.21 13.0101 9.38 12.7501 9.38C12.7001 9.38 12.6501 9.37 12.6001 9.36C12.2101 9.25 11.8001 9.25 11.4101 9.36C11.0901 9.45 10.7801 9.26 10.7001 8.95C10.6101 8.64 10.8001 8.32 11.1101 8.24C11.7001 8.08 12.3201 8.08 12.9101 8.24C13.2101 8.32 13.3901 8.64 13.3101 8.95ZM13.8401 7.01C13.7501 7.25 13.5301 7.39 13.2901 7.39C13.2201 7.39 13.1601 7.38 13.0901 7.36C12.3901 7.1 11.6101 7.1 10.9101 7.36C10.6101 7.47 10.2701 7.31 10.1601 7.01C10.0501 6.71 10.2101 6.37 10.5101 6.27C11.4701 5.92 12.5301 5.92 13.4901 6.27C13.7901 6.38 13.9501 6.71 13.8401 7.01Z"
                                    fill="#2178FF" />
                            </svg>

                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M11.6209 5.22083L7.81753 9.02417C7.36836 9.47333 6.63336 9.47333 6.18419 9.02417L2.38086 5.22083"
                                    stroke="#455772"
                                    stroke-width="1.5"
                                    stroke-miterlimit="10"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </button>

                        <!-- Audio Settings Dropdown -->
                        <div
                            class="invisible absolute top-full left-1/2 z-20 mt-2 -translate-x-1/2 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                            <div class="min-w-64 rounded-lg border bg-white p-4 shadow-lg">
                                <!-- Microphone Selection -->
                                <div class="mb-2">
                                    <div class="mb-2 text-xs font-medium text-gray-700">Microphone</div>
                                    <div class="max-h-32 space-y-1 overflow-y-auto">
                                        <div
                                            v-for="mic in microphones"
                                            :key="mic.deviceId"
                                            @click="selectMicrophone(mic)"
                                            class="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-100"
                                            :class="{
                                                'border border-blue-200 bg-blue-50':
                                                    selectedMicrophone?.deviceId === mic.deviceId
                                            }">
                                            <div class="flex h-3 w-3 items-center justify-center rounded-full border-2">
                                                <div
                                                    v-if="selectedMicrophone?.deviceId === mic.deviceId"
                                                    class="h-1.5 w-1.5 rounded-full bg-blue-600"></div>
                                            </div>
                                            <span class="truncate text-xs text-gray-700">{{ mic.label }}</span>
                                        </div>
                                        <div
                                            v-if="microphones.length === 0 && !isEnumeratingDevices"
                                            class="p-2 text-xs text-gray-500">
                                            No microphones found
                                        </div>
                                        <div
                                            v-if="isEnumeratingDevices"
                                            class="p-2 text-xs text-gray-500">
                                            Loading microphones...
                                        </div>
                                    </div>
                                </div>

                                <!-- Refresh Button -->
                                <button
                                    @click="enumerateMicrophones"
                                    :disabled="isEnumeratingDevices"
                                    class="mt-2 w-full rounded bg-gray-100 px-3 py-1.5 text-xs hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50">
                                    Refresh devices
                                </button>
                            </div>
                        </div>

                        <span
                            class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                            Audio settings
                        </span>
                    </div>
                </div>

                <div class="group relative rounded-full bg-white/90">
                    <button
                        @click="handleCancel"
                        title="Cancel"
                        class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 text-red-500 transition-colors hover:bg-red-500 hover:text-white">
                        <svg
                            class="size-6"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M18 6L6 18M6 6L18 18"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                    </button>

                    <span
                        class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                        Cancel (esc)
                    </span>
                </div>

                <div class="group relative rounded-full bg-white/90">
                    <button
                        @click="showToolbar = false"
                        title="Cancel"
                        class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 transition-colors">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M10.0332 13.28L5.68654 8.93333C5.1732 8.42 5.1732 7.58 5.68654 7.06667L10.0332 2.72"
                                stroke="#6C82A3"
                                stroke-width="1.5"
                                stroke-miterlimit="10"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                    </button>

                    <span
                        class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                        Hide Toolbar
                    </span>
                </div>
            </div>
        </div>
    </div>

    <!-- Recording Interface (when recording) -->
    <div
        v-if="isRecording"
        class="fixed top-0 left-0"
        @mousemove="handleToolbarDragMove"
        @mouseup="handleToolbarDragEnd">
        <!-- Action Toolbar (only during recording) -->
        <div
            class="toolbar-container absolute z-50 flex items-center gap-4 transition-shadow"
            :class="{ 'shadow-2xl': isDraggingToolbar }"
            :style="toolbarStyle">
            <!-- Drag Handle -->
            <div class="group relative">
                <div
                    class="flex cursor-move items-center rounded-full bg-white/90 px-2 py-3 transition-colors hover:bg-gray-100"
                    @mousedown="handleToolbarDragStart"
                    title="Drag to move toolbar">
                    <svg
                        class="size-5 text-gray-600 transition-colors hover:text-gray-800"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg">
                        <circle
                            cx="12"
                            cy="5"
                            r="2" />
                        <circle
                            cx="12"
                            cy="12"
                            r="2" />
                        <circle
                            cx="12"
                            cy="19"
                            r="2" />
                    </svg>
                </div>

                <span
                    class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                    Move
                </span>
            </div>
            <div class="relative">
                <div class="group relative rounded-full bg-white/90">
                    <button
                        @click="handleStop()"
                        title="Stop Recording"
                        class="flex cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-transparent px-4 py-2.5 transition-colors">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="#d73a3a">
                            <g clip-path="url(#clip0_4418_8039)">
                                <path
                                    d="M11.97 2C6.44997 2 1.96997 6.48 1.96997 12C1.96997 17.52 6.44997 22 11.97 22C17.49 22 21.97 17.52 21.97 12C21.97 6.48 17.5 2 11.97 2ZM12 16.23C9.65997 16.23 7.76997 14.34 7.76997 12C7.76997 9.66 9.65997 7.77 12 7.77C14.34 7.77 16.23 9.66 16.23 12C16.23 14.34 14.34 16.23 12 16.23Z"
                                    fill="white"
                                    style="fill: var(--fillg)" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8039">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="white" />
                                </clipPath>
                            </defs>
                        </svg>

                        <span>Stop</span>
                    </button>

                    <span
                        class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                        Stop Recording
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .notification-enter-active,
    .notification-leave-active {
        transition: all 0.3s ease;
    }

    .notification-enter-from {
        transform: translateX(100%);
        opacity: 0;
    }

    .notification-leave-to {
        transform: translateX(100%);
        opacity: 0;
    }

    .notification-move {
        transition: transform 0.3s ease;
    }

    /* Animation delay utilities for loading dots */
    .animation-delay-0 {
        animation-delay: 0ms;
    }

    .animation-delay-150 {
        animation-delay: 150ms;
    }

    .animation-delay-300 {
        animation-delay: 300ms;
    }
</style>
