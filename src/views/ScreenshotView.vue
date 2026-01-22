<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import KonvaEditor from '../components/KonvaEditor.vue'
import SizeIndicatorPill from '../components/SizeIndicatorPill.vue'
import Tooltip from '../components/Tooltip.vue'
import { createWorker } from 'tesseract.js'
import { useStore } from '@/store'

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
const dragStartWidth = ref(0)
const dragStartHeight = ref(0)

// Magnifier state
const magnifierActive = ref(false) // Will be activated when window is active
const isWindowActive = ref(false) // Track if this window is currently active
const magnifierSize = 200
const zoomFactor = 2
const magnifierCanvas = ref(null)
const fullScreenImage = ref(null)

// OCR Modal state
const showOCRModal = ref(false)
const ocrText = ref('')
const ocrCopyTooltip = ref('Copy Text')

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

const shouldShowCursor = computed(() => {
    return store.settings.showCursor !== false
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

const konvaEditorRef = ref(null)

const backgroundSrc = computed(() => {
    if (!fullScreenImage.value) return null
    const { left, top, width, height } = selectionRect.value
    if (width <= 0 || height <= 0) return null

    // Wait for image to be loaded
    if (!fullScreenImage.value.complete || fullScreenImage.value.naturalWidth === 0) {
        return null
    }

    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1

    // Set canvas buffer size accounting for device pixel ratio for high quality
    const bufferWidth = Math.round(width * dpr)
    const bufferHeight = Math.round(height * dpr)
    canvas.width = bufferWidth
    canvas.height = bufferHeight

    // Set CSS size to display size
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Scale context to account for device pixel ratio
    ctx.scale(dpr, dpr)

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Calculate the scale between image natural size and display size
    const img = fullScreenImage.value
    const imgW = img.naturalWidth
    const imgH = img.naturalHeight
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const scaleX = imgW / viewW
    const scaleY = imgH / viewH

    // Convert selection coordinates to image coordinates
    const srcLeft = left * scaleX
    const srcTop = top * scaleY
    const srcWidth = width * scaleX
    const srcHeight = height * scaleY

    ctx.drawImage(img, srcLeft, srcTop, srcWidth, srcHeight, 0, 0, width, height)

    return canvas.toDataURL('image/png')
})

const getEditedDataUrl = () => {
    const dpr = window.devicePixelRatio || 1
    return konvaEditorRef.value?.exportPNG?.({ pixelRatio: dpr, mimeType: 'image/png' }) || null
}

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
    if (mode.value === 'editing' || mode.value === 'edited') return

    // Close other screenshot windows when user starts selecting on this monitor
    try {
        await window.electronWindows?.closeOtherScreenshotWindows(displayId.value)
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

// Action handlers
const handleSave = async () => {
    try {
        const now = new Date()
        const timestamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-') + '_' + [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join('-')
        const { left, top, width, height } = selectionRect.value

        const options = {
            type: 'area',
            bounds: {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(width),
                height: Math.round(height)
            },
            displayId: displayId.value
        }

        if (mode.value === 'edited') {
            const dataUrl = getEditedDataUrl()
            if (!dataUrl) {
                console.error('Failed to get edited data URL')
                return
            }
            options.dataUrl = dataUrl
            options.defaultFilename = `screenshot_edited_${timestamp}.png`
        } else {
            options.defaultFilename = `Screenshot_${timestamp}.png`
        }

        const promptForSaveLocation = store.settings.promptForSaveLocation

        let saveResult
        if (promptForSaveLocation) {
            saveResult = await window.electron?.invoke('save-screenshot-with-dialog', options)
        } else {
            saveResult = await window.electron?.invoke('save-screenshot-directly', options)
        }

        if (saveResult?.success) {
            // Window is closed by the main process after successful save
            console.log('Screenshot saved successfully:', saveResult.path)
            store.lastCapture = saveResult.path
        } else if (saveResult?.canceled) {
            // User canceled, windows are shown again by main process
            console.log('Save canceled by user')
        } else {
            console.error('Save failed:', saveResult?.error)
        }

        return saveResult
    } catch (error) {
        console.error('Error saving screenshot:', error)
    }
}
const handleUpload = () => captureAndUpload()
const handleCopy = () => copyToClipboard()
const handleOCR = () => readOCR()
const handleSearch = () => searchSimilerImage()
const handleCancel = (event) => {
    window.electron?.cancelScreenshotMode()
}

const handleEscapeKeyCancel = (event) => {
    // If called from button click (no event) or Escape key, cancel screenshot mode
    if (event.key === 'Escape') {
        // First check if OCR modal is open, close it instead of canceling screenshot
        if (showOCRModal.value) {
            closeOCRModal()
            return
        }
        window.electron?.cancelScreenshotMode()
    }
}

const captureArea = async (closeWindow = true) => {
    try {
        const { left, top, width, height } = selectionRect.value
        const result = await window.electron?.takeScreenshot(
            'area',
            {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(width),
                height: Math.round(height)
            },
            displayId.value,
            closeWindow
        )

        if (result?.success) {
            return result
        } else {
            console.error('Screenshot failed:', result?.error)
        }
    } catch (error) {
        console.error('Error capturing screenshot:', error)
    }
}

const bufferToFile = (buffer, fileName) => {
    return new File([new Blob([buffer], { type: 'image/png' })], fileName, { type: 'image/png' })
}

const captureAndUpload = async (searchSimilar = false) => {
    try {
        const notify = (payload) => window.electronNotifications?.notify(payload)

        if (mode.value === 'edited') {
            const dataUrl = getEditedDataUrl()
            if (dataUrl) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
                const fileName = `screenshot_${timestamp}.png`
                const file = base64ToFile(dataUrl, fileName)

                notify({
                    variant: 'upload',
                    fileInfo: {
                        dataUrl: dataUrl,
                        fileName: fileName,
                        fileSize: formatFileSize(file.size),
                        searchSimilar: searchSimilar
                    }
                })

                handleCancel()
                return
            }
        }

        const result = await captureArea()
        if (result?.success) {
            notify({
                variant: 'upload',
                fileInfo: {
                    path: result.path,
                    fileName: result.filename,
                    fileSize: formatFileSize(result.size),
                    searchSimilar: searchSimilar
                }
            })

            handleCancel()
        } else {
            console.error('Screenshot failed:', result?.error)
        }
    } catch (error) {
        console.error('Error capturing screenshot:', error)
    }
}

// Helper functions
const base64ToFile = (base64Data, fileName) => {
    const data = base64Data.replace(/^data:image\/\w+;base64,/, '')
    const bytes = new Uint8Array(
        atob(data)
            .split('')
            .map((c) => c.charCodeAt(0))
    )
    return new File([new Blob([bytes], { type: 'image/png' })], fileName, { type: 'image/png' })
}

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const value = bytes / Math.pow(k, i)

    if (sizes[i] === 'KB') {
        return `${Math.round(value)} KB` // no decimals
    } else if (sizes[i] === 'Bytes') {
        return `${bytes} Bytes` // keep as is
    } else {
        return `${value.toFixed(1)} ${sizes[i]}` // 1 decimal for MB, GB
    }
}

// Screenshot actions
const copyToClipboard = async () => {
    try {
        if (mode.value === 'edited') {
            const dataUrl = getEditedDataUrl()
            if (dataUrl) {
                // Use Electron's clipboard API to avoid user gesture restrictions
                const result = await window.electron?.copyDataUrlToClipboard(dataUrl)
                if (result?.success) {
                    handleCancel()
                } else {
                    console.error('Copy failed:', result?.error)
                }
                return
            }
        }
        const { left, top, width, height } = selectionRect.value
        const result = await window.electron?.copyScreenshot(
            'area',
            {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(width),
                height: Math.round(height)
            },
            displayId.value
        )

        if (result?.success) {
            handleCancel()
        } else {
            console.error('Copy failed:', result?.error)
        }
    } catch (error) {
        console.error('Error copying screenshot:', error)
    }
}

let ocrWorker = null

const cancelOCR = async () => {
    console.log('Cancel OCR clicked')
    loading.value = false
    showOCRModal.value = false
    if (ocrWorker) {
        try {
            await ocrWorker.terminate()
            ocrWorker = null
        } catch (error) {
            console.error('Error terminating OCR worker:', error)
        }
    }
}

const readOCR = async () => {
    try {
        const result = await captureArea(false)

        if (result?.success) {
            loading.value = true
            const buffer = await window.electron.readFileAsBuffer(result.path)
            const blobFile = bufferToFile(buffer, result.filename)

            ocrWorker = await createWorker('eng')
            const ret = await ocrWorker.recognize(blobFile)
            ocrText.value = ret.data.text
            await ocrWorker.terminate()
            ocrWorker = null
            showOCRModal.value = true
            loading.value = false
        } else {
            loading.value = false
            console.error('Screenshot failed:', result?.error)
        }
    } catch (error) {
        loading.value = false
        if (ocrWorker) {
            try {
                await ocrWorker.terminate()
                ocrWorker = null
            } catch (terminateError) {
                console.error('Error terminating OCR worker:', terminateError)
            }
        }
        console.error('Error capturing screenshot:', error)
    }
}

const copyOCRText = async () => {
    try {
        await navigator.clipboard.writeText(ocrText.value)
        ocrCopyTooltip.value = 'Copied!'
        setTimeout(() => {
            ocrCopyTooltip.value = 'Copy Text'
            closeOCRModal()
        }, 200)
    } catch (error) {
        console.error('Failed to copy OCR text:', error)
    }
}

const closeOCRModal = () => {
    showOCRModal.value = false
    ocrCopyTooltip.value = 'Copy Text'
}

const searchSimilerImage = async () => {
    captureAndUpload(true)
}

// Local keyboard shortcuts handler
const parseHotkeyString = (hotkeyStr) => {
    if (!hotkeyStr) return null
    const parts = hotkeyStr.split('+').map((p) => p.trim().toLowerCase())
    return {
        ctrl: parts.includes('ctrl') || parts.includes('control'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt') || parts.includes('option'),
        meta: parts.includes('cmd') || parts.includes('command') || parts.includes('meta'),
        key: parts[parts.length - 1]
    }
}

const matchesHotkey = (event, hotkeyStr) => {
    const hotkey = parseHotkeyString(hotkeyStr)
    if (!hotkey) return false

    const eventKey = event.key.toLowerCase()
    const keyMatches = eventKey === hotkey.key || event.code.toLowerCase() === hotkey.key

    // Match exactly what's stored - no cross-platform magic
    return (
        keyMatches &&
        event.ctrlKey === hotkey.ctrl &&
        event.metaKey === hotkey.meta &&
        event.shiftKey === hotkey.shift &&
        event.altKey === hotkey.alt
    )
}

const handleToolbarShortcuts = (event) => {
    // Only handle shortcuts when toolbar is visible (confirming or edited mode)
    if (mode.value !== 'confirming' && mode.value !== 'edited') return

    // Don't handle shortcuts if OCR modal is open
    if (showOCRModal.value) return

    // Check each toolbar shortcut and prevent default to avoid conflicts with native shortcuts
    if (matchesHotkey(event, store.settings.hotkeyUpload)) {
        event.preventDefault()
        handleUpload()
    } else if (matchesHotkey(event, store.settings.hotkeyCopy)) {
        event.preventDefault()
        handleCopy()
    } else if (matchesHotkey(event, store.settings.hotkeySave)) {
        event.preventDefault()
        handleSave()
    }
}

const handleArrowKeyNavigation = (event) => {
    // Only handle arrow keys when selection is confirmed
    if (mode.value !== 'confirming' && mode.value !== 'edited') return

    // Don't handle arrow keys if OCR modal is open
    if (showOCRModal.value) return

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
    }
}

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
    document.addEventListener('keydown', handleToolbarShortcuts)

    // Listen for IPC events from main process for local shortcuts
    window.electron?.ipcRenderer?.on('trigger-upload', () => {
        if (mode.value === 'confirming' || mode.value === 'edited') {
            handleUpload()
        }
    })
    window.electron?.ipcRenderer?.on('trigger-copy', () => {
        if (mode.value === 'confirming' || mode.value === 'edited') {
            handleCopy()
        }
    })
    window.electron?.ipcRenderer?.on('trigger-save', () => {
        if (mode.value === 'confirming' || mode.value === 'edited') {
            handleSave()
        }
    })
    document.addEventListener('keydown', handleArrowKeyNavigation)

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
    document.removeEventListener('keydown', handleToolbarShortcuts)
    document.removeEventListener('keydown', handleArrowKeyNavigation)
    window.electronWindows?.removeDisplayActivationChangedListener?.()

    // Remove IPC event listeners
    window.electron?.ipcRenderer?.removeListener('trigger-upload')
    window.electron?.ipcRenderer?.removeListener('trigger-copy')
    window.electron?.ipcRenderer?.removeListener('trigger-save')
})

