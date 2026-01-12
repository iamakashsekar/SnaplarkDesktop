<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRecorder } from '@/composables/useRecorder'
import { useStore } from '../store'
import VideoPreview from '../components/VideoPreview.vue'
import Tooltip from '../components/Tooltip.vue'
import SizeIndicatorPill from '../components/SizeIndicatorPill.vue'

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
const displayScaleFactor = ref(window.devicePixelRatio || 1)
const mode = ref('idle') // 'idle', 'selecting', 'resizing', 'confirming', 'editing', 'moving', 'countdown'
const resizingHandle = ref(null)

// Countdown state
const showCountdown = ref(false)
const countdownValue = ref(3)

// Dragging state
const dragStartMouseX = ref(0)
const dragStartMouseY = ref(0)
const dragStartSelectionX = ref(0)
const dragStartSelectionY = ref(0)
const dragStartWidth = ref(0)
const dragStartHeight = ref(0)

// Magnifier state
const magnifierActive = ref(false) // Will be activated when window is active
const isWindowActive = ref(false) // Track if this window is currently active
const magnifierSize = 200
const zoomFactor = 2
const magnifierCanvas = ref(null)
const fullScreenImage = ref(null)

// Webcam repositioning throttle
let webcamRepositionTimeout = null

// Arrow key navigation
const nudgeAmount = ref(10) // pixels to move/resize per arrow key press

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
    // If user has custom position, use that
    if (customToolbarPosition.value) {
        return {
            left: `${customToolbarPosition.value.x}px`,
            top: `${customToolbarPosition.value.y}px`
        }
    }

    // Otherwise, use automatic positioning based on selection rectangle
    const { left, top, width, height } = selectionRect.value
    const toolbarWidth = 400
    const margin = 10

    // Center toolbar horizontally relative to selection, keep on screen
    let toolbarLeft = Math.max(
        margin,
        Math.min(left + width / 2 - toolbarWidth / 2, window.innerWidth - toolbarWidth - margin)
    )

    // Position toolbar below selection, or inside if no space
    const toolbarTop = top + height + 70 > window.innerHeight ? top + height - 60 : top + height + 10

    return { left: `${toolbarLeft}px`, top: `${toolbarTop}px` }
})

const handleMouseDown = async (e) => {
    if (mode.value === 'editing' || mode.value === 'edited') return

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
    dragStartWidth.value = Math.abs(endX.value - startX.value)
    dragStartHeight.value = Math.abs(endY.value - startY.value)
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

        // Reposition webcam during resize (throttled)
        repositionWebcam(true)
    } else if (mode.value === 'moving') {
        const deltaX = e.clientX - dragStartMouseX.value
        const deltaY = e.clientY - dragStartMouseY.value

        const newLeft = dragStartSelectionX.value + deltaX
        const newTop = dragStartSelectionY.value + deltaY
        const newRight = newLeft + dragStartWidth.value
        const newBottom = newTop + dragStartHeight.value

        let finalLeft = newLeft
        let finalTop = newTop
        let finalRight = newRight
        let finalBottom = newBottom

        // Minimum size to prevent selection from disappearing
        const minSize = 10

        // Handle horizontal boundaries and retraction
        if (newLeft < 0) {
            // Pushing against left edge - retract from left
            const overpush = Math.abs(newLeft)
            finalLeft = 0
            finalRight = Math.max(minSize, dragStartWidth.value - overpush)
        } else if (newRight > window.innerWidth) {
            // Pushing against right edge - retract from right
            const overpush = newRight - window.innerWidth
            finalRight = window.innerWidth
            finalLeft = Math.max(0, window.innerWidth - (dragStartWidth.value - overpush))
            // Ensure minimum size
            if (finalRight - finalLeft < minSize) {
                finalLeft = finalRight - minSize
            }
        } else {
            // Not pushing against horizontal edges - normal movement
            finalLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dragStartWidth.value))
            finalRight = finalLeft + dragStartWidth.value
        }

        // Handle vertical boundaries and retraction
        if (newTop < 0) {
            // Pushing against top edge - retract from top
            const overpush = Math.abs(newTop)
            finalTop = 0
            finalBottom = Math.max(minSize, dragStartHeight.value - overpush)
        } else if (newBottom > window.innerHeight) {
            // Pushing against bottom edge - retract from bottom
            const overpush = newBottom - window.innerHeight
            finalBottom = window.innerHeight
            finalTop = Math.max(0, window.innerHeight - (dragStartHeight.value - overpush))
            // Ensure minimum size
            if (finalBottom - finalTop < minSize) {
                finalTop = finalBottom - minSize
            }
        } else {
            // Not pushing against vertical edges - normal movement
            finalTop = Math.max(0, Math.min(newTop, window.innerHeight - dragStartHeight.value))
            finalBottom = finalTop + dragStartHeight.value
        }

        startX.value = finalLeft
        startY.value = finalTop
        endX.value = finalRight
        endY.value = finalBottom

        // Reposition webcam during move (throttled)
        repositionWebcam(true)
    }

    // Only update magnifier if this window is active
    if (isWindowActive.value && magnifierActive.value) {
        updateMagnifier(e.clientX, e.clientY)
    }
}

const handleMouseUp = async () => {
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

        // Reposition webcam after selection is created
        await repositionWebcam()
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

        // Reposition webcam after selection is resized
        await repositionWebcam()
    } else if (mode.value === 'moving') {
        magnifierActive.value = false
        mode.value = 'confirming'

        // Reposition webcam after selection is moved
        await repositionWebcam()
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
    showToolbar.value = false
    const { left, top, width, height } = selectionRect.value

    if (!isFullScreen.value) {
        const scale = displayScaleFactor.value || 1
        // Crop region must be in device pixels (desktopCapturer/video frames), so scale from CSS px
        const scaledLeft = Math.round(left * scale)
        const scaledTop = Math.round(top * scale)
        const scaledWidth = Math.round(width * scale)
        const scaledHeight = Math.round(height * scale)

        setEnableCrop(true)
        setCropRegion(scaledLeft, scaledTop, scaledWidth, scaledHeight)

        // Create overlay window to show border around selection
        try {
            const displayInfo = await window.electronWindows?.getCurrentWindowDisplayInfo?.()
            if (displayInfo?.success) {
                await window.electronWindows?.createWindow?.(`recording-overlay-${displayId.value}`, {
                    displayInfo: displayInfo.display,
                    params: {
                        selX: Math.round(left),
                        selY: Math.round(top),
                        selW: Math.round(width),
                        selH: Math.round(height)
                    }
                })
            }
        } catch (error) {
            console.error('Error creating overlay window:', error)
        }
    }

    // Prepare toolbar for recording transition
    const toolbarInfo = await prepareToolbarForRecording()

    // Check if countdown is enabled
    if (store.settings.recordingCountdown) {
        mode.value = 'countdown'
        showCountdown.value = true
        countdownValue.value = 3

        const timer = setInterval(() => {
            countdownValue.value--
            if (countdownValue.value <= 0) {
                clearInterval(timer)
                showCountdown.value = false
                finalizeRecordingStart(toolbarInfo)
            }
        }, 1000)
    } else {
        await finalizeRecordingStart(toolbarInfo)
    }
}

