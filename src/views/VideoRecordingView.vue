<script setup>
    import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
    import { useRecorder } from '@/composables/useRecorder'
    import { useStore } from '../store'
    import VideoPlayer from '../components/VideoPlayer.vue'

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
    const toolbarContainerRef = ref(null)

    const toolbarStyle = computed(() => {
        // When recording, center the toolbar in the window
        // if (isRecording.value) {
        //     return {
        //         position: 'fixed',
        //         left: '50%',
        //         top: '50%',
        //         transform: 'translate(-50%, -50%)'
        //     }
        // }

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

        // Toggle webcam back on if it was enabled before recording
        enableWebcam()
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

    const isFullScreen = computed(() => {
        const { width, height } = selectionRect.value
        return width === window.innerWidth && height === window.innerHeight
    })

    // Action handlers
    const handleStart = async () => {
        const { left, top, width, height } = selectionRect.value

        if (!isFullScreen.value) {
            setEnableCrop(true)
            setCropRegion(Math.round(left), Math.round(top), Math.round(width), Math.round(height))
        }

        // Prepare toolbar for recording transition
        const toolbarInfo = await prepareToolbarForRecording()

        // Hide all UI elements
        mode.value = 'recording'
        fullScreenImage.value = null

        // Wait for DOM to update before making window non-blocking
        await nextTick()

        // Make window normal and resize to toolbar size
        // Pass toolbar position and size to maintain its screen location
        await window.electronWindows?.makeWindowNonBlocking?.(
            `recording-${displayId.value}`,
            toolbarInfo.position,
            toolbarInfo.size
        )

        isRecording.value = true

        // Resize window after a short delay to ensure toolbar is fully rendered
        setTimeout(() => {
            resizeWindowToToolbar()
        }, 100)

        startRecording()
    }

    const selectAudioDevice = (audioDevice) => {
        selectedAudioDeviceId.value = audioDevice.deviceId
        showAudioSettings.value = false
        // Save to settings
        store.updateSetting('selectedMicrophoneDeviceId', audioDevice.deviceId)
    }

    const muteAudio = () => {
        selectedAudioDeviceId.value = null
        showAudioSettings.value = false
        // Save muted state to settings
        store.updateSetting('selectedMicrophoneDeviceId', null)
    }

    const enableWebcam = async () => {
        if (store.settings.webcamEnabled) {
            try {
                // Check if webcam window exists
                const windowCheck = await window.electronWindows?.getWindow?.('webcam')

                if (!windowCheck?.exists) {
                    // Get the current window's display info to position webcam on the same monitor
                    const displayInfo = await window.electronWindows?.getCurrentWindowDisplayInfo?.()

                    if (displayInfo?.success) {
                        // Create webcam window on the same monitor as the recording window
                        await window.electronWindows?.createWindow?.('webcam', {
                            displayInfo: displayInfo.display,
                            isFullScreen: isFullScreen.value,
                            selectionRect: selectionRect.value
                        })
                    }
                }
            } catch (error) {
                console.error('Error toggling webcam window:', error)
            }
        }
    }

    const toggleWebcam = async () => {
        if (store.settings.webcamEnabled) {
            await window.electronWindows?.closeWindow?.('webcam')
            store.updateSetting('webcamEnabled', false)
        } else {
            store.updateSetting('webcamEnabled', true)
            await enableWebcam()
        }
    }

    const handleStop = async () => {
        stopRecording()

        await window.electronWindows?.closeWindow?.('webcam')

        window.electronWindows?.resizeWindow?.(`recording-${displayId.value}`, 800, 600)
        window.electronWindows?.centerWindow?.(`recording-${displayId.value}`)
    }

    const handleCancel = (event) => {
        window.electron?.cancelVideoRecordingMode()
        window.electronWindows?.closeWindow?.('webcam')
    }

    const handleEscapeKeyCancel = (event) => {
        // If called from button click (no event) or Escape key, cancel screenshot mode
        if (event.key === 'Escape') {
            console.log('handleEscapeKeyCancel')

            handleCancel()
        }
    }
    // Toolbar dragging handlers
    const handleToolbarDragMove = (e) => {
        if (!isDraggingToolbar.value) return

        e.preventDefault() // Prevent text selection during drag

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
        if (!isDraggingToolbar.value) return

        isDraggingToolbar.value = false

        // Remove global event listeners
        document.removeEventListener('mousemove', handleToolbarDragMove)
        document.removeEventListener('mouseup', handleToolbarDragEnd)
    }

    const handleToolbarDragStart = (e) => {
        e.stopPropagation()
        e.preventDefault() // Prevent text selection

        isDraggingToolbar.value = true

        // Get current toolbar position
        const toolbar = e.currentTarget.closest('.toolbar-container')
        const rect = toolbar.getBoundingClientRect()

        // Store the offset from mouse to toolbar top-left
        toolbarDragStart.value = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }

        // Attach global event listeners for smooth dragging
        document.addEventListener('mousemove', handleToolbarDragMove)
        document.addEventListener('mouseup', handleToolbarDragEnd)
    }

    const showToolbar = ref(false)

    // Audio settings dropdown logic
    const showAudioSettings = ref(false)
    const audioDropdownPosition = ref('bottom')
    const audioSettingsButtonRef = ref(null)
    const audioDropdownRef = ref(null)

    const toggleAudioSettings = async () => {
        showAudioSettings.value = !showAudioSettings.value
        if (showAudioSettings.value) {
            await nextTick()
            updateDropdownPosition()
        }
    }

    const updateDropdownPosition = () => {
        if (!audioSettingsButtonRef.value || !audioDropdownRef.value) return

        const buttonRect = audioSettingsButtonRef.value.getBoundingClientRect()
        const dropdownHeight = audioDropdownRef.value.offsetHeight
        const spaceBelow = window.innerHeight - buttonRect.bottom
        const spaceAbove = buttonRect.top

        // If space below is less than dropdown height + padding (e.g. 20px), and space above is more, show on top
        if (spaceBelow < dropdownHeight + 20 && spaceAbove > dropdownHeight + 20) {
            audioDropdownPosition.value = 'top'
        } else {
            audioDropdownPosition.value = 'bottom'
        }
    }

    const closeAudioSettings = (e) => {
        // Close if clicking outside the audio settings container
        const container = audioSettingsButtonRef.value?.closest('.audio-settings-container')
        if (showAudioSettings.value && container && !container.contains(e.target)) {
            showAudioSettings.value = false
        }
    }

    onMounted(() => {
        document.addEventListener('click', closeAudioSettings)
        window.addEventListener('resize', () => {
            if (showAudioSettings.value) updateDropdownPosition()
        })
    })

    onUnmounted(() => {
        document.removeEventListener('click', closeAudioSettings)
    })

    // Calculate toolbar size including tooltip space
    const calculateToolbarSizeWithTooltips = () => {
        if (!toolbarContainerRef.value) return null

        const rect = toolbarContainerRef.value.getBoundingClientRect()
        const toolbarWidth = Math.ceil(rect.width)
        const toolbarHeight = Math.ceil(rect.height)

        // Tooltips appear above when recording (mb-4 = 16px + tooltip height ~30px + arrow ~24px)
        // Add extra padding to ensure tooltips are fully visible
        const tooltipSpace = 80 // Space for tooltip above toolbar when recording
        const horizontalPadding = 20
        const verticalPadding = 20

        return {
            width: toolbarWidth + horizontalPadding * 2,
            height: toolbarHeight + tooltipSpace + verticalPadding * 2
        }
    }

    // Prepare toolbar for recording: capture position and size
    const prepareToolbarForRecording = async () => {
        if (!toolbarContainerRef.value) {
            return { position: null, size: null }
        }

        const rect = toolbarContainerRef.value.getBoundingClientRect()
        const toolbarCenterX = rect.left + rect.width / 2
        const toolbarCenterY = rect.top + rect.height / 2

        // Get window's screen position to convert viewport coords to screen coords
        const windowBounds = await window.electronWindows?.getCurrentWindowDisplayInfo?.()
        let toolbarScreenPosition = null

        if (windowBounds?.success) {
            toolbarScreenPosition = {
                x: windowBounds.windowBounds.x + toolbarCenterX,
                y: windowBounds.windowBounds.y + toolbarCenterY
            }
        } else {
            // Fallback: use viewport coordinates (should work if window is fullscreen)
            toolbarScreenPosition = {
                x: toolbarCenterX,
                y: toolbarCenterY
            }
        }

        // Calculate toolbar size including tooltip space
        const toolbarSize = calculateToolbarSizeWithTooltips()

        return {
            position: toolbarScreenPosition,
            size: toolbarSize
        }
    }

    // Function to resize window to match toolbar size
    const resizeWindowToToolbar = async () => {
        if (!isRecording.value || !toolbarContainerRef.value) return

        await nextTick() // Wait for DOM update

        // Wait for any CSS transitions to complete and ensure accurate measurement
        await new Promise((resolve) =>
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve)
            })
        )

        const toolbarSize = calculateToolbarSizeWithTooltips()
        if (!toolbarSize) return

        const windowWidth = toolbarSize.width
        const windowHeight = toolbarSize.height

        // Get current window position to maintain it
        const windowBounds = await window.electronWindows?.getCurrentWindowDisplayInfo?.()
        if (windowBounds?.success) {
            const currentBounds = windowBounds.windowBounds

            // During recording, toolbar is centered, so maintain the center point
            // Use the toolbar's current screen position as the center reference
            const toolbarRect = toolbarContainerRef.value.getBoundingClientRect()
            const toolbarCenterX = currentBounds.x + toolbarRect.left + toolbarRect.width / 2
            const toolbarCenterY = currentBounds.y + toolbarRect.top + toolbarRect.height / 2

            // Calculate new position to keep toolbar center the same
            const newX = Math.round(toolbarCenterX - windowWidth / 2)
            const newY = Math.round(toolbarCenterY - windowHeight / 2)

            // Resize and reposition window smoothly
            await window.electronWindows?.resizeWindow?.(`recording-${displayId.value}`, windowWidth, windowHeight)
            await window.electronWindows?.moveWindow?.(`recording-${displayId.value}`, newX, newY)
        } else {
            // Fallback: just resize
            await window.electronWindows?.resizeWindow?.(`recording-${displayId.value}`, windowWidth, windowHeight)
        }
    }

    // Start recording functionality
    const {
        uiMode,
        previewCanvas,
        recordingCanvas,
        screenVideo,
        recordedVideo,
        sources,
        selectedSourceId,
        audioDevices,
        selectedAudioDeviceId,
        fps,
        isRecording,
        recordingTime,
        recordedVideoUrl,
        filename,
        isProcessing,
        isDownloading,
        tempRecordingPath,
        savedFilePath,
        cropRegion,
        setCropRegion,
        setEnableCrop,
        refreshSources,
        startRecording,
        stopRecording,
        downloadVideo,
        resetRecording,
        initialize,
        cleanup
    } = useRecorder()
    // End recording functionality

    // Watch showToolbar to resize window when toolbar expands/collapses
    // watch(showToolbar, async (newValue) => {
    //     if (isRecording.value) {
    //         // Wait for animation to complete (300ms) plus a small buffer for smooth transition
    //         await new Promise((resolve) => setTimeout(resolve, 350))

    //         // Ensure DOM has fully updated
    //         await nextTick()

    //         // Small delay to ensure measurements are accurate
    //         await new Promise((resolve) =>
    //             requestAnimationFrame(() => {
    //                 requestAnimationFrame(resolve)
    //             })
    //         )

    //         await resizeWindowToToolbar()
    //     }
    // })

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

        // Initialize recording
        await initialize()

        // Load saved microphone device ID from settings
        const savedMicrophoneDeviceId = store.settings.selectedMicrophoneDeviceId
        if (savedMicrophoneDeviceId !== undefined && savedMicrophoneDeviceId !== null) {
            // Check if the saved device still exists in the available devices
            const deviceExists = audioDevices.value.some((device) => device.deviceId === savedMicrophoneDeviceId)
            if (deviceExists) {
                selectedAudioDeviceId.value = savedMicrophoneDeviceId
            } else {
                // Device no longer exists, clear the setting and set to null (muted)
                selectedAudioDeviceId.value = null
                store.updateSetting('selectedMicrophoneDeviceId', null)
            }
        } else {
            // No saved setting or explicitly muted - set to null
            selectedAudioDeviceId.value = null
        }

        selectedSourceId.value = sources.value.find((s) => s.display_id === displayId.value)?.id || ''

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

        // Cleanup toolbar drag listeners if still active
        if (isDraggingToolbar.value) {
            document.removeEventListener('mousemove', handleToolbarDragMove)
            document.removeEventListener('mouseup', handleToolbarDragEnd)
        }

        // Cleanup recording
        cleanup()
    })