// Editing
const handleEdit = () => {
    mode.value = 'editing'
}

const handleCancelEdit = () => {
    mode.value = 'confirming'
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
</script>

<template>
    <div :class="{ 'cursor-crosshair select-none': mode !== 'editing', 'pointer-events-none': loading }"
        class="fixed top-0 left-0 h-screen w-screen" :style="{
            backgroundImage: fullScreenImage ? `url(${fullScreenImage.src})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'top left',
            backgroundRepeat: 'no-repeat'
        }" @mousedown="handleMouseDown" @mousemove="
            (e) => {
                handleMouseMove(e)
                handleToolbarDragMove(e)
            }
        " @mouseup="
            (e) => {
                handleMouseUp(e)
                handleToolbarDragEnd()
            }
        ">
        <!-- Dark overlay for everything outside the selection -->
        <div v-if="mode === 'confirming' || mode === 'editing' || mode == 'edited'"
            class="pointer-events-none absolute top-0 left-0 h-full w-full bg-black/50" :style="{
                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${selectionRect.left
                    }px ${selectionRect.top}px, ${selectionRect.left}px ${selectionRect.top + selectionRect.height
                    }px, ${selectionRect.left + selectionRect.width}px ${selectionRect.top + selectionRect.height
                    }px, ${selectionRect.left + selectionRect.width}px ${selectionRect.top
                    }px, ${selectionRect.left}px ${selectionRect.top}px)`
            }"></div>

        <!-- Selection rectangle -->
        <div v-if="mode !== 'idle'" :class="[
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
                <div class="pointer-events-all absolute -top-[5px] -left-[5px] h-[10px] w-[10px] cursor-nwse-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'top-left')"></div>
                <div class="pointer-events-all absolute -top-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 cursor-ns-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'top')"></div>
                <div class="pointer-events-all absolute -top-[5px] -right-[5px] h-[10px] w-[10px] cursor-nesw-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'top-right')"></div>
                <div class="pointer-events-all absolute top-1/2 -right-[5px] h-[10px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'right')"></div>
                <div class="pointer-events-all absolute -right-[5px] -bottom-[5px] h-[10px] w-[10px] cursor-nwse-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom-right')"></div>
                <div class="pointer-events-all absolute -bottom-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 cursor-ns-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom')"></div>
                <div class="pointer-events-all absolute -bottom-[5px] -left-[5px] h-[10px] w-[10px] cursor-nesw-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'bottom-left')"></div>
                <div class="pointer-events-all absolute top-1/2 -left-[5px] h-[10px] w-[10px] -translate-y-1/2 cursor-ew-resize rounded-full border border-black bg-white"
                    @mousedown.stop="handleResizeHandleMouseDown($event, 'left')"></div>
            </div>
        </div>

        <!-- Instructions (only show on active window) -->
        <div v-if="mode === 'idle' && isWindowActive"
            class="pointer-events-none fixed top-1/2 left-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select an area or click to capture full screen</p>
        </div>

        <!-- Crosshair (only when not confirming and window is active) -->
        <div v-if="
            shouldShowCrosshair &&
            mode !== 'confirming' &&
            mode !== 'editing' &&
            mode !== 'edited' &&
            isWindowActive
        " class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-[99] h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div v-if="
            shouldShowCrosshair &&
            mode !== 'confirming' &&
            mode !== 'editing' &&
            mode !== 'edited' &&
            isWindowActive
        " class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-[99] w-px transition-none"
            :style="{ left: mouseX + 'px' }" />

        <!-- Magnifier -->
        <div v-if="shouldShowMagnifier && magnifierActive"
            class="pointer-events-none fixed z-[101] flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
            :style="magnifierStyle">
            <canvas ref="magnifierCanvas" class="h-full w-full" :width="magnifierSize" :height="magnifierSize"></canvas>
        </div>

        <!-- Action Toolbar -->
        <div v-if="mode === 'confirming' || mode === 'edited'"
            class="toolbar-container absolute z-[101] flex items-center gap-4 transition-shadow"
            :class="{ 'shadow-2xl': isDraggingToolbar }" :style="toolbarStyle" @mousedown.stop>
            <!-- Drag Handle -->
            <Tooltip :text="store.settings.showTooltips ? 'Move' : ''">
                <div class="dark:bg-dark-800/90 dark:hover:bg-dark-700 flex cursor-move items-center rounded-full bg-white/90 px-2 py-3 transition-colors hover:bg-gray-100"
                    @mousedown="handleToolbarDragStart">
                    <svg class="size-5 text-gray-600 transition-colors dark:text-gray-400" viewBox="0 0 24 24"
                        fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                </div>
            </Tooltip>

            <div class="dark:bg-dark-800/90 flex items-center rounded-full bg-white/90">
                <Tooltip :text="store.settings.showTooltips ? `Upload (${store.settings.hotkeyUpload})` : ''">
                    <button @click="handleUpload"
                        class="group hover:bg-primary-blue dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5 dark:text-gray-200">
                        <svg class="size-6 group-hover:text-white dark:text-gray-400" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M21.74 12.91C21.48 12.05 21.05 11.3 20.48 10.69C19.75 9.86 18.78 9.29 17.69 9.04C17.14 6.54 15.6 4.74 13.41 4.07C11.03 3.33 8.27 4.05 6.54 5.86C5.02 7.45 4.52 9.64 5.11 11.97C3.11 12.46 2.12 14.13 2.01 15.72C2 15.83 2 15.93 2 16.03C2 17.91 3.23 20.02 5.97 20.22H16.35C17.77 20.22 19.13 19.69 20.17 18.74C21.8 17.31 22.4 15.08 21.74 12.91Z"
                                fill="currentColor" />
                        </svg>
                        <span class="hidden group-hover:block group-hover:text-white"> Upload </span>
                    </button>
                </Tooltip>

                <Tooltip :text="store.settings.showTooltips ? `Copy (${store.settings.hotkeyCopy})` : ''">
                    <button @click="handleCopy"
                        class="group hover:bg-primary-blue dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5 dark:text-gray-200">
                        <svg class="size-6 group-hover:text-white dark:text-gray-400" viewBox="0 0 24 24" fill="none"
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
                </Tooltip>

                <Tooltip :text="store.settings.showTooltips ? `Save (${store.settings.hotkeySave})` : ''">
                    <button @click="handleSave"
                        class="group hover:bg-primary-blue dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5 dark:text-gray-200">
                        <svg class="size-6 group-hover:text-white dark:text-gray-400" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M8.78125 13.2002H15.4746C15.6843 13.2002 15.8564 13.3717 15.8564 13.585V19.5C15.8564 19.6933 15.6992 19.8496 15.5059 19.8496H8.75C8.55672 19.8496 8.40039 19.6933 8.40039 19.5V13.585C8.40039 13.3717 8.5716 13.2002 8.78125 13.2002ZM7.8252 3.15039C8.09431 3.1505 8.3125 3.36856 8.3125 3.6377V5.88672C8.3125 6.85441 9.09271 7.64062 10.0566 7.64062H14.2002C15.164 7.64049 15.9434 6.85433 15.9434 5.88672V4.21094C15.9434 4.14578 15.9785 4.09968 16.0195 4.0791C16.0582 4.05972 16.104 4.06116 16.1465 4.09961L18.5703 6.29492C19.3447 6.99621 19.787 7.99515 19.7871 9.04395V16.1514C19.7869 17.6994 18.8424 19.0247 17.502 19.5762C17.3737 19.6289 17.219 19.5336 17.2188 19.3623V13.585C17.2188 12.6173 16.4385 11.8311 15.4746 11.8311H8.78125C7.81734 11.8311 7.03711 12.6173 7.03711 13.585V19.4736C7.03709 19.6348 6.89786 19.7335 6.77051 19.6953C5.25543 19.2392 4.15058 17.8254 4.15039 16.1514V6.84863C4.15062 4.80501 5.79657 3.15039 7.8252 3.15039ZM10.0254 3.15039H14.2314C14.4246 3.15053 14.5811 3.30679 14.5811 3.5V5.88672C14.5811 6.09992 14.4098 6.27134 14.2002 6.27148H10.0566C9.84697 6.27148 9.6748 6.10001 9.6748 5.88672V3.5C9.6748 3.3067 9.83209 3.15039 10.0254 3.15039Z"
                                fill="currentColor" />
                        </svg>
                        <span class="hidden group-hover:block group-hover:text-white"> Save </span>
                    </button>
                </Tooltip>

                <Tooltip :text="store.settings.showTooltips ? 'Read text from image' : ''">
                    <button @click="handleOCR"
                        class="group hover:bg-primary-blue dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5 dark:text-gray-200">
                        <svg xmlns="http://www.w3.org/2000/svg" class="size-6 group-hover:text-white dark:text-gray-400"
                            viewBox="0 0 24 24" fill="currentColor">
                            <g clip-path="url(#clip0_4418_8491)">
                                <path
                                    d="M15.7999 2.21048C15.3899 1.80048 14.6799 2.08048 14.6799 2.65048V6.14048C14.6799 7.60048 15.9199 8.81048 17.4299 8.81048C18.3799 8.82048 19.6999 8.82048 20.8299 8.82048C21.3999 8.82048 21.6999 8.15048 21.2999 7.75048C19.8599 6.30048 17.2799 3.69048 15.7999 2.21048Z"
                                    fill="currentColor" style="fill: var(--fillg)" />
                                <path
                                    d="M20.5 10.19H17.61C15.24 10.19 13.31 8.26 13.31 5.89V3C13.31 2.45 12.86 2 12.31 2H8.07C4.99 2 2.5 4 2.5 7.57V16.43C2.5 20 4.99 22 8.07 22H15.93C19.01 22 21.5 20 21.5 16.43V11.19C21.5 10.64 21.05 10.19 20.5 10.19ZM11.5 17.75H7.5C7.09 17.75 6.75 17.41 6.75 17C6.75 16.59 7.09 16.25 7.5 16.25H11.5C11.91 16.25 12.25 16.59 12.25 17C12.25 17.41 11.91 17.75 11.5 17.75ZM13.5 13.75H7.5C7.09 13.75 6.75 13.41 6.75 13C6.75 12.59 7.09 12.25 7.5 12.25H13.5C13.91 12.25 14.25 12.59 14.25 13C14.25 13.41 13.91 13.75 13.5 13.75Z"
                                    fill="currentColor" style="fill: var(--fillg)" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8491">
                                    <rect width="24" height="24" fill="currentColor" />
                                </clipPath>
                            </defs>
                        </svg>
                        <span class="hidden group-hover:block group-hover:text-white"> OCR </span>
                    </button>
                </Tooltip>

                <Tooltip :text="store.settings.showTooltips ? 'Search with Google Lens' : ''">
                    <button @click="handleSearch"
                        class="group hover:bg-primary-blue dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5 dark:text-gray-200">
                        <svg class="size-6 group-hover:text-white dark:text-gray-400" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path d="M9.95 3.00002H7C4.79086 3.00002 3 4.79088 3 7.00002V9.25502" stroke="currentColor"
                                stroke-linecap="round" />
                            <path d="M9.95 21.07H7C4.79086 21.07 3 19.2791 3 17.07V14.815" stroke="currentColor"
                                stroke-linecap="round" />
                            <path d="M14.8146 3.00002H17.7646C19.9738 3.00002 21.7646 4.79088 21.7646 7.00002V9.25502"
                                stroke="currentColor" stroke-linecap="round" />
                            <path d="M14.8146 21.07H17.7646C19.9738 21.07 21.7646 19.2791 21.7646 17.07V14.815"
                                stroke="currentColor" stroke-linecap="round" />
                            <path
                                d="M11.7913 15.787C13.9775 15.787 15.7497 14.0148 15.7497 11.8287C15.7497 9.64258 13.9775 7.87038 11.7913 7.87038C9.60521 7.87038 7.83301 9.64258 7.83301 11.8287C7.83301 14.0148 9.60521 15.787 11.7913 15.787Z"
                                fill="currentColor" />
                            <path d="M16.1663 16.2037L15.333 15.3704" stroke="currentColor" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <span class="hidden group-hover:block group-hover:text-white"> Search </span>
                    </button>
                </Tooltip>

                <Tooltip :text="store.settings.showTooltips ? 'Open in editor' : ''">
                    <button @click="handleEdit"
                        class="group hover:bg-primary-blue dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5 dark:text-gray-200">
                        <svg class="size-6 group-hover:text-white dark:text-gray-400" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M21 22H3C2.59 22 2.25 21.66 2.25 21.25C2.25 20.84 2.59 20.5 3 20.5H21C21.41 20.5 21.75 20.84 21.75 21.25C21.75 21.66 21.41 22 21 22Z"
                                fill="currentColor" />
                            <path
                                d="M19.0196 3.48C17.0796 1.54 15.1796 1.49 13.1896 3.48L11.9796 4.69C11.8796 4.79 11.8396 4.95 11.8796 5.09C12.6396 7.74001 14.7596 9.86 17.4096 10.62C17.4496 10.63 17.4896 10.64 17.5296 10.64C17.6396 10.64 17.7396 10.6 17.8196 10.52L19.0196 9.31001C20.0096 8.33001 20.4896 7.38 20.4896 6.42C20.4996 5.43 20.0196 4.47 19.0196 3.48Z"
                                fill="currentColor" />
                            <path
                                d="M15.6103 11.53C15.3203 11.39 15.0403 11.25 14.7703 11.09C14.5503 10.96 14.3403 10.82 14.1303 10.67C13.9603 10.56 13.7603 10.4 13.5703 10.24C13.5503 10.23 13.4803 10.17 13.4003 10.09C13.0703 9.81 12.7003 9.45 12.3703 9.05C12.3403 9.03 12.2903 8.96 12.2203 8.87C12.1203 8.75 11.9503 8.55 11.8003 8.32C11.6803 8.17 11.5403 7.95 11.4103 7.73C11.2503 7.46 11.1103 7.19 10.9703 6.91C10.9491 6.86461 10.9286 6.81944 10.9088 6.77454C10.7612 6.44122 10.3265 6.34378 10.0688 6.60153L4.34032 12.33C4.21032 12.46 4.09032 12.71 4.06032 12.88L3.52032 16.71C3.42032 17.39 3.61032 18.03 4.03032 18.46C4.39032 18.81 4.89032 19 5.43032 19C5.55032 19 5.67032 18.99 5.79032 18.97L9.63032 18.43C9.81032 18.4 10.0603 18.28 10.1803 18.15L15.9016 12.4287C16.1612 12.1691 16.0633 11.7237 15.7257 11.5796C15.6877 11.5634 15.6492 11.5469 15.6103 11.53Z"
                                fill="currentColor" />
                        </svg>
                        <span class="hidden group-hover:block group-hover:text-white"> Edit </span>
                    </button>
                </Tooltip>
            </div>

            <Tooltip :text="store.settings.showTooltips ? 'Cancel (esc)' : ''">
                <div class="dark:bg-dark-800/90 flex items-center rounded-full bg-white/90">
                    <button @click="handleCancel"
                        class="group hover:bg-red-500 dark:hover:border-dark-800 flex cursor-pointer gap-2.5 rounded-full border border-transparent p-3 transition-all  dark:text-gray-200">
                        <svg class="size-6 group-hover:text-white" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                    </button>
                </div>
            </Tooltip>
        </div>

        <!-- Edit toolbar -->
        <KonvaEditor v-if="mode === 'editing' || mode === 'edited'" ref="konvaEditorRef" :editable="mode === 'editing'"
            :backgroundSrc="backgroundSrc" @cancel="handleCancelEdit" @save="mode = 'edited'"
            :selectionRect="selectionRect" :toolbarStyle="toolbarStyle" />

        <!-- OCR Loading Overlay -->
        <transition name="loading" enter-active-class="duration-300 ease-out" enter-from-class="opacity-0"
            enter-to-class="opacity-100" leave-active-class="duration-200 ease-in" leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div v-if="loading"
                class="fixed inset-0 z-1000 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">

                <div class="flex flex-col items-center justify-center text-center">
                    <!-- Spinner Animation -->
                    <div class="relative mb-6">
                        <div class="h-16 w-16 rounded-full border-4 border-white/20"></div>
                        <div
                            class="absolute top-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-white">
                        </div>
                    </div>

                    <!-- Loading Text with Animated Dots -->
                    <div class="flex items-center justify-center gap-1 text-white">
                        <span class="text-lg font-medium">Extracting text</span>
                        <div class="flex gap-1">
                            <div class="animation-delay-0 h-1 w-1 animate-pulse rounded-full bg-white"></div>
                            <div class="animation-delay-150 h-1 w-1 animate-pulse rounded-full bg-white"></div>
                            <div class="animation-delay-300 h-1 w-1 animate-pulse rounded-full bg-white"></div>
                        </div>
                    </div>

                    <!-- Progress Indicator -->
                    <div class="mt-4 text-sm text-white/70">Processing with OCR technology</div>

                    <!-- Close Button -->
                    <button @click.stop="cancelOCR"
                        class="flex z-10 h-10 w-10 mt-2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-all duration-200 hover:bg-red-500 hover:rotate-90"
                        title="Cancel OCR" type="button">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </transition>

        <!-- OCR Modal -->
        <transition name="modal" enter-active-class="duration-200 ease-out" enter-from-class="opacity-0"
            enter-to-class="opacity-100" leave-active-class="duration-150 ease-in" leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div v-if="showOCRModal" class="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50"
                @click.self="closeOCRModal">
                <transition name="modal-content" enter-active-class="duration-200 ease-out"
                    enter-from-class="opacity-0 scale-95 translate-y-4"
                    enter-to-class="opacity-100 scale-100 translate-y-0" leave-active-class="duration-150 ease-in"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-4">
                    <div v-if="showOCRModal"
                        class="relative w-full max-w-lg rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2 shadow-md">
                        <div class="dark:bg-dark-900 rounded-2xl bg-white p-6 shadow-2xl">
                            <!-- Modal Header -->
                            <div class="mb-6 flex items-center justify-between">
                                <h3 class="text-xl font-semibold text-gray-900 dark:text-white">OCR Text</h3>
                                <button @click="closeOCRModal"
                                    class="text-gray-7 dark:hover:bg-dark-700 rounded-full p-1.5 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:text-white">
                                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <!-- OCR Text Content -->
                            <div class="mb-8">
                                <div
                                    class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <textarea :value="ocrText" readonly
                                        class="h-48 w-full resize-none border-none bg-transparent text-sm text-gray-700 outline-none dark:text-gray-200"
                                        placeholder="OCR text will appear here...">
                                    </textarea>
                                </div>
                            </div>

                            <!-- Copy Button -->
                            <div class="flex justify-center">
                                <button @click="copyOCRText"
                                    class="bg-primary-blue flex items-center justify-center rounded-full px-8 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95">
                                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        stroke-width="2">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </transition>
            </div>
        </transition>
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