const finalizeRecordingStart = async (toolbarInfo) => {
    // Hide all UI elements
    mode.value = 'recording'
    fullScreenImage.value = null

    // Wait for DOM to update before making window non-blocking
    await nextTick()

    // Make window normal and resize to toolbar size
    // Pass toolbar position and size to maintain its screen location
    windowType.value = `recording-${displayId.value}`
    await window.electronWindows?.makeWindowNonBlocking?.(windowType.value, toolbarInfo.position, {
        width: showToolbar.value ? 450 : 215,
        height: 45
    })

    isRecording.value = true

    startRecording()
}

const selectAudioDevice = (audioDevice) => {
    selectedAudioDeviceId.value = audioDevice.deviceId
    lastSelectedAudioDeviceId.value = audioDevice.deviceId
    showAudioSettings.value = false
    // Save to settings
    store.updateSetting('selectedMicrophoneDeviceId', audioDevice.deviceId)
}

const muteAudio = () => {
    if (selectedAudioDeviceId.value) {
        lastSelectedAudioDeviceId.value = selectedAudioDeviceId.value
    }
    selectedAudioDeviceId.value = null
    showAudioSettings.value = false
    // Save muted state to settings
    store.updateSetting('selectedMicrophoneDeviceId', null)
}

const toggleAudioMute = () => {
    if (selectedAudioDeviceId.value) {
        // Currently unmuted, mute it
        muteAudio()
    } else {
        // Currently muted, unmute by selecting the last device or first available
        if (lastSelectedAudioDeviceId.value && audioDevices.value.some((device) => device.deviceId === lastSelectedAudioDeviceId.value)) {
            selectAudioDevice(audioDevices.value.find((device) => device.deviceId === lastSelectedAudioDeviceId.value))
        } else if (audioDevices.value.length > 0) {
            selectAudioDevice(audioDevices.value[0])
        }
    }
}

const toggleSystemAudio = () => {
    const newValue = !systemAudioEnabled.value
    setSystemAudioEnabled(newValue)
    // Save to settings
    store.updateSetting('systemAudioEnabled', newValue)
}

