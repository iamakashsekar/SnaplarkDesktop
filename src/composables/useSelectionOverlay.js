import { computed, onUnmounted, ref, watch } from 'vue'

export function useSelectionOverlay({
    screenVideo,
    shouldShowMagnifier,
    shouldShowCrosshair,
    isBusy = ref(false),
    blockedModes = [],
    arrowNavigationModes = ['confirming'],
    onBeforeSelectionStart = null,
    onSelectionStarted = null,
    onSelectionConfirmed = null,
    onSelectionResized = null,
    onSelectionMoved = null,
    onDuringTransform = null,
    onAfterTransform = null,
    canHandleArrowKey = null
} = {}) {
    const startX = ref(0)
    const startY = ref(0)
    const endX = ref(0)
    const endY = ref(0)
    const mouseX = ref(0)
    const mouseY = ref(0)
    const mode = ref('idle')
    const resizingHandle = ref(null)

    const dragStartMouseX = ref(0)
    const dragStartMouseY = ref(0)
    const dragStartSelectionX = ref(0)
    const dragStartSelectionY = ref(0)
    const dragStartWidth = ref(0)
    const dragStartHeight = ref(0)

    const magnifierActive = ref(false)
    const isWindowActive = ref(false)
    const magnifierSize = 200
    const zoomFactor = 2
    const magnifierCanvas = ref(null)

    const nudgeAmount = ref(10)

    const customToolbarPosition = ref(null)
    const isDraggingToolbar = ref(false)
    const toolbarDragStart = ref({ x: 0, y: 0 })

    let magnifierAnimationFrameId = null
    let magnifierVideoFrameCallbackId = null
    let checkerboardPatternContext = null
    let checkerboardPattern = null
    const checkerboardCanvas = document.createElement('canvas')
    const checkerboardSize = 10

    checkerboardCanvas.width = checkerboardSize * 2
    checkerboardCanvas.height = checkerboardSize * 2

    const checkerboardContext = checkerboardCanvas.getContext('2d')
    checkerboardContext.fillStyle = '#eee'
    checkerboardContext.fillRect(0, 0, checkerboardSize * 2, checkerboardSize * 2)
    checkerboardContext.fillStyle = '#ccc'
    checkerboardContext.fillRect(0, 0, checkerboardSize, checkerboardSize)
    checkerboardContext.fillRect(checkerboardSize, checkerboardSize, checkerboardSize, checkerboardSize)

    const selectionRect = computed(() => {
        const left = Math.min(startX.value, endX.value)
        const top = Math.min(startY.value, endY.value)
        const width = Math.abs(endX.value - startX.value)
        const height = Math.abs(endY.value - startY.value)
        return { left, top, width, height }
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
        }

        return 'animated-dashed-border-selecting-bottom-right'
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

    const shouldUseOverlayCursor = computed(() => {
        return (
            shouldShowMagnifier.value &&
            magnifierActive.value &&
            !isBusy.value &&
            (mode.value === 'idle' || mode.value === 'selecting')
        )
    })

    const overlayCursorStyle = computed(() => ({
        left: `${mouseX.value}px`,
        top: `${mouseY.value}px`
    }))

    const hasMagnifierFrame = () => {
        return !!(
            screenVideo.value &&
            screenVideo.value.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            screenVideo.value.videoWidth > 0 &&
            screenVideo.value.videoHeight > 0
        )
    }

    const shouldAnimateMagnifier = () => {
        return (
            shouldShowMagnifier.value &&
            isWindowActive.value &&
            magnifierActive.value &&
            !isBusy.value &&
            hasMagnifierFrame()
        )
    }

    const stopMagnifierLoop = () => {
        if (magnifierAnimationFrameId !== null) {
            cancelAnimationFrame(magnifierAnimationFrameId)
            magnifierAnimationFrameId = null
        }

        const video = screenVideo.value
        if (magnifierVideoFrameCallbackId !== null && video && typeof video.cancelVideoFrameCallback === 'function') {
            video.cancelVideoFrameCallback(magnifierVideoFrameCallbackId)
        }

        magnifierVideoFrameCallbackId = null
    }

    const hasScheduledMagnifierFrame = () => {
        return magnifierAnimationFrameId !== null || magnifierVideoFrameCallbackId !== null
    }

    const scheduleNextMagnifierFrame = () => {
        const video = screenVideo.value
        if (!shouldAnimateMagnifier() || !video) {
            stopMagnifierLoop()
            return
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
            magnifierVideoFrameCallbackId = video.requestVideoFrameCallback(() => {
                magnifierVideoFrameCallbackId = null
                renderMagnifierFrame()
            })
            return
        }

        magnifierAnimationFrameId = requestAnimationFrame(() => {
            magnifierAnimationFrameId = null
            renderMagnifierFrame()
        })
    }

    const renderMagnifierFrame = () => {
        if (!shouldAnimateMagnifier()) {
            stopMagnifierLoop()
            return
        }

        updateMagnifier(mouseX.value, mouseY.value)
        scheduleNextMagnifierFrame()
    }

    const ensureMagnifierLoop = () => {
        if (!shouldAnimateMagnifier()) {
            stopMagnifierLoop()
            return
        }

        if (!hasScheduledMagnifierFrame()) {
            renderMagnifierFrame()
        }
    }

    const updateMagnifier = (x, y) => {
        if (!magnifierCanvas.value || !hasMagnifierFrame()) return

        try {
            const canvas = magnifierCanvas.value
            const ctx = canvas.getContext('2d', { alpha: false })
            if (!ctx) return

            ctx.imageSmoothingEnabled = false
            ctx.clearRect(0, 0, magnifierSize, magnifierSize)

            const video = screenVideo.value
            const imgW = video.videoWidth
            const imgH = video.videoHeight
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

            if (!checkerboardPattern || checkerboardPatternContext !== ctx) {
                checkerboardPatternContext = ctx
                checkerboardPattern = ctx.createPattern(checkerboardCanvas, 'repeat')
            }

            ctx.fillStyle = checkerboardPattern
            ctx.fillRect(0, 0, magnifierSize, magnifierSize)

            if (interW > 0 && interH > 0) {
                const destX = ((interLeft - desiredLeft) / sourceWImg) * magnifierSize
                const destY = ((interTop - desiredTop) / sourceHImg) * magnifierSize
                const destW = (interW / sourceWImg) * magnifierSize
                const destH = (interH / sourceHImg) * magnifierSize

                ctx.drawImage(video, interLeft, interTop, interW, interH, destX, destY, destW, destH)
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
            console.error('Magnifier error:', error)
        }
    }

    const tryUpdateMagnifier = () => {
        if (magnifierCanvas.value && shouldAnimateMagnifier()) {
            updateMagnifier(mouseX.value, mouseY.value)
        }
    }

    const handleScreenVideoReady = () => {
        setTimeout(() => {
            tryUpdateMagnifier()
            ensureMagnifierLoop()
        }, 10)
    }

    const handleDisplayActivationChanged = (activationData) => {
        isWindowActive.value = activationData.isActive

        if (activationData.isActive) {
            magnifierActive.value = shouldShowMagnifier.value
            mouseX.value = Math.max(0, Math.min(activationData.mouseX, window.innerWidth))
            mouseY.value = Math.max(0, Math.min(activationData.mouseY, window.innerHeight))

            setTimeout(() => {
                tryUpdateMagnifier()
                ensureMagnifierLoop()
            }, 10)
        } else {
            magnifierActive.value = false
            stopMagnifierLoop()
        }
    }

    const activateCurrentWindow = () => {
        isWindowActive.value = true
        magnifierActive.value = shouldShowMagnifier.value
        setTimeout(() => {
            tryUpdateMagnifier()
            ensureMagnifierLoop()
        }, 10)
    }

    const handleMouseDown = async (event) => {
        if (blockedModes.includes(mode.value)) return

        if (onBeforeSelectionStart) {
            await onBeforeSelectionStart(event)
        }

        isWindowActive.value = true
        mode.value = 'selecting'
        magnifierActive.value = shouldShowMagnifier.value
        startX.value = endX.value = event.clientX
        startY.value = endY.value = event.clientY

        if (onSelectionStarted) {
            await onSelectionStarted()
        }
    }

    const handleResizeHandleMouseDown = (event, handle) => {
        event.stopPropagation()
        mode.value = 'resizing'
        magnifierActive.value = shouldShowMagnifier.value
        resizingHandle.value = handle
    }

    const handleSelectionMouseDown = (event) => {
        if (mode.value !== 'confirming') return

        event.stopPropagation()
        mode.value = 'moving'
        dragStartMouseX.value = event.clientX
        dragStartMouseY.value = event.clientY
        dragStartSelectionX.value = Math.min(startX.value, endX.value)
        dragStartSelectionY.value = Math.min(startY.value, endY.value)
        dragStartWidth.value = Math.abs(endX.value - startX.value)
        dragStartHeight.value = Math.abs(endY.value - startY.value)
    }

    const handleMouseMove = (event) => {
        mouseX.value = event.clientX
        mouseY.value = event.clientY

        if (mode.value === 'selecting') {
            endX.value = event.clientX
            endY.value = event.clientY
        } else if (mode.value === 'resizing') {
            const handle = resizingHandle.value
            if (handle.includes('left')) startX.value = event.clientX
            if (handle.includes('right')) endX.value = event.clientX
            if (handle.includes('top')) startY.value = event.clientY
            if (handle.includes('bottom')) endY.value = event.clientY

            if (onDuringTransform) {
                onDuringTransform('resizing')
            }
        } else if (mode.value === 'moving') {
            const deltaX = event.clientX - dragStartMouseX.value
            const deltaY = event.clientY - dragStartMouseY.value

            const newLeft = dragStartSelectionX.value + deltaX
            const newTop = dragStartSelectionY.value + deltaY
            const newRight = newLeft + dragStartWidth.value
            const newBottom = newTop + dragStartHeight.value

            let finalLeft = newLeft
            let finalTop = newTop
            let finalRight = newRight
            let finalBottom = newBottom

            const minSize = 10

            if (newLeft < 0) {
                const overpush = Math.abs(newLeft)
                finalLeft = 0
                finalRight = Math.max(minSize, dragStartWidth.value - overpush)
            } else if (newRight > window.innerWidth) {
                const overpush = newRight - window.innerWidth
                finalRight = window.innerWidth
                finalLeft = Math.max(0, window.innerWidth - (dragStartWidth.value - overpush))
                if (finalRight - finalLeft < minSize) {
                    finalLeft = finalRight - minSize
                }
            } else {
                finalLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dragStartWidth.value))
                finalRight = finalLeft + dragStartWidth.value
            }

            if (newTop < 0) {
                const overpush = Math.abs(newTop)
                finalTop = 0
                finalBottom = Math.max(minSize, dragStartHeight.value - overpush)
            } else if (newBottom > window.innerHeight) {
                const overpush = newBottom - window.innerHeight
                finalBottom = window.innerHeight
                finalTop = Math.max(0, window.innerHeight - (dragStartHeight.value - overpush))
                if (finalBottom - finalTop < minSize) {
                    finalTop = finalBottom - minSize
                }
            } else {
                finalTop = Math.max(0, Math.min(newTop, window.innerHeight - dragStartHeight.value))
                finalBottom = finalTop + dragStartHeight.value
            }

            startX.value = finalLeft
            startY.value = finalTop
            endX.value = finalRight
            endY.value = finalBottom

            if (onDuringTransform) {
                onDuringTransform('moving')
            }
        }

        if (isWindowActive.value && magnifierActive.value) {
            updateMagnifier(event.clientX, event.clientY)
            ensureMagnifierLoop()
        }
    }

    const normalizeSelection = () => {
        startX.value = Math.min(startX.value, endX.value)
        startY.value = Math.min(startY.value, endY.value)
        endX.value = Math.max(startX.value, endX.value)
        endY.value = Math.max(startY.value, endY.value)
    }

    const handleMouseUp = async () => {
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

            if (onSelectionConfirmed) {
                await onSelectionConfirmed(selectionRect.value)
            }
            if (onAfterTransform) {
                await onAfterTransform('selecting')
            }
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

            if (onSelectionResized) {
                await onSelectionResized(selectionRect.value)
            }
            if (onAfterTransform) {
                await onAfterTransform('resizing')
            }
        } else if (mode.value === 'moving') {
            magnifierActive.value = false
            mode.value = 'confirming'

            if (onSelectionMoved) {
                await onSelectionMoved(selectionRect.value)
            }
            if (onAfterTransform) {
                await onAfterTransform('moving')
            }
        }
    }

    const handleArrowKeyNavigation = async (event) => {
        if (!arrowNavigationModes.includes(mode.value)) return
        if (isBusy.value) return
        if (canHandleArrowKey && !canHandleArrowKey(event)) return

        const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
        if (!arrowKeys.includes(event.key)) return

        event.preventDefault()

        const amount = nudgeAmount.value
        const shift = event.shiftKey

        if (!shift) {
            const { left, top, width, height } = selectionRect.value

            if (event.key === 'ArrowLeft') {
                const delta = Math.min(amount, left)
                startX.value -= delta
                endX.value -= delta
            } else if (event.key === 'ArrowRight') {
                const delta = Math.min(amount, window.innerWidth - (left + width))
                startX.value += delta
                endX.value += delta
            } else if (event.key === 'ArrowUp') {
                const delta = Math.min(amount, top)
                startY.value -= delta
                endY.value -= delta
            } else if (event.key === 'ArrowDown') {
                const delta = Math.min(amount, window.innerHeight - (top + height))
                startY.value += delta
                endY.value += delta
            }
        } else if (event.key === 'ArrowLeft') {
            startX.value = Math.max(0, startX.value - amount)
        } else if (event.key === 'ArrowRight') {
            endX.value = Math.min(window.innerWidth, endX.value + amount)
        } else if (event.key === 'ArrowUp') {
            startY.value = Math.max(0, startY.value - amount)
        } else if (event.key === 'ArrowDown') {
            endY.value = Math.min(window.innerHeight, endY.value + amount)
        }

        if (onAfterTransform) {
            await onAfterTransform('keyboard')
        }
    }

    const handleToolbarDragStart = (event) => {
        event.stopPropagation()
        event.preventDefault?.()

        isDraggingToolbar.value = true

        const toolbar = event.currentTarget.closest('.toolbar-container')
        const rect = toolbar.getBoundingClientRect()

        toolbarDragStart.value = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        }
    }

    const handleToolbarDragMove = (event, toolbarWidth = 400, toolbarHeight = 60) => {
        if (!isDraggingToolbar.value) return

        event.preventDefault?.()

        let newX = event.clientX - toolbarDragStart.value.x
        let newY = event.clientY - toolbarDragStart.value.y

        const margin = 10

        newX = Math.max(margin, Math.min(newX, window.innerWidth - toolbarWidth - margin))
        newY = Math.max(margin, Math.min(newY, window.innerHeight - toolbarHeight - margin))

        customToolbarPosition.value = { x: newX, y: newY }
    }

    const handleToolbarDragEnd = () => {
        isDraggingToolbar.value = false
    }

    watch(
        [screenVideo, magnifierCanvas, magnifierActive, isWindowActive, shouldShowMagnifier, isBusy, mode],
        () => {
            ensureMagnifierLoop()
        },
        { flush: 'post' }
    )

    onUnmounted(() => {
        stopMagnifierLoop()
    })

    return {
        startX,
        startY,
        endX,
        endY,
        mouseX,
        mouseY,
        mode,
        resizingHandle,
        magnifierActive,
        isWindowActive,
        magnifierSize,
        magnifierCanvas,
        selectionRect,
        selectionBorderClass,
        magnifierStyle,
        shouldUseOverlayCursor,
        overlayCursorStyle,
        customToolbarPosition,
        isDraggingToolbar,
        nudgeAmount,
        handleMouseDown,
        handleResizeHandleMouseDown,
        handleSelectionMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleArrowKeyNavigation,
        handleToolbarDragStart,
        handleToolbarDragMove,
        handleToolbarDragEnd,
        handleScreenVideoReady,
        handleDisplayActivationChanged,
        activateCurrentWindow,
        tryUpdateMagnifier
    }
}