</script>

<template>
    <!-- Selection Interface (when not recording) -->
    <div>
        <div
            v-if="uiMode === 'select'"
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
        </div>
        <!-- Action Toolbar -->
        <div
            v-if="mode === 'confirming' || isRecording"
            ref="toolbarContainerRef"
            class="toolbar-container z-50 flex items-center gap-4"
            :class="{
                'shadow-2xl': isDraggingToolbar,
                'absolute transition-shadow duration-300 ease-in-out': !isRecording,
                'transition-shadow duration-300 ease-in-out': isRecording
            }"
            :style="toolbarStyle">
            <!-- Drag Handle -->
            <div class="group relative">
                <div
                    @mousedown="handleToolbarDragStart"
                    :class="{ drag: isRecording }"
                    class="flex cursor-move items-center rounded-full bg-white/90 px-2 py-3 transition-colors hover:bg-gray-100">
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
                    class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                    Move
                </span>
            </div>

            <div class="relative">
                <div class="group relative rounded-full bg-white/90">
                    <button
                        @click="isRecording ? handleStop() : handleStart()"
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

                        <div v-if="isRecording">{{ recordingTime }}</div>
                    </button>

                    <span
                        class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                        {{ isRecording ? 'Stop' : 'Start' }} Recording
                    </span>
                </div>

                <Transition
                    name="expand-button"
                    enter-active-class="transition-all duration-300 ease-in-out"
                    leave-active-class="transition-all duration-300 ease-in-out"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95">
                    <div
                        v-if="!showToolbar"
                        class="absolute top-1.5 -right-5">
                        <div class="group relative rounded-full bg-white/90">
                            <button
                                @click="showToolbar = true"
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
                                class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                                Show Toolbar
                            </span>
                        </div>
                    </div>
                </Transition>
            </div>

            <Transition
                name="toolbar-expand"
                enter-active-class="transition-all duration-300 ease-in-out"
                leave-active-class="transition-all duration-300 ease-in-out"
                enter-from-class="opacity-0 -translate-x-2"
                enter-to-class="opacity-100 translate-x-0"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 -translate-x-2">
                <div
                    v-if="showToolbar"
                    class="flex items-center gap-4">
                    <div class="flex items-center gap-4 rounded-full bg-white/90">
                        <div class="group relative">
                            <button
                                @click="toggleWebcam"
                                :class="{ 'bg-blue-100': store.settings.webcamEnabled }"
                                class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-transparent py-2.5 pl-4 transition-colors hover:bg-gray-100">
                                <svg
                                    v-if="store.settings.webcamEnabled"
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
                                    v-else
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        opacity="0.4"
                                        d="M17.7405 7.57C17.7505 7.64 17.7505 7.72 17.7405 7.79C17.7405 7.72 17.7305 7.65 17.7305 7.58L17.7405 7.57Z"
                                        fill="#2178FF" />
                                    <path
                                        d="M17.2809 6.56L3.83086 20.01C2.43086 19.12 1.88086 17.53 1.88086 16V8C1.88086 4.58 3.21086 3.25 6.63086 3.25H12.6309C15.5209 3.25 16.9109 4.2 17.2809 6.56Z"
                                        fill="#6C82A3" />
                                    <path
                                        d="M21.4 2.23C21.1 1.93 20.61 1.93 20.31 2.23L1.85 20.69C1.55 20.99 1.55 21.48 1.85 21.78C2 21.92 2.2 22 2.39 22C2.59 22 2.78 21.92 2.93 21.77L21.4 3.31C21.7 3.01 21.7 2.53 21.4 2.23Z"
                                        fill="#6C82A3" />
                                    <path
                                        d="M22.3802 8.38V15.62C22.3802 17.05 21.6802 17.62 21.2802 17.83C21.0902 17.93 20.7902 18.04 20.4202 18.04C19.9902 18.04 19.4602 17.9 18.8402 17.46L17.3602 16.42C17.2902 18.63 16.5902 19.89 15.0002 20.42C14.3602 20.65 13.5702 20.75 12.6202 20.75H6.62016C6.38016 20.75 6.15016 20.74 5.91016 20.71L15.0002 11.63L20.6502 5.98C20.9102 6 21.1202 6.08 21.2802 6.17C21.6802 6.38 22.3802 6.95 22.3802 8.38Z"
                                        fill="#6C82A3" />
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
                                class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                                {{ store.settings.webcamEnabled ? 'Disable' : 'Enable' }} webcam
                            </span>
                        </div>

                        <!-- Audio Controls -->
                        <div class="group audio-settings-container relative">
                            <button
                                ref="audioSettingsButtonRef"
                                @click="toggleAudioSettings"
                                type="button"
                                class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-transparent py-2.5 pr-4 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                :class="{ 'bg-gray-100': showAudioSettings }">
                                <svg
                                    v-if="selectedAudioDeviceId"
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
                                    v-else
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M16.4201 6.42V7.58L9.14008 14.86C8.18008 13.99 7.58008 12.71 7.58008 11.34V6.42C7.58008 4.36 8.98008 2.65 10.8801 2.16C11.0701 2.11 11.2501 2.27 11.2501 2.46V4C11.2501 4.41 11.5901 4.75 12.0001 4.75C12.4101 4.75 12.7501 4.41 12.7501 4V2.46C12.7501 2.27 12.9301 2.11 13.1201 2.16C15.0201 2.65 16.4201 4.36 16.4201 6.42Z"
                                        fill="#6C82A3" />
                                    <path
                                        d="M19.8098 9.81V11.4C19.8098 15.47 16.6798 18.82 12.6998 19.17V21.3C12.6998 21.69 12.3898 22 11.9998 22C11.6098 22 11.2998 21.69 11.2998 21.3V19.17C10.2098 19.07 9.17977 18.75 8.25977 18.24L9.28977 17.21C10.1098 17.59 11.0298 17.81 11.9998 17.81C15.5398 17.81 18.4198 14.93 18.4198 11.4V9.81C18.4198 9.43 18.7298 9.12 19.1198 9.12C19.4998 9.12 19.8098 9.43 19.8098 9.81Z"
                                        fill="#6C82A3" />
                                    <path
                                        d="M16.4202 10.08V11.53C16.4202 14.11 14.2002 16.18 11.5602 15.93C11.2802 15.9 11.0002 15.85 10.7402 15.76L16.4202 10.08Z"
                                        fill="#6C82A3" />
                                    <path
                                        d="M21.7691 2.23C21.4691 1.93 20.9791 1.93 20.6791 2.23L7.22914 15.68C6.19914 14.55 5.57914 13.05 5.57914 11.4V9.81C5.57914 9.43 5.26914 9.12 4.87914 9.12C4.49914 9.12 4.18914 9.43 4.18914 9.81V11.4C4.18914 13.43 4.96914 15.28 6.23914 16.67L2.21914 20.69C1.91914 20.99 1.91914 21.48 2.21914 21.78C2.37914 21.92 2.56914 22 2.76914 22C2.96914 22 3.15914 21.92 3.30914 21.77L21.7691 3.31C22.0791 3.01 22.0791 2.53 21.7691 2.23Z"
                                        fill="#6C82A3" />
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
                                v-if="showAudioSettings"
                                ref="audioDropdownRef"
                                class="absolute left-1/2 z-20 w-64 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
                                :class="[audioDropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2']">
                                <div class="flex flex-col">
                                    <div
                                        v-for="audioDevice in audioDevices"
                                        :key="audioDevice.deviceId"
                                        @click="selectAudioDevice(audioDevice)"
                                        class="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                        :class="[
                                            selectedAudioDeviceId === audioDevice.deviceId
                                                ? 'font-medium text-blue-600'
                                                : 'text-gray-700'
                                        ]">
                                        <span class="truncate">{{ audioDevice.label }}</span>
                                        <svg
                                            v-if="selectedAudioDeviceId === audioDevice.deviceId"
                                            width="24"
                                            height="24"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M7.75 12L10.58 14.83L16.25 9.16997"
                                                stroke="#2178FF"
                                                stroke-width="2.0625"
                                                stroke-linecap="round"
                                                stroke-linejoin="round" />
                                        </svg>
                                    </div>

                                    <div
                                        v-if="audioDevices.length === 0"
                                        class="px-4 py-2.5 text-sm text-gray-500">
                                        No microphones found
                                    </div>

                                    <!-- Mute Option -->
                                    <div
                                        @click="muteAudio"
                                        class="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
                                        :class="{ 'font-medium': !selectedAudioDeviceId }">
                                        <span>Mute</span>
                                        <svg
                                            v-if="!selectedAudioDeviceId"
                                            width="24"
                                            height="24"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M7.75 12L10.58 14.83L16.25 9.16997"
                                                stroke="#2178FF"
                                                stroke-width="2.0625"
                                                stroke-linecap="round"
                                                stroke-linejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <span
                                v-if="!showAudioSettings"
                                class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                                Audio settings
                            </span>
                        </div>
                    </div>

                    <div class="group relative rounded-full bg-white/90">
                        <button
                            @click="handleCancel"
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
                            class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                            Cancel (esc)
                        </span>
                    </div>

                    <div class="group relative rounded-full bg-white/90">
                        <button
                            @click="showToolbar = false"
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
                            class="bg-gray-black before:border-t-gray-black pointer-events-none absolute bottom-full left-1/2 z-10 mb-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:top-full before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-[\'\']">
                            Hide Toolbar
                        </span>
                    </div>
                </div>
            </Transition>
        </div>
    </div>

    <div v-if="uiMode == 'preview'">
        <div class="size-full rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2">
            <div class="rounded-2xl bg-white p-5">
                <!-- Title -->
                <div class="drag mb-5 flex items-center gap-4">
                    <h2
                        v-if="filename"
                        class="font-bold">
                        {{ filename }}
                    </h2>

                    <div class="no-drag ml-auto flex items-center gap-1">
                        <button @click="handleCancel">
                            <svg
                                class="size-6"
                                viewBox="0 0 26 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    opacity="0.4"
                                    d="M13.1022 22C18.8087 22 23.4348 17.5228 23.4348 12C23.4348 6.47715 18.8087 2 13.1022 2C7.39561 2 2.76953 6.47715 2.76953 12C2.76953 17.5228 7.39561 22 13.1022 22Z"
                                    fill="#6C82A3" />
                                <path
                                    d="M14.198 12L16.5745 9.69998C16.8742 9.40998 16.8742 8.92999 16.5745 8.63999C16.2749 8.34999 15.7789 8.34999 15.4793 8.63999L13.1028 10.94L10.7262 8.63999C10.4266 8.34999 9.93063 8.34999 9.63098 8.63999C9.33134 8.92999 9.33134 9.40998 9.63098 9.69998L12.0075 12L9.63098 14.3C9.33134 14.59 9.33134 15.07 9.63098 15.36C9.78597 15.51 9.98229 15.58 10.1786 15.58C10.3749 15.58 10.5713 15.51 10.7262 15.36L13.1028 13.06L15.4793 15.36C15.6342 15.51 15.8306 15.58 16.0269 15.58C16.2232 15.58 16.4195 15.51 16.5745 15.36C16.8742 15.07 16.8742 14.59 16.5745 14.3L14.198 12Z"
                                    fill="#6C82A3" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Processing Overlay -->
                <div
                    v-if="isProcessing"
                    class="bg-gray-black/60 flex flex-col items-center justify-center gap-4 rounded-2xl p-12 backdrop-blur-md">
                    <div class="relative h-16 w-16">
                        <div
                            class="absolute inset-0 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
                    </div>
                    <div class="text-center">
                        <p class="text-lg font-semibold text-white">Processing video...</p>
                        <small class="mt-1 block text-sm text-white/70">Fixing duration metadata</small>
                    </div>
                </div>

                <!-- Preview Content -->
                <div
                    v-show="!isProcessing"
                    class="relative">
                    <VideoPlayer
                        :src="recordedVideoUrl"
                        :autoplay="true"
                        :show-controls="true" />
                </div>
            </div>
        </div>

        <!-- Action Toolbar -->
        <div
            v-if="recordedVideoUrl"
            class="mt-2 flex items-center gap-4 transition-shadow">
            <div class="mx-auto flex items-center rounded-full bg-white/90">
                <button
                    @click="handleUpload"
                    title="Upload"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="size-6 group-hover:text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M21.74 12.91C21.48 12.05 21.05 11.3 20.48 10.69C19.75 9.86 18.78 9.29 17.69 9.04C17.14 6.54 15.6 4.74 13.41 4.07C11.03 3.33 8.27 4.05 6.54 5.86C5.02 7.45 4.52 9.64 5.11 11.97C3.11 12.46 2.12 14.13 2.01 15.72C2 15.83 2 15.93 2 16.03C2 17.91 3.23 20.02 5.97 20.22H16.35C17.77 20.22 19.13 19.69 20.17 18.74C21.8 17.31 22.4 15.08 21.74 12.91Z"
                            fill="currentColor" />
                    </svg>
                    <span class="hidden group-hover:block group-hover:text-white"> Upload </span>
                </button>

                <button
                    @click="handleCopy"
                    title="Copy"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="size-6 group-hover:text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M15.5 13.15H13.33C11.55 13.15 10.1 11.71 10.1 9.92V7.75C10.1 7.34 9.77 7 9.35 7H6.18C3.87 7 2 8.5 2 11.18V17.82C2 20.5 3.87 22 6.18 22H12.07C14.38 22 16.25 20.5 16.25 17.82V13.9C16.25 13.48 15.91 13.15 15.5 13.15Z"
                            fill="currentColor" />
                        <path
                            d="M17.8198 2H15.8498H14.7598H11.9298C9.66977 2 7.83977 3.44 7.75977 6.01C7.81977 6.01 7.86977 6 7.92977 6H10.7598H11.8498H13.8198C16.1298 6 17.9998 7.5 17.9998 10.18V12.15V14.86V16.83C17.9998 16.89 17.9898 16.94 17.9898 16.99C20.2198 16.92 21.9998 15.44 21.9998 12.83V10.86V8.15V6.18C21.9998 3.5 20.1298 2 17.8198 2Z"
                            fill="currentColor" />
                        <path
                            d="M11.9796 7.14999C11.6696 6.83999 11.1396 7.04999 11.1396 7.47999V10.1C11.1396 11.2 12.0696 12.1 13.2096 12.1C13.9196 12.11 14.9096 12.11 15.7596 12.11C16.1896 12.11 16.4096 11.61 16.1096 11.31C15.0196 10.22 13.0796 8.26999 11.9796 7.14999Z"
                            fill="currentColor" />
                    </svg>
                    <span class="hidden group-hover:block group-hover:text-white"> Copy </span>
                </button>

                <button
                    @click="handleSave"
                    title="Save"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="size-6 group-hover:text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M8.78125 13.2002H15.4746C15.6843 13.2002 15.8564 13.3717 15.8564 13.585V19.5C15.8564 19.6933 15.6992 19.8496 15.5059 19.8496H8.75C8.55672 19.8496 8.40039 19.6933 8.40039 19.5V13.585C8.40039 13.3717 8.5716 13.2002 8.78125 13.2002ZM7.8252 3.15039C8.09431 3.1505 8.3125 3.36856 8.3125 3.6377V5.88672C8.3125 6.85441 9.09271 7.64062 10.0566 7.64062H14.2002C15.164 7.64049 15.9434 6.85433 15.9434 5.88672V4.21094C15.9434 4.14578 15.9785 4.09968 16.0195 4.0791C16.0582 4.05972 16.104 4.06116 16.1465 4.09961L18.5703 6.29492C19.3447 6.99621 19.787 7.99515 19.7871 9.04395V16.1514C19.7869 17.6994 18.8424 19.0247 17.502 19.5762C17.3737 19.6289 17.219 19.5336 17.2188 19.3623V13.585C17.2188 12.6173 16.4385 11.8311 15.4746 11.8311H8.78125C7.81734 11.8311 7.03711 12.6173 7.03711 13.585V19.4736C7.03709 19.6348 6.89786 19.7335 6.77051 19.6953C5.25543 19.2392 4.15058 17.8254 4.15039 16.1514V6.84863C4.15062 4.80501 5.79657 3.15039 7.8252 3.15039ZM10.0254 3.15039H14.2314C14.4246 3.15053 14.5811 3.30679 14.5811 3.5V5.88672C14.5811 6.09992 14.4098 6.27134 14.2002 6.27148H10.0566C9.84697 6.27148 9.6748 6.10001 9.6748 5.88672V3.5C9.6748 3.3067 9.83209 3.15039 10.0254 3.15039Z"
                            fill="currentColor" />
                    </svg>
                    <span class="hidden group-hover:block group-hover:text-white"> Save </span>
                </button>
            </div>
        </div>
    </div>

    <canvas
        ref="recordingCanvas"
        class="hidden"></canvas>
    <video
        class="hidden"
        ref="screenVideo"
        autoplay
        muted
        playsinline></video>
</template>
