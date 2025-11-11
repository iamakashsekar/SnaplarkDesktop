<script setup>
    import { ref, onMounted, onUnmounted, computed } from 'vue'
    import { apiClient } from '../api/config.js'
    import axios from 'axios'
    import KonvaEditor from '../components/KonvaEditor.vue'
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

    // Magnifier state
    const magnifierActive = ref(false) // Will be activated when window is active
    const isWindowActive = ref(false) // Track if this window is currently active
    const magnifierSize = 200
    const zoomFactor = 2
    const magnifierCanvas = ref(null)
    const fullScreenImage = ref(null)

    // Upload notifications
    const uploadNotifications = ref([])
    const nextNotificationId = ref(1)

    // OCR Modal state
    const showOCRModal = ref(false)
    const ocrText = ref('')
    const ocrCopyTooltip = ref('Copy Text')

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

    // Action handlers
    const handleSave = async () => {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
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
        window.electron?.cancelVideoRecordingMode()
    }

    const handleEscapeKeyCancel = (event) => {
        // If called from button click (no event) or Escape key, cancel screenshot mode
        if (event.key === 'Escape') {
            // First check if OCR modal is open, close it instead of canceling screenshot
            if (showOCRModal.value) {
                closeOCRModal()
                return
            }
            window.electron?.cancelVideoRecordingMode()
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

    // Notification actions
    const copyUploadLink = async (url) => {
        try {
            await navigator.clipboard.writeText(url)
        } catch (err) {
            console.error('Failed to copy link:', err)
        }
    }

    const shareUploadLink = (url) => {
        if (navigator.share) {
            navigator.share({ title: 'Screenshot', url }).catch(console.error)
        } else {
            window.open(url, '_blank')
        }
    }

    const removeNotification = (id) => {
        const index = uploadNotifications.value.findIndex((n) => n.id === id)
        if (index !== -1) uploadNotifications.value.splice(index, 1)
    }

    const retryUpload = (notification) => {
        removeNotification(notification.id)
        captureAndUpload()
    }

    // Screenshot actions
    const copyToClipboard = async () => {
        try {
            if (mode.value === 'edited') {
                const dataUrl = getEditedDataUrl()
                if (dataUrl) {
                    const res = await fetch(dataUrl)
                    const blob = await res.blob()
                    await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })])
                    handleCancel()
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

    const readOCR = async () => {
        try {
            const result = await captureArea(false)

            if (result?.success) {
                loading.value = true
                const buffer = await window.electron.readFileAsBuffer(result.path)
                const blobFile = bufferToFile(buffer, result.filename)

                const worker = await createWorker('eng')
                const ret = await worker.recognize(blobFile)
                ocrText.value = ret.data.text
                await worker.terminate()
                showOCRModal.value = true
                console.log(ret.data.text)
                loading.value = false
            } else {
                loading.value = false
                console.error('Screenshot failed:', result?.error)
            }
        } catch (error) {
            loading.value = false
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

    const showToolbar = ref(false)
</script>

<template>
    <div
        :class="{ 'cursor-crosshair select-none': mode !== 'editing', 'pointer-events-none': loading }"
        class="fixed top-0 left-0 h-screen w-screen"
        :style="{
            backgroundImage: fullScreenImage ? `url(${fullScreenImage.src})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'top left',
            backgroundRepeat: 'no-repeat'
        }"
        @mousedown="handleMouseDown"
        @mousemove="
            (e) => {
                handleMouseMove(e)
                handleToolbarDragMove(e)
            }
        "
        @mouseup="
            (e) => {
                handleMouseUp(e)
                handleToolbarDragEnd()
            }
        ">
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
            v-if="mode !== 'idle'"
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
            v-if="mode === 'idle' && isWindowActive"
            class="pointer-events-none fixed top-1/2 left-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select an area or click to capture full screen</p>
        </div>

        <!-- Crosshair (only when not confirming and window is active) -->
        <div
            v-if="
                shouldShowCrosshair &&
                mode !== 'confirming' &&
                mode !== 'editing' &&
                mode !== 'edited' &&
                isWindowActive
            "
            class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-[99] h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div
            v-if="
                shouldShowCrosshair &&
                mode !== 'confirming' &&
                mode !== 'editing' &&
                mode !== 'edited' &&
                isWindowActive
            "
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

        <!-- Action Toolbar -->
        <div
            v-if="mode === 'confirming' || mode === 'edited'"
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
                        @click="handleCancel"
                        title="Cancel"
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

                        <span>Record</span>
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
                            @click="handleCancel"
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
                            Video
                        </span>
                    </div>

                    <div class="group relative">
                        <button
                            @click="handleCancel"
                            title="Cancel"
                            class="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-none bg-transparent py-2.5 pr-4 transition-colors">
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

                        <span
                            class="bg-gray-black before:border-b-gray-black pointer-events-none absolute top-full left-1/2 z-10 mt-4 -translate-x-1/2 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-6 before:border-transparent before:content-['']">
                            Sound
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

        <!-- Edit toolbar -->
        <KonvaEditor
            v-if="mode === 'editing' || mode === 'edited'"
            ref="konvaEditorRef"
            :editable="mode === 'editing'"
            :backgroundSrc="backgroundSrc"
            @cancel="handleCancelEdit"
            @save="mode = 'edited'"
            :selectionRect="selectionRect"
            :toolbarStyle="toolbarStyle" />

        <!-- Upload Notifications -->
        <div class="fixed top-4 right-4 z-[10000] min-w-[380px] space-y-3">
            <transition-group
                name="notification"
                tag="div">
                <div
                    v-for="notification in uploadNotifications"
                    :key="notification.id"
                    class="rounded-lg border border-gray-100 bg-white p-4 shadow-2xl">
                    <!-- Uploading State -->
                    <div v-if="notification.status === 'uploading'">
                        <div class="mb-3 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                                    <svg
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M9 17H15V22H9V17Z"
                                            fill="#3B82F6" />
                                        <path
                                            d="M12 2L7 7H10V15H14V7H17L12 2Z"
                                            fill="#3B82F6" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 class="font-medium text-gray-900">Uploading</h4>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    @click="notification.status = 'minimized'"
                                    class="text-gray-400 hover:text-gray-600">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none">
                                        <path
                                            d="M5 8L10 13L15 8"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                                <button
                                    @click="removeNotification(notification.id)"
                                    class="text-gray-400 hover:text-gray-600">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none">
                                        <path
                                            d="M6 6L14 14M6 14L14 6"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="flex justify-between text-sm text-gray-500">
                                <span>{{ notification.fileSize }}</span>
                                <span>{{ notification.progress }}%</span>
                            </div>
                            <div class="h-2 w-full rounded-full bg-gray-200">
                                <div
                                    class="h-2 rounded-full bg-blue-500 transition-all duration-300"
                                    :style="{ width: `${notification.progress}%` }"></div>
                            </div>
                            <div class="text-center text-xs text-gray-400">
                                {{ notification.remainingTime || 'Calculating...' }}
                            </div>
                        </div>
                    </div>

                    <!-- Upload Complete State -->
                    <div v-else-if="notification.status === 'completed'">
                        <div class="mb-3 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                                    <svg
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M9 17H15V22H9V17Z"
                                            fill="#3B82F6" />
                                        <path
                                            d="M12 2L7 7H10V15H14V7H17L12 2Z"
                                            fill="#3B82F6" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 class="font-medium text-gray-900">Upload Complete</h4>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    @click="notification.status = 'minimized'"
                                    class="text-gray-400 hover:text-gray-600">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none">
                                        <path
                                            d="M5 8L10 13L15 8"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                                <button
                                    @click="removeNotification(notification.id)"
                                    class="text-gray-400 hover:text-gray-600">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none">
                                        <path
                                            d="M6 6L14 14M6 14L14 6"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="flex items-center justify-between rounded-lg bg-gray-50 p-2">
                                <a
                                    :href="notification.url"
                                    target="_blank"
                                    class="mr-2 flex-1 truncate text-sm text-blue-600 hover:text-blue-700">
                                    {{ notification.url }}
                                </a>
                                <div class="flex items-center gap-1">
                                    <button
                                        @click="copyUploadLink(notification.url)"
                                        class="rounded p-1.5 transition-colors hover:bg-gray-200"
                                        title="Copy Link">
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 18 18"
                                            fill="none">
                                            <path
                                                d="M12 1.5H3C2.175 1.5 1.5 2.175 1.5 3V12.75H3V3H12V1.5ZM14.25 4.5H6C5.175 4.5 4.5 5.175 4.5 6V15C4.5 15.825 5.175 16.5 6 16.5H14.25C15.075 16.5 15.75 15.825 15.75 15V6C15.75 5.175 15.075 4.5 14.25 4.5ZM14.25 15H6V6H14.25V15Z"
                                                fill="#6B7280" />
                                        </svg>
                                    </button>
                                    <button
                                        @click="shareUploadLink(notification.url)"
                                        class="rounded p-1.5 transition-colors hover:bg-gray-200"
                                        title="Share">
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 18 18"
                                            fill="none">
                                            <path
                                                d="M14.25 12.375C13.5525 12.375 12.9375 12.6975 12.5175 13.185L6.3075 9.735C6.345 9.5775 6.375 9.42 6.375 9.255C6.375 9.09 6.345 8.9325 6.3075 8.775L12.435 5.3625C12.87 5.88 13.515 6.2175 14.25 6.2175C15.495 6.2175 16.5 5.2125 16.5 3.9675C16.5 2.7225 15.495 1.7175 14.25 1.7175C13.005 1.7175 12 2.7225 12 3.9675C12 4.1325 12.03 4.29 12.0675 4.4475L5.94 7.86C5.505 7.3425 4.86 7.005 4.125 7.005C2.88 7.005 1.875 8.01 1.875 9.255C1.875 10.5 2.88 11.505 4.125 11.505C4.86 11.505 5.505 11.1675 5.94 10.65L12.1425 14.1075C12.105 14.25 12.0825 14.4 12.0825 14.55C12.0825 15.7575 13.065 16.74 14.2725 16.74C15.48 16.74 16.4625 15.7575 16.4625 14.55C16.4625 13.3425 15.48 12.36 14.2725 12.36L14.25 12.375Z"
                                                fill="#6B7280" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <button
                                @click="removeNotification(notification.id)"
                                class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">
                                Copy Link
                            </button>
                        </div>
                    </div>

                    <!-- Upload Failed State -->
                    <div v-else-if="notification.status === 'failed'">
                        <div class="mb-3 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                                    <svg
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"
                                            fill="#EF4444" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 class="font-medium text-gray-900">Upload Failed</h4>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    @click="notification.status = 'minimized'"
                                    class="text-gray-400 hover:text-gray-600">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none">
                                        <path
                                            d="M5 8L10 13L15 8"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                                <button
                                    @click="removeNotification(notification.id)"
                                    class="text-gray-400 hover:text-gray-600">
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none">
                                        <path
                                            d="M6 6L14 14M6 14L14 6"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="flex items-center gap-2 rounded-lg bg-red-50 p-3">
                                <div
                                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 16 16"
                                        fill="none">
                                        <path
                                            d="M8 1C4.13 1 1 4.13 1 8C1 11.87 4.13 15 8 15C11.87 15 15 11.87 15 8C15 4.13 11.87 1 8 1ZM8 9C7.45 9 7 8.55 7 8V5C7 4.45 7.45 4 8 4C8.55 4 9 4.45 9 5V8C9 8.55 8.55 9 8 9ZM9 11H7V13H9V11Z"
                                            fill="#EF4444" />
                                    </svg>
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-red-800">
                                        {{ notification.error }}
                                    </p>
                                </div>
                            </div>
                            <button
                                @click="retryUpload(notification)"
                                class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800">
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            </transition-group>
        </div>

        <!-- OCR Loading Overlay -->
        <transition
            name="loading"
            enter-active-class="duration-300 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="duration-200 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div
                v-if="loading"
                class="fixed inset-0 z-[25000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div class="flex flex-col items-center justify-center text-center">
                    <!-- Spinner Animation -->
                    <div class="relative mb-6">
                        <div class="h-16 w-16 rounded-full border-4 border-white/20"></div>
                        <div
                            class="absolute top-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-white"></div>
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
                </div>
            </div>
        </transition>

        <!-- OCR Modal -->
        <transition
            name="modal"
            enter-active-class="duration-200 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div
                v-if="showOCRModal"
                class="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50"
                @click.self="closeOCRModal">
                <transition
                    name="modal-content"
                    enter-active-class="duration-200 ease-out"
                    enter-from-class="opacity-0 scale-95 translate-y-4"
                    enter-to-class="opacity-100 scale-100 translate-y-0"
                    leave-active-class="duration-150 ease-in"
                    leave-from-class="opacity-100 scale-100 translate-y-0"
                    leave-to-class="opacity-0 scale-95 translate-y-4">
                    <div
                        v-if="showOCRModal"
                        class="relative w-full max-w-lg rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2 shadow-md">
                        <div class="rounded-2xl bg-white p-6 shadow-2xl">
                            <!-- Modal Header -->
                            <div class="mb-6 flex items-center justify-between">
                                <h3 class="text-xl font-semibold text-gray-900">OCR Text</h3>
                                <button
                                    @click="closeOCRModal"
                                    class="text-gray-7 rounded-full p-1.5 transition-colors hover:bg-gray-100 hover:text-gray-900">
                                    <svg
                                        class="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="2">
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <!-- OCR Text Content -->
                            <div class="mb-8">
                                <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <textarea
                                        :value="ocrText"
                                        readonly
                                        class="h-48 w-full resize-none border-none bg-transparent text-sm text-gray-700 outline-none"
                                        placeholder="OCR text will appear here...">
                                    </textarea>
                                </div>
                            </div>

                            <!-- Copy Button -->
                            <div class="flex justify-center">
                                <button
                                    @click="copyOCRText"
                                    class="bg-primary-blue flex items-center justify-center rounded-full px-8 py-3 text-white transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95">
                                    <svg
                                        class="h-5 w-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="2">
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
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