const repositionWebcam = async (throttle = false) => {
    if (!store.settings.webcamEnabled) return

    // Throttle repositioning during drag/resize operations
    if (throttle) {
        if (webcamRepositionTimeout) return
        webcamRepositionTimeout = setTimeout(() => {
            webcamRepositionTimeout = null
            repositionWebcam(false)
        }, 50) // Update every 50ms during drag/resize
        return
    }

    try {
        // Check if webcam window exists
        const windowCheck = await window.electronWindows?.getWindow?.('webcam')
        if (!windowCheck?.exists) return

        // Get the current window's display info to calculate webcam position
        const displayInfo = await window.electronWindows?.getCurrentWindowDisplayInfo?.()
        if (!displayInfo?.success) return

        const display = displayInfo.display
        const webcamWidth = 208
        const webcamHeight = 208
        const margin = 20

        let x, y

        if (isFullScreen.value) {
            // Position at bottom-right of display
            x = display.bounds.x + display.bounds.width - webcamWidth - margin
            y = display.bounds.y + display.bounds.height - webcamHeight - margin
        } else {
            // Position at bottom-right of selection rectangle
            const { left, top, width, height } = selectionRect.value
            x = display.bounds.x + left + width - webcamWidth - margin
            y = display.bounds.y + top + height - webcamHeight - margin
        }

        // Reposition the webcam window
        await window.electronWindows?.moveWindow?.('webcam', x, y)
    } catch (error) {
        console.error('Error repositioning webcam window:', error)
    }
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
            } else {
                // Webcam window already exists, just reposition it
                await repositionWebcam()
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

// Webcam settings dropdown logic
const showWebcamSettings = ref(false)
const webcamDropdownPosition = ref('bottom')
const webcamSettingsButtonRef = ref(null)
const webcamDropdownRef = ref(null)
const selectedWebcamDeviceId = ref(null)

const toggleWebcamSettings = async () => {
    showWebcamSettings.value = !showWebcamSettings.value
    if (showWebcamSettings.value) {
        // Close audio settings if open
        showAudioSettings.value = false
        await nextTick()
        updateWebcamDropdownPosition()
    }
}

const updateWebcamDropdownPosition = () => {
    if (!webcamSettingsButtonRef.value || !webcamDropdownRef.value) return

    const buttonRect = webcamSettingsButtonRef.value.getBoundingClientRect()
    const dropdownHeight = webcamDropdownRef.value.offsetHeight
    const spaceBelow = window.innerHeight - buttonRect.bottom
    const spaceAbove = buttonRect.top

    // If space below is less than dropdown height + padding (e.g. 20px), and space above is more, show on top
    if (spaceBelow < dropdownHeight + 20 && spaceAbove > dropdownHeight + 20) {
        webcamDropdownPosition.value = 'top'
    } else {
        webcamDropdownPosition.value = 'bottom'
    }
}

const selectWebcamDevice = async (device) => {
    selectedWebcamDeviceId.value = device.deviceId
    showWebcamSettings.value = false
    // Save to settings
    store.updateSetting('selectedWebcamDeviceId', device.deviceId)
    store.updateSetting('webcamEnabled', true)

    // Close and reopen webcam window with new device
    await window.electronWindows?.closeWindow?.('webcam')
    await enableWebcam()
}

const disableWebcam = async () => {
    selectedWebcamDeviceId.value = null
    showWebcamSettings.value = false
    // Save disabled state to settings
    store.updateSetting('selectedWebcamDeviceId', null)
    store.updateSetting('webcamEnabled', false)
    await window.electronWindows?.closeWindow?.('webcam')
}

const closeWebcamSettings = (e) => {
    // Close if clicking outside the webcam settings container
    const container = webcamSettingsButtonRef.value?.closest('.webcam-settings-container')
    if (showWebcamSettings.value && container && !container.contains(e.target)) {
        showWebcamSettings.value = false
    }
}

const handleStop = async () => {
    stopRecording()

    await window.electronWindows?.closeWindow?.('webcam')
    await window.electronWindows?.closeWindow?.(`recording-overlay-${displayId.value}`)

    // window.electronWindows?.resizeWindow?.(`recording-${displayId.value}`, 800, 600)
    // window.electronWindows?.centerWindow?.(`recording-${displayId.value}`)
}

const handleCancel = (event) => {
    window.electron?.cancelVideoRecordingMode()
    window.electronWindows?.closeWindow?.('webcam')
    window.electronWindows?.closeWindow?.(`recording-overlay-${displayId.value}`)
}

const handleEscapeKeyCancel = (event) => {
    // If called from button click (no event) or Escape key, cancel screenshot mode
    if (event.key === 'Escape') {
        console.log('handleEscapeKeyCancel')

        handleCancel()
    }
}

const handleStartStopTrigger = async () => {
    try {
        console.log('[VideoRecording] Start/Stop trigger received, mode:', mode.value, 'isRecording:', isRecording.value)

        if (mode.value === 'confirming' && !isRecording.value) {
            console.log('[VideoRecording] Starting recording via hotkey')
            await handleStart()
        } else if (isRecording.value) {
            console.log('[VideoRecording] Stopping recording via hotkey')
            await handleStop()
        } else {
            console.log('[VideoRecording] Ignoring start/stop trigger - not in correct state')
        }
    } catch (error) {
        console.error('[VideoRecording] Error handling start/stop trigger:', error)
    }
}

const handleToggleMicrophoneTrigger = () => {
    try {
        console.log('[VideoRecording] Toggle microphone trigger received, mode:', mode.value, 'isRecording:', isRecording.value)

        // Only allow toggling in selection mode, not during active recording
        if (mode.value === 'confirming' && !isRecording.value) {
            console.log('[VideoRecording] Toggling microphone via hotkey')
            toggleAudioMute()
        } else {
            console.log('[VideoRecording] Ignoring microphone toggle - recording already started or not in selection mode')
        }
    } catch (error) {
        console.error('[VideoRecording] Error handling microphone toggle trigger:', error)
    }
}

const handleToggleWebcamTrigger = async () => {
    try {
        console.log('[VideoRecording] Toggle webcam trigger received, mode:', mode.value, 'isRecording:', isRecording.value)

        // Only allow toggling in selection mode, not during active recording
        if (mode.value === 'confirming' && !isRecording.value) {
            console.log('[VideoRecording] Toggling webcam via hotkey')
            await toggleWebcam()
        } else {
            console.log('[VideoRecording] Ignoring webcam toggle - recording already started or not in selection mode')
        }
    } catch (error) {
        console.error('[VideoRecording] Error handling webcam toggle trigger:', error)
    }
}

const handleArrowKeyNavigation = (event) => {
    // Only handle arrow keys when selection is confirmed (not during recording or countdown)
    if (mode.value !== 'confirming') return

    // Don't handle arrow keys if recording is active
    if (isRecording.value) return

    // Check if it's an arrow key
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (!arrowKeys.includes(event.key)) return

    event.preventDefault()

    const amount = nudgeAmount.value
    const shift = event.shiftKey

    if (!shift) {
        // Move the entire selection
        const { left, top, width, height } = selectionRect.value

        if (event.key === 'ArrowLeft') {
            // Move left - check boundary
            const delta = Math.min(amount, left)
            startX.value -= delta
            endX.value -= delta
        } else if (event.key === 'ArrowRight') {
            // Move right - check boundary
            const delta = Math.min(amount, window.innerWidth - (left + width))
            startX.value += delta
            endX.value += delta
        } else if (event.key === 'ArrowUp') {
            // Move up - check boundary
            const delta = Math.min(amount, top)
            startY.value -= delta
            endY.value -= delta
        } else if (event.key === 'ArrowDown') {
            // Move down - check boundary
            const delta = Math.min(amount, window.innerHeight - (top + height))
            startY.value += delta
            endY.value += delta
        }

        // Reposition webcam after arrow key movement
        repositionWebcam()
    } else {
        // Resize the selection (Shift + Arrow)
        if (event.key === 'ArrowLeft') {
            // Expand left - move left edge left
            startX.value = Math.max(0, startX.value - amount)
        } else if (event.key === 'ArrowRight') {
            // Expand right - move right edge right
            endX.value = Math.min(window.innerWidth, endX.value + amount)
        } else if (event.key === 'ArrowUp') {
            // Expand up - move top edge up
            startY.value = Math.max(0, startY.value - amount)
        } else if (event.key === 'ArrowDown') {
            // Expand down - move bottom edge down
            endY.value = Math.min(window.innerHeight, endY.value + amount)
        }

        // Reposition webcam after arrow key resize
        repositionWebcam()
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

const showToolbar = ref(true)

// Tooltip expansion sizes (manually configurable)
const TOOLBAR_SIZES = {
    collapsed: { width: 215, height: 45 },
    expanded: { width: 450, height: 45 },
    // Sizes when showing tooltips during recording
    collapsedWithTooltip: { width: 260, height: 90 },
    expandedWithTooltip: { width: 450, height: 90 }
}

const isHoveringToolbarButton = ref(false)

const handleToolbarButtonHover = async (hovering) => {
    if (!isRecording.value) return

    if (!store.settings.showTooltips) return

    isHoveringToolbarButton.value = hovering

    if (hovering) {
        // Expand window to show tooltips
        const sizes = showToolbar.value
            ? TOOLBAR_SIZES.expandedWithTooltip
            : TOOLBAR_SIZES.collapsedWithTooltip
        await window.electronWindows?.resizeWindow?.(
            `recording-${displayId.value}`,
            sizes.width,
            sizes.height
        )
    } else {
        // Restore to toolbar-only size
        const sizes = showToolbar.value
            ? TOOLBAR_SIZES.expanded
            : TOOLBAR_SIZES.collapsed
        await window.electronWindows?.resizeWindow?.(
            `recording-${displayId.value}`,
            sizes.width,
            sizes.height
        )
    }
}

const expandToolbar = async () => {
    if (isRecording.value) {
        const sizes = isHoveringToolbarButton.value
            ? TOOLBAR_SIZES.expandedWithTooltip
            : TOOLBAR_SIZES.expanded
        await window.electronWindows?.resizeWindow?.(
            `recording-${displayId.value}`,
            sizes.width,
            sizes.height
        )
    }

    showToolbar.value = true
}

const collapseToolbar = async () => {
    if (isRecording.value) {
        const sizes = isHoveringToolbarButton.value
            ? TOOLBAR_SIZES.collapsedWithTooltip
            : TOOLBAR_SIZES.collapsed
        await window.electronWindows?.resizeWindow?.(
            `recording-${displayId.value}`,
            sizes.width,
            sizes.height
        )
    }
    showToolbar.value = false
}

// Audio settings dropdown logic
const showAudioSettings = ref(false)
const audioDropdownPosition = ref('bottom')
const audioSettingsButtonRef = ref(null)
const audioDropdownRef = ref(null)
const lastSelectedAudioDeviceId = ref(null)

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
    document.addEventListener('click', closeWebcamSettings)
    window.addEventListener('resize', () => {
        if (showAudioSettings.value) updateDropdownPosition()
        if (showWebcamSettings.value) updateWebcamDropdownPosition()
    })
})

onUnmounted(() => {
    document.removeEventListener('click', closeAudioSettings)
    document.removeEventListener('click', closeWebcamSettings)
})

// Prepare toolbar for recording: capture position and size
const prepareToolbarForRecording = async () => {
    if (!toolbarContainerRef.value) {
        return { position: null, size: null, toolbarDimensions: null }
    }

    // Wait for DOM to be fully rendered
    await nextTick()
    await new Promise((resolve) =>
        requestAnimationFrame(() => {
            requestAnimationFrame(resolve)
        })
    )

    const rect = toolbarContainerRef.value.getBoundingClientRect()

    // Capture the toolbar's CENTER position (not top-left)
    // When recording starts, toolbar becomes centered in the window, so we need to maintain the center position
    const toolbarCenterX = rect.left + rect.width / 2
    const toolbarCenterY = rect.top + rect.height / 2
    // Get window's screen position to convert viewport coords to screen coords
    const windowBounds = await window.electronWindows?.getCurrentWindowDisplayInfo?.()
    let toolbarScreenPosition = null

    if (windowBounds?.success) {
        // Convert toolbar's center viewport position to screen coordinates
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

    return {
        position: toolbarScreenPosition
    }
}

// Start recording functionality
const {
    uiMode,
    recordingCanvas,
    screenVideo,
    sources,
    selectedSourceId,
    audioDevices,
    selectedAudioDeviceId,
    videoDevices,
    windowType,
    isRecording,
    recordingTime,
    filename,
    systemAudioEnabled,
    setCropRegion,
    setEnableCrop,
    setSystemAudioEnabled,
    startRecording,
    stopRecording,
    initialize,
    cleanup
} = useRecorder()

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
    document.addEventListener('keydown', handleArrowKeyNavigation)

    // Listen for global shortcut triggers from main process
    window.electron?.ipcRenderer?.on('trigger-start-stop-recording', handleStartStopTrigger)
    window.electron?.ipcRenderer?.on('trigger-toggle-microphone', handleToggleMicrophoneTrigger)
    window.electron?.ipcRenderer?.on('trigger-toggle-webcam', handleToggleWebcamTrigger)

    // Initialize recording
    await initialize()

    // Capture display scale factor for accurate cropping on HiDPI/Retina
    try {
        const displayInfo = await window.electronWindows?.getCurrentWindowDisplayInfo?.()
        if (displayInfo?.display?.scaleFactor) {
            displayScaleFactor.value = displayInfo.display.scaleFactor
        }
    } catch (error) {
        console.error('Failed to get display scale factor:', error)
    }

    // Load saved microphone device ID from settings
    const savedMicrophoneDeviceId = store.settings.selectedMicrophoneDeviceId
    if (savedMicrophoneDeviceId !== undefined && savedMicrophoneDeviceId !== null) {
        // Check if the saved device still exists in the available devices
        const deviceExists = audioDevices.value.some((device) => device.deviceId === savedMicrophoneDeviceId)
        if (deviceExists) {
            selectedAudioDeviceId.value = savedMicrophoneDeviceId
            lastSelectedAudioDeviceId.value = savedMicrophoneDeviceId
        } else {
            // Device no longer exists, clear the setting and set to null (muted)
            selectedAudioDeviceId.value = null
            store.updateSetting('selectedMicrophoneDeviceId', null)
        }
    } else {
        // No saved setting or explicitly muted - set to null
        selectedAudioDeviceId.value = null
    }

    // Load saved system audio setting from settings
    const savedSystemAudioEnabled = store.settings.systemAudioEnabled
    if (savedSystemAudioEnabled !== undefined) {
        setSystemAudioEnabled(savedSystemAudioEnabled)
    }

    // Load saved webcam device ID from settings
    const savedWebcamDeviceId = store.settings.selectedWebcamDeviceId
    if (savedWebcamDeviceId !== undefined && savedWebcamDeviceId !== null) {
        // Check if the saved device still exists in the available devices
        const webcamExists = videoDevices.value.some((device) => device.deviceId === savedWebcamDeviceId)
        if (webcamExists) {
            selectedWebcamDeviceId.value = savedWebcamDeviceId
        } else {
            // Device no longer exists, clear the setting
            selectedWebcamDeviceId.value = null
            store.updateSetting('selectedWebcamDeviceId', null)
            // Also disable webcam if device no longer exists
            if (store.settings.webcamEnabled) {
                store.updateSetting('webcamEnabled', false)
            }
        }
    } else if (store.settings.webcamEnabled && videoDevices.value.length > 0) {
        // Webcam is enabled but no device selected - select the first available
        selectedWebcamDeviceId.value = videoDevices.value[0].deviceId
        store.updateSetting('selectedWebcamDeviceId', videoDevices.value[0].deviceId)
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
    document.removeEventListener('keydown', handleArrowKeyNavigation)

    // Remove IPC listeners using the same handler references
    if (window.electron?.ipcRenderer?.removeListener) {
        window.electron.ipcRenderer.removeListener('trigger-start-stop-recording', handleStartStopTrigger)
        window.electron.ipcRenderer.removeListener('trigger-toggle-microphone', handleToggleMicrophoneTrigger)
        window.electron.ipcRenderer.removeListener('trigger-toggle-webcam', handleToggleWebcamTrigger)
    }

    window.electronWindows?.removeDisplayActivationChangedListener?.()

    // Cleanup toolbar drag listeners if still active
    if (isDraggingToolbar.value) {
        document.removeEventListener('mousemove', handleToolbarDragMove)
        document.removeEventListener('mouseup', handleToolbarDragEnd)
    }

    // Cleanup webcam reposition timeout
    if (webcamRepositionTimeout) {
        clearTimeout(webcamRepositionTimeout)
        webcamRepositionTimeout = null
    }

    // Cleanup recording
    cleanup()
})
</script>

<template>
    <!-- Selection Interface (when not recording) -->
    <div>
        <div v-if="uiMode === 'select'" class="fixed top-0 left-0 h-screen w-screen cursor-crosshair select-none"
            :class="{ 'pointer-events-none': loading }" :style="{
                backgroundImage: fullScreenImage ? `url(${fullScreenImage.src})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'top left',
                backgroundRepeat: 'no-repeat'
            }" @mousedown="handleMouseDown" @mousemove="handleMouseMove" @mouseup="handleMouseUp">
            <!-- Dark overlay for everything outside the selection -->
            <div v-if="mode === 'confirming' || mode === 'editing' || mode == 'edited'"
                class="pointer-events-none absolute top-0 left-0 h-full w-full bg-black/50" :style="{
                    clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${selectionRect.left
                        }px ${selectionRect.top}px, ${selectionRect.left}px ${selectionRect.top + selectionRect.height
                        }px, ${selectionRect.left + selectionRect.width}px ${selectionRect.top + selectionRect.height
                        }px, ${selectionRect.left + selectionRect.width}px ${selectionRect.top
                        }px, ${selectionRect.left}px ${selectionRect.top}px)`
                }"></div>

            <!-- Countdown Overlay -->
            <div v-if="mode === 'countdown' && showCountdown"
                class="fixed inset-0 z-100 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
                @mousedown.stop.prevent @mousemove.stop.prevent @mouseup.stop.prevent @click.stop.prevent
                @contextmenu.prevent>
                <div class="animate-pulse text-[150px] font-bold text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                    {{ countdownValue }}
                </div>
            </div>

            <!-- Selection rectangle -->
            <div v-if="mode !== 'idle' && !isRecording" :class="[
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
            ]" :style="{
                left: `${selectionRect.left}px`,
                top: `${selectionRect.top}px`,
                width: `${selectionRect.width}px`,
                height: `${selectionRect.height}px`,
                zIndex: 40
            }" @mousedown="handleSelectionMouseDown">
                <!-- Size Indicator Pill -->
                <SizeIndicatorPill :width="selectionRect.width" :height="selectionRect.height" />

                <!-- Resize handles -->
                <div v-if="mode === 'confirming' || mode === 'resizing'">
                    <div class="pointer-events-all dark:bg-dark-800 absolute -top-[5px] -left-[5px] h-[10px] w-[10px] cursor-nwse-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'top-left')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute -top-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 cursor-ns-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'top')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute -top-[5px] -right-[5px] h-[10px] w-[10px] cursor-nesw-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'top-right')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute top-1/2 -right-[5px] h-[10px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'right')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute -right-[5px] -bottom-[5px] h-[10px] w-[10px] cursor-nwse-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom-right')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute -bottom-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 cursor-ns-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute -bottom-[5px] -left-[5px] h-[10px] w-[10px] cursor-nesw-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom-left')"></div>
                    <div class="pointer-events-all dark:bg-dark-800 absolute top-1/2 -left-[5px] h-[10px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded-full border border-black bg-white dark:border-white"
                        @mousedown.stop="handleResizeHandleMouseDown($event, 'left')"></div>
                </div>
            </div>

            <!-- Instructions (only show on active window) -->
            <div v-if="mode === 'idle' && isWindowActive && !isRecording"
                class="pointer-events-none fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
                <p>Click and drag to select an area or click to capture full screen</p>
            </div>

            <!-- Crosshair (only when not confirming and window is active) -->
            <div v-if="
                shouldShowCrosshair &&
                mode !== 'confirming' &&
                mode !== 'editing' &&
                mode !== 'edited' &&
                mode !== 'countdown' &&
                isWindowActive &&
                !isRecording
            " class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-40 h-px transition-none"
                :style="{ top: mouseY + 'px' }" />
            <div v-if="
                shouldShowCrosshair &&
                mode !== 'confirming' &&
                mode !== 'editing' &&
                mode !== 'edited' &&
                mode !== 'countdown' &&
                isWindowActive &&
                !isRecording
            " class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-40 w-px transition-none"
                :style="{ left: mouseX + 'px' }" />

            <!-- Magnifier -->
            <div v-if="shouldShowMagnifier && magnifierActive && !isRecording"
                class="pointer-events-none fixed z-50 flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
                :style="magnifierStyle">
                <canvas ref="magnifierCanvas" class="h-full w-full" :width="magnifierSize"
                    :height="magnifierSize"></canvas>
            </div>
        </div>
        <!-- Action Toolbar -->
        <div v-if="mode === 'confirming' || isRecording" ref="toolbarContainerRef"
            class="toolbar-container z-50 flex items-center gap-4 overflow-visible" :class="{
                'shadow-2xl': isDraggingToolbar,
                'absolute transition-shadow duration-300 ease-in-out': !isRecording,
                'transition-shadow duration-300 ease-in-out': isRecording,
                'pb-10': isRecording
            }" :style="toolbarStyle">
            <!-- Drag Handle -->
            <Tooltip :text="store.settings.showTooltips ? 'Move' : ''">
                <div @mousedown="handleToolbarDragStart" @mouseenter="handleToolbarButtonHover(true)"
                    @mouseleave="handleToolbarButtonHover(false)" :class="{ drag: isRecording }"
                    class="dark:bg-dark-800/90 dark:hover:bg-dark-700 flex cursor-move items-center rounded-full bg-white/90 px-2 py-3 transition-colors hover:bg-gray-100">
                    <svg class="size-5 text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                </div>
            </Tooltip>

            <div class="relative">
                <Tooltip :spacing="isRecording ? 'mt-3' : 'mt-4'"
                    :text="store.settings.showTooltips ? (isRecording ? `Stop Recording (${store.settings.hotkeyStartStopRecording})` : `Start Recording (${store.settings.hotkeyStartStopRecording})`) : ''">
                    <div class="dark:bg-dark-800/90 rounded-full bg-white/90">
                        <button @click="isRecording ? handleStop() : handleStart()"
                            @mouseenter="handleToolbarButtonHover(true)" @mouseleave="handleToolbarButtonHover(false)"
                            class="flex cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-transparent px-4 py-2.5 transition-colors dark:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                                fill="#d73a3a" :class="{ 'recording-pulse': isRecording }">
                                <g clip-path="url(#clip0_4418_8039)">
                                    <path
                                        d="M11.97 2C6.44997 2 1.96997 6.48 1.96997 12C1.96997 17.52 6.44997 22 11.97 22C17.49 22 21.97 17.52 21.97 12C21.97 6.48 17.5 2 11.97 2ZM12 16.23C9.65997 16.23 7.76997 14.34 7.76997 12C7.76997 9.66 9.65997 7.77 12 7.77C14.34 7.77 16.23 9.66 16.23 12C16.23 14.34 14.34 16.23 12 16.23Z"
                                        fill="white" style="fill: var(--fillg)" class="recording-icon-inner" />
                                </g>
                                <defs>
                                    <clipPath id="clip0_4418_8039">
                                        <rect width="24" height="24" fill="white" />
                                    </clipPath>
                                </defs>
                            </svg>

                            <span>{{ isRecording ? 'Stop' : 'Record' }}</span>

                            <div v-if="isRecording">{{ recordingTime }}</div>
                        </button>
                    </div>
                </Tooltip>

                <Transition name="expand-button" enter-active-class="transition-all duration-300 ease-in-out"
                    leave-active-class="transition-all duration-300 ease-in-out" enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100" leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95">
                    <div v-if="!showToolbar" class="absolute top-1.5 -right-5">
                        <Tooltip :spacing="isRecording ? 'mt-3' : 'mt-4'"
                            :text="store.settings.showTooltips ? 'Show Toolbar' : ''">
                            <div class="dark:bg-dark-800/90 rounded-full bg-white/90">
                                <button @click="expandToolbar" @mouseenter="handleToolbarButtonHover(true)"
                                    @mouseleave="handleToolbarButtonHover(false)"
                                    class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 transition-colors">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M5.9668 13.28L10.3135 8.93333C10.8268 8.42 10.8268 7.58 10.3135 7.06667L5.9668 2.72"
                                            stroke="currentColor" class="text-gray-600 dark:text-gray-400"
                                            stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </Tooltip>
                    </div>
                </Transition>
            </div>

            <Transition name="toolbar-expand" enter-active-class="transition-all duration-300 ease-in-out"
                leave-active-class="transition-all duration-300 ease-in-out" enter-from-class="opacity-0 -translate-x-2"
                enter-to-class="opacity-100 translate-x-0" leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 -translate-x-2">
                <div v-if="showToolbar" class="flex items-center gap-4">
                    <div v-if="!isRecording" class="dark:bg-dark-800/90 flex items-center rounded-full bg-white/90">
                        <!-- Webcam Controls -->
                        <Tooltip :spacing="isRecording ? 'mt-3' : 'mt-4'" v-if="!showWebcamSettings"
                            :text="store.settings.showTooltips ? (store.settings.webcamEnabled ? `Disable webcam (${store.settings.hotkeyToggleWebcam})` : `Enable webcam (${store.settings.hotkeyToggleWebcam})`) : ''">
                            <div class="webcam-settings-container">
                                <div ref="webcamSettingsButtonRef"
                                    class="flex items-center overflow-hidden rounded-full" :class="{
                                        'bg-blue-100 dark:bg-blue-900/40': store.settings.webcamEnabled,
                                        'dark:bg-dark-700 bg-gray-100': showWebcamSettings
                                    }">
                                    <button @click="toggleWebcam" type="button"
                                        @mouseenter="handleToolbarButtonHover(true)"
                                        @mouseleave="handleToolbarButtonHover(false)"
                                        class="flex cursor-pointer items-center justify-center border-none bg-transparent py-2.5 pl-3 pr-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                        <svg v-if="store.settings.webcamEnabled" width="24" height="24"
                                            viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M21.15 6.17C20.74 5.95 19.88 5.72 18.71 6.54L17.24 7.58C17.13 4.47 15.78 3.25 12.5 3.25H6.5C3.08 3.25 1.75 4.58 1.75 8V16C1.75 18.3 3 20.75 6.5 20.75H12.5C15.78 20.75 17.13 19.53 17.24 16.42L18.71 17.46C19.33 17.9 19.87 18.04 20.3 18.04C20.67 18.04 20.96 17.93 21.15 17.83C21.56 17.62 22.25 17.05 22.25 15.62V8.38C22.25 6.95 21.56 6.38 21.15 6.17ZM11 11.38C9.97 11.38 9.12 10.54 9.12 9.5C9.12 8.46 9.97 7.62 11 7.62C12.03 7.62 12.88 8.46 12.88 9.5C12.88 10.54 12.03 11.38 11 11.38Z"
                                                fill="#2178FF" />
                                        </svg>

                                        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path opacity="0.4"
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
                                    </button>
                                    <button @click.stop="toggleWebcamSettings" type="button"
                                        @mouseenter="handleToolbarButtonHover(true)"
                                        @mouseleave="handleToolbarButtonHover(false)"
                                        class="flex cursor-pointer items-center justify-center border-none bg-transparent py-3.5 pl-1.5 pr-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M11.6209 5.22083L7.81753 9.02417C7.36836 9.47333 6.63336 9.47333 6.18419 9.02417L2.38086 5.22083"
                                                stroke="currentColor" class="text-gray-600 dark:text-gray-400"
                                                stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"
                                                stroke-linejoin="round" />
                                        </svg>
                                    </button>
                                </div>

                                <!-- Webcam Settings Dropdown -->
                                <div v-if="showWebcamSettings" ref="webcamDropdownRef"
                                    class="dark:border-dark-700 dark:bg-dark-800 absolute left-1/2 z-20 w-64 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
                                    :class="[webcamDropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2']">
                                    <div class="flex flex-col">
                                        <div v-for="device in videoDevices" :key="device.deviceId"
                                            @click="selectWebcamDevice(device)"
                                            class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                            :class="[
                                                selectedWebcamDeviceId === device.deviceId
                                                    ? 'font-medium text-blue-600 dark:text-blue-400'
                                                    : 'text-gray-700 dark:text-gray-300'
                                            ]">
                                            <span class="truncate">{{ device.label }}</span>
                                            <svg v-if="selectedWebcamDeviceId === device.deviceId" width="24"
                                                height="24" viewBox="0 0 24 24" fill="none"
                                                xmlns="http://www.w3.org/2000/svg">
                                                <path d="M7.75 12L10.58 14.83L16.25 9.16997" stroke="#2178FF"
                                                    stroke-width="2.0625" stroke-linecap="round"
                                                    stroke-linejoin="round" />
                                            </svg>
                                        </div>

                                        <div v-if="videoDevices.length === 0" class="px-4 py-2.5 text-sm text-gray-500">
                                            No cameras found
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Tooltip>

                        <div v-if="showWebcamSettings" class="webcam-settings-container">
                            <div ref="webcamSettingsButtonRef" class="flex items-center overflow-hidden rounded-full"
                                :class="{
                                    'bg-blue-100 dark:bg-blue-900/40': store.settings.webcamEnabled,
                                    'dark:bg-dark-700 bg-gray-100': showWebcamSettings
                                }">
                                <button @click="toggleWebcam" type="button" @mouseenter="handleToolbarButtonHover(true)"
                                    @mouseleave="handleToolbarButtonHover(false)"
                                    class="flex cursor-pointer items-center justify-center border-none bg-transparent py-2.5 pl-3 pr-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                    <svg v-if="store.settings.webcamEnabled" width="24" height="24" viewBox="0 0 24 24"
                                        fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M21.15 6.17C20.74 5.95 19.88 5.72 18.71 6.54L17.24 7.58C17.13 4.47 15.78 3.25 12.5 3.25H6.5C3.08 3.25 1.75 4.58 1.75 8V16C1.75 18.3 3 20.75 6.5 20.75H12.5C15.78 20.75 17.13 19.53 17.24 16.42L18.71 17.46C19.33 17.9 19.87 18.04 20.3 18.04C20.67 18.04 20.96 17.93 21.15 17.83C21.56 17.62 22.25 17.05 22.25 15.62V8.38C22.25 6.95 21.56 6.38 21.15 6.17ZM11 11.38C9.97 11.38 9.12 10.54 9.12 9.5C9.12 8.46 9.97 7.62 11 7.62C12.03 7.62 12.88 8.46 12.88 9.5C12.88 10.54 12.03 11.38 11 11.38Z"
                                            fill="#2178FF" />
                                    </svg>

                                    <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path opacity="0.4"
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
                                </button>
                                <button @click.stop="toggleWebcamSettings" type="button"
                                    @mouseenter="handleToolbarButtonHover(true)"
                                    @mouseleave="handleToolbarButtonHover(false)"
                                    class="flex cursor-pointer items-center justify-center border-none bg-transparent py-3.5 pl-1.5 pr-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M11.6209 5.22083L7.81753 9.02417C7.36836 9.47333 6.63336 9.47333 6.18419 9.02417L2.38086 5.22083"
                                            stroke="currentColor" class="text-gray-600 dark:text-gray-400"
                                            stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                </button>
                            </div>

                            <!-- Webcam Settings Dropdown -->
                            <div v-if="showWebcamSettings" ref="webcamDropdownRef"
                                @mouseenter="handleToolbarButtonHover(true)"
                                @mouseleave="handleToolbarButtonHover(false)"
                                class="dark:border-dark-700 dark:bg-dark-800 absolute left-1/2 z-20 w-64 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
                                :class="[webcamDropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2']">
                                <div class="flex flex-col">
                                    <div v-for="device in videoDevices" :key="device.deviceId"
                                        @click="selectWebcamDevice(device)"
                                        class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                        :class="[
                                            selectedWebcamDeviceId === device.deviceId
                                                ? 'font-medium text-blue-600 dark:text-blue-400'
                                                : 'text-gray-700 dark:text-gray-300'
                                        ]">
                                        <span class="truncate">{{ device.label }}</span>
                                        <svg v-if="selectedWebcamDeviceId === device.deviceId" width="24" height="24"
                                            viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M7.75 12L10.58 14.83L16.25 9.16997" stroke="#2178FF"
                                                stroke-width="2.0625" stroke-linecap="round" stroke-linejoin="round" />
                                        </svg>
                                    </div>

                                    <div v-if="videoDevices.length === 0" class="px-4 py-2.5 text-sm text-gray-500">
                                        No cameras found
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Audio Controls -->
                        <Tooltip :spacing="isRecording ? 'mt-3' : 'mt-4'" v-if="!showAudioSettings"
                            :text="store.settings.showTooltips ? (selectedAudioDeviceId ? `Mute microphone (${store.settings.hotkeyToggleMicrophone})` : `Unmute microphone (${store.settings.hotkeyToggleMicrophone})`) : ''">
                            <div class="audio-settings-container">
                                <div ref="audioSettingsButtonRef" class="flex items-center overflow-hidden rounded-full"
                                    :class="{
                                        'bg-blue-100 dark:bg-blue-900/40': selectedAudioDeviceId,
                                        'dark:bg-dark-700 bg-gray-100': showAudioSettings
                                    }">
                                    <button @click="toggleAudioMute" type="button"
                                        @mouseenter="handleToolbarButtonHover(true)"
                                        @mouseleave="handleToolbarButtonHover(false)"
                                        class="flex cursor-pointer items-center justify-center border-none bg-transparent py-2.5 pl-3 pr-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                        <svg v-if="selectedAudioDeviceId" width="24" height="24" viewBox="0 0 24 24"
                                            fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M19.1197 9.12C18.7297 9.12 18.4197 9.43 18.4197 9.82V11.4C18.4197 14.94 15.5397 17.82 11.9997 17.82C8.45969 17.82 5.57969 14.94 5.57969 11.4V9.81C5.57969 9.42 5.26969 9.11 4.87969 9.11C4.48969 9.11 4.17969 9.42 4.17969 9.81V11.39C4.17969 15.46 7.30969 18.81 11.2997 19.17V21.3C11.2997 21.69 11.6097 22 11.9997 22C12.3897 22 12.6997 21.69 12.6997 21.3V19.17C16.6797 18.82 19.8197 15.46 19.8197 11.39V9.81C19.8097 9.43 19.4997 9.12 19.1197 9.12Z"
                                                fill="#2178FF" />
                                            <path
                                                d="M12.0001 2C9.56008 2 7.58008 3.98 7.58008 6.42V11.54C7.58008 13.98 9.56008 15.96 12.0001 15.96C14.4401 15.96 16.4201 13.98 16.4201 11.54V6.42C16.4201 3.98 14.4401 2 12.0001 2ZM13.3101 8.95C13.2401 9.21 13.0101 9.38 12.7501 9.38C12.7001 9.38 12.6501 9.37 12.6001 9.36C12.2101 9.25 11.8001 9.25 11.4101 9.36C11.0901 9.45 10.7801 9.26 10.7001 8.95C10.6101 8.64 10.8001 8.32 11.1101 8.24C11.7001 8.08 12.3201 8.08 12.9101 8.24C13.2101 8.32 13.3901 8.64 13.3101 8.95ZM13.8401 7.01C13.7501 7.25 13.5301 7.39 13.2901 7.39C13.2201 7.39 13.1601 7.38 13.0901 7.36C12.3901 7.1 11.6101 7.1 10.9101 7.36C10.6101 7.47 10.2701 7.31 10.1601 7.01C10.0501 6.71 10.2101 6.37 10.5101 6.27C11.4701 5.92 12.5301 5.92 13.4901 6.27C13.7901 6.38 13.9501 6.71 13.8401 7.01Z"
                                                fill="#2178FF" />
                                        </svg>

                                        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none"
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
                                    </button>
                                    <button @click.stop="toggleAudioSettings" type="button"
                                        @mouseenter="handleToolbarButtonHover(true)"
                                        @mouseleave="handleToolbarButtonHover(false)"
                                        class="flex cursor-pointer items-center justify-center border-none bg-transparent py-3.5 pl-1.5 pr-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M11.6209 5.22083L7.81753 9.02417C7.36836 9.47333 6.63336 9.47333 6.18419 9.02417L2.38086 5.22083"
                                                stroke="currentColor" class="text-gray-600 dark:text-gray-400"
                                                stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"
                                                stroke-linejoin="round" />
                                        </svg>
                                    </button>
                                </div>

                                <!-- Audio Settings Dropdown -->
                                <div v-if="showAudioSettings" ref="audioDropdownRef"
                                    @mouseenter="handleToolbarButtonHover(true)"
                                    @mouseleave="handleToolbarButtonHover(false)"
                                    class="dark:border-dark-700 dark:bg-dark-800 absolute left-1/2 z-20 w-64 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
                                    :class="[audioDropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2']">
                                    <div class="flex flex-col">
                                        <!-- System Audio Toggle -->
                                        <div @click="toggleSystemAudio"
                                            class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                            :class="[
                                                systemAudioEnabled
                                                    ? 'font-medium text-blue-600 dark:text-blue-400'
                                                    : 'text-gray-700 dark:text-gray-300'
                                            ]">
                                            <div class="flex items-center gap-2">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                                                    xmlns="http://www.w3.org/2000/svg">
                                                    <path
                                                        d="M14.02 3.78C12.9 3.16 11.47 3.32 10.01 4.23L7.09 6.06C6.89 6.18 6.66 6.25 6.43 6.25H5.5H5C2.58 6.25 1.25 7.58 1.25 10V14C1.25 16.42 2.58 17.75 5 17.75H5.5H6.43C6.66 17.75 6.89 17.82 7.09 17.94L10.01 19.77C10.89 20.32 11.75 20.59 12.55 20.59C13.07 20.59 13.57 20.47 14.02 20.22C15.13 19.6 15.75 18.31 15.75 16.59V7.41C15.75 5.69 15.13 4.4 14.02 3.78Z"
                                                        :fill="systemAudioEnabled ? '#2178FF' : '#6C82A3'" />
                                                    <path v-if="systemAudioEnabled"
                                                        d="M18.0001 16.75C17.8401 16.75 17.6901 16.7 17.5501 16.6C17.2201 16.35 17.1501 15.88 17.4001 15.55C18.2201 14.46 18.6701 13.15 18.6701 11.77C18.6701 10.43 18.2501 9.16002 17.4801 8.09002C17.2401 7.76002 17.3201 7.29002 17.6501 7.05002C17.9801 6.81002 18.4501 6.89002 18.6901 7.22002C19.6601 8.56002 20.1801 10.13 20.1801 11.78C20.1801 13.48 19.6201 15.1 18.5901 16.46C18.4501 16.65 18.2201 16.75 18.0001 16.75Z"
                                                        fill="#2178FF" />
                                                </svg>
                                                <span>System Audio</span>
                                            </div>
                                            <svg v-if="systemAudioEnabled" width="24" height="24" viewBox="0 0 24 24"
                                                fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M7.75 12L10.58 14.83L16.25 9.16997" stroke="#2178FF"
                                                    stroke-width="2.0625" stroke-linecap="round"
                                                    stroke-linejoin="round" />
                                            </svg>
                                        </div>

                                        <!-- Divider -->
                                        <div class="dark:border-dark-600 my-1 border-t border-gray-100"></div>

                                        <!-- Microphone devices -->
                                        <div v-for="audioDevice in audioDevices" :key="audioDevice.deviceId"
                                            @click="selectAudioDevice(audioDevice)"
                                            class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                            :class="[
                                                selectedAudioDeviceId === audioDevice.deviceId
                                                    ? 'font-medium text-blue-600 dark:text-blue-400'
                                                    : 'text-gray-700 dark:text-gray-300'
                                            ]">
                                            <span class="truncate">{{ audioDevice.label }}</span>
                                            <svg v-if="selectedAudioDeviceId === audioDevice.deviceId" width="24"
                                                height="24" viewBox="0 0 24 24" fill="none"
                                                xmlns="http://www.w3.org/2000/svg">
                                                <path d="M7.75 12L10.58 14.83L16.25 9.16997" stroke="#2178FF"
                                                    stroke-width="2.0625" stroke-linecap="round"
                                                    stroke-linejoin="round" />
                                            </svg>
                                        </div>

                                        <div v-if="audioDevices.length === 0" class="px-4 py-2.5 text-sm text-gray-500">
                                            No microphones found
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Tooltip>

                        <div v-if="showAudioSettings" class="audio-settings-container">
                            <div ref="audioSettingsButtonRef" class="flex items-center overflow-hidden rounded-full"
                                :class="{
                                    'bg-blue-100 dark:bg-blue-900/40': selectedAudioDeviceId,
                                    'dark:bg-dark-700 bg-gray-100': showAudioSettings
                                }">
                                <button @click="toggleAudioMute" type="button"
                                    @mouseenter="handleToolbarButtonHover(true)"
                                    @mouseleave="handleToolbarButtonHover(false)"
                                    class="flex cursor-pointer items-center justify-center border-none bg-transparent py-2.5 pl-3 pr-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                    <svg v-if="selectedAudioDeviceId" width="24" height="24" viewBox="0 0 24 24"
                                        fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M19.1197 9.12C18.7297 9.12 18.4197 9.43 18.4197 9.82V11.4C18.4197 14.94 15.5397 17.82 11.9997 17.82C8.45969 17.82 5.57969 14.94 5.57969 11.4V9.81C5.57969 9.42 5.26969 9.11 4.87969 9.11C4.48969 9.11 4.17969 9.42 4.17969 9.81V11.39C4.17969 15.46 7.30969 18.81 11.2997 19.17V21.3C11.2997 21.69 11.6097 22 11.9997 22C12.3897 22 12.6997 21.69 12.6997 21.3V19.17C16.6797 18.82 19.8197 15.46 19.8197 11.39V9.81C19.8097 9.43 19.4997 9.12 19.1197 9.12Z"
                                            fill="#2178FF" />
                                        <path
                                            d="M12.0001 2C9.56008 2 7.58008 3.98 7.58008 6.42V11.54C7.58008 13.98 9.56008 15.96 12.0001 15.96C14.4401 15.96 16.4201 13.98 16.4201 11.54V6.42C16.4201 3.98 14.4401 2 12.0001 2ZM13.3101 8.95C13.2401 9.21 13.0101 9.38 12.7501 9.38C12.7001 9.38 12.6501 9.37 12.6001 9.36C12.2101 9.25 11.8001 9.25 11.4101 9.36C11.0901 9.45 10.7801 9.26 10.7001 8.95C10.6101 8.64 10.8001 8.32 11.1101 8.24C11.7001 8.08 12.3201 8.08 12.9101 8.24C13.2101 8.32 13.3901 8.64 13.3101 8.95ZM13.8401 7.01C13.7501 7.25 13.5301 7.39 13.2901 7.39C13.2201 7.39 13.1601 7.38 13.0901 7.36C12.3901 7.1 11.6101 7.1 10.9101 7.36C10.6101 7.47 10.2701 7.31 10.1601 7.01C10.0501 6.71 10.2101 6.37 10.5101 6.27C11.4701 5.92 12.5301 5.92 13.4901 6.27C13.7901 6.38 13.9501 6.71 13.8401 7.01Z"
                                            fill="#2178FF" />
                                    </svg>

                                    <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none"
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
                                </button>
                                <button @click.stop="toggleAudioSettings" type="button"
                                    @mouseenter="handleToolbarButtonHover(true)"
                                    @mouseleave="handleToolbarButtonHover(false)"
                                    class="flex cursor-pointer items-center justify-center border-none bg-transparent py-3.5 pl-1.5 pr-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M11.6209 5.22083L7.81753 9.02417C7.36836 9.47333 6.63336 9.47333 6.18419 9.02417L2.38086 5.22083"
                                            stroke="currentColor" class="text-gray-600 dark:text-gray-400"
                                            stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                </button>
                            </div>

                            <!-- Audio Settings Dropdown -->
                            <div v-if="showAudioSettings" ref="audioDropdownRef"
                                @mouseenter="handleToolbarButtonHover(true)"
                                @mouseleave="handleToolbarButtonHover(false)"
                                class="dark:border-dark-700 dark:bg-dark-800 absolute left-1/2 z-20 w-64 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl"
                                :class="[audioDropdownPosition === 'top' ? 'bottom-full mb-2' : 'top-full mt-2']">
                                <div class="flex flex-col">
                                    <!-- System Audio Toggle -->
                                    <div @click="toggleSystemAudio"
                                        class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                        :class="[
                                            systemAudioEnabled
                                                ? 'font-medium text-blue-600 dark:text-blue-400'
                                                : 'text-gray-700 dark:text-gray-300'
                                        ]">
                                        <div class="flex items-center gap-2">
                                            <span>System Audio</span>
                                        </div>
                                        <svg v-if="systemAudioEnabled" width="24" height="24" viewBox="0 0 24 24"
                                            fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M7.75 12L10.58 14.83L16.25 9.16997" stroke="#2178FF"
                                                stroke-width="2.0625" stroke-linecap="round" stroke-linejoin="round" />
                                        </svg>
                                    </div>

                                    <!-- Divider -->
                                    <div class="dark:border-dark-600 my-1 border-t border-gray-100"></div>

                                    <!-- Microphone devices -->
                                    <div v-for="audioDevice in audioDevices" :key="audioDevice.deviceId"
                                        @click="selectAudioDevice(audioDevice)"
                                        class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                                        :class="[
                                            selectedAudioDeviceId === audioDevice.deviceId
                                                ? 'font-medium text-blue-600 dark:text-blue-400'
                                                : 'text-gray-700 dark:text-gray-300'
                                        ]">
                                        <span class="truncate">{{ audioDevice.label }}</span>
                                        <svg v-if="selectedAudioDeviceId === audioDevice.deviceId" width="24"
                                            height="24" viewBox="0 0 24 24" fill="none"
                                            xmlns="http://www.w3.org/2000/svg">
                                            <path d="M7.75 12L10.58 14.83L16.25 9.16997" stroke="#2178FF"
                                                stroke-width="2.0625" stroke-linecap="round" stroke-linejoin="round" />
                                        </svg>
                                    </div>

                                    <div v-if="audioDevices.length === 0" class="px-4 py-2.5 text-sm text-gray-500">
                                        No microphones found
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Tooltip :spacing="isRecording ? 'mt-3' : 'mt-4'"
                        :text="store.settings.showTooltips ? 'Cancel (esc)' : ''">
                        <div class="dark:bg-dark-800/90 rounded-full bg-white/90">
                            <button @click="handleCancel" @mouseenter="handleToolbarButtonHover(true)"
                                @mouseleave="handleToolbarButtonHover(false)"
                                class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 text-red-500 transition-colors hover:bg-red-500 hover:text-white dark:hover:bg-red-600">
                                <svg class="size-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2"
                                        stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </Tooltip>

                    <Tooltip :spacing="isRecording ? 'mt-3' : 'mt-4'"
                        :text="store.settings.showTooltips ? 'Hide Toolbar' : ''">
                        <div class="dark:bg-dark-800/90 rounded-full bg-white/90">
                            <button @click="collapseToolbar" @mouseenter="handleToolbarButtonHover(true)"
                                @mouseleave="handleToolbarButtonHover(false)"
                                class="dark:hover:bg-dark-700 flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 transition-colors hover:bg-gray-100">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                                    xmlns="http://www.w3.org/2000/svg">
                                    <path
                                        d="M10.0332 13.28L5.68654 8.93333C5.1732 8.42 5.1732 7.58 5.68654 7.06667L10.0332 2.72"
                                        stroke="currentColor" class="text-gray-600 dark:text-gray-400"
                                        stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"
                                        stroke-linejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </Tooltip>
                </div>
            </Transition>
        </div>
    </div>

    <VideoPreview v-if="uiMode == 'preview'" :filename="filename" @cancel="handleCancel" />

    <canvas ref="recordingCanvas" class="hidden"></canvas>
    <video class="hidden" ref="screenVideo" autoplay muted playsinline></video>
</template>

<style scoped>
@keyframes recordingPulse {

    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }

    50% {
        opacity: 0.6;
        transform: scale(0.92);
    }
}

.recording-pulse .recording-icon-inner {
    animation: recordingPulse 1.5s ease-in-out infinite;
    transform-origin: center;
}
</style>
