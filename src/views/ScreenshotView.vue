<script setup>
    import { ref, onMounted, onUnmounted, computed } from 'vue'
    import { apiClient } from '../api/config.js'

    // Core selection state
    const startX = ref(0)
    const startY = ref(0)
    const endX = ref(0)
    const endY = ref(0)
    const mouseX = ref(0)
    const mouseY = ref(0)
    const displayId = ref(null)
    const mode = ref('idle') // 'idle', 'selecting', 'resizing', 'confirming'
    const resizingHandle = ref(null)

    // Magnifier state
    const magnifierActive = ref(true)
    const magnifierSize = 200
    const zoomFactor = 2
    const magnifierCanvas = ref(null)
    const fullScreenImage = ref(null)

    // Upload notifications
    const uploadNotifications = ref([])
    const nextNotificationId = ref(1)

    const selectionRect = computed(() => {
        const left = Math.min(startX.value, endX.value)
        const top = Math.min(startY.value, endY.value)
        const width = Math.abs(endX.value - startX.value)
        const height = Math.abs(endY.value - startY.value)
        return { left, top, width, height }
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

    const toolbarStyle = computed(() => {
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

    const handleMouseDown = (e) => {
        if (mode.value === 'confirming') return

        mode.value = 'selecting'
        magnifierActive.value = true
        startX.value = endX.value = e.clientX
        startY.value = endY.value = e.clientY
    }

    const handleResizeHandleMouseDown = (e, handle) => {
        e.stopPropagation()
        mode.value = 'resizing'
        resizingHandle.value = handle
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
        }

        if (magnifierActive.value) {
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
            mode.value = 'confirming'
        } else if (mode.value === 'resizing') {
            mode.value = 'confirming'
            resizingHandle.value = null
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

            const dpr = window.devicePixelRatio || 1
            const sourceSize = magnifierSize / zoomFactor
            const sourceX = Math.max(
                0,
                Math.min(x * dpr - sourceSize / 2, fullScreenImage.value.naturalWidth - sourceSize)
            )
            const sourceY = Math.max(
                0,
                Math.min(y * dpr - sourceSize / 2, fullScreenImage.value.naturalHeight - sourceSize)
            )

            // Draw magnified image
            ctx.drawImage(
                fullScreenImage.value,
                sourceX,
                sourceY,
                sourceSize,
                sourceSize,
                0,
                0,
                magnifierSize,
                magnifierSize
            )

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
    const handleSave = () => captureArea()
    const handleUpload = () => captureAndUpload()
    const handleCopy = () => copyToClipboard()
    const handlePrint = () => printScreenshot()
    const handleSearch = () => searchImageGoogle()
    const handleEdit = () => console.log('Edit action')
    const handleCancel = () => window.electron?.cancelScreenshotMode()

    const captureArea = async () => {
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
                displayId.value
            )

            if (!result?.success) console.error('Screenshot failed:', result?.error)
        } catch (error) {
            console.error('Error capturing screenshot:', error)
        }
    }

    const captureAndUpload = async () => {
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
                displayId.value
            )
            alert(result.dataUrl)
            if (!result?.success) console.error('Screenshot failed:', result?.error)
        } catch (error) {
            console.error('Error capturing screenshot:', error)
        }

        // const notificationId = nextNotificationId.value++
        //
        // try {
        //     const { left, top, width, height } = selectionRect.value
        //     const result = await window.electron?.captureScreenshot(
        //         'area',
        //         {
        //             x: Math.round(left),
        //             y: Math.round(top),
        //             width: Math.round(width),
        //             height: Math.round(height)
        //         },
        //         displayId.value
        //     )
        //
        //     if (!result?.success) {
        //         console.error('Screenshot failed:', result?.error)
        //         showUploadError(notificationId, 'Screenshot capture failed')
        //         return
        //     }
        //
        //     // Convert to file
        //     const file = base64ToFile(result.data, `screenshot-${Date.now()}.png`)
        //
        //     // Create upload notification
        //     createUploadNotification(notificationId, file)
        //
        //     // Upload file
        //     await uploadFile(file, notificationId)
        // } catch (error) {
        //     alert('Upload error:' + error)
        //     console.error('Upload error:', error)
        //     showUploadError(notificationId, error.message || 'Upload failed')
        // }
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

    const createUploadNotification = (id, file) => {
        uploadNotifications.value.push({
            id,
            status: 'uploading',
            progress: 0,
            fileSize: formatFileSize(file.size),
            fileName: file.name,
            url: null,
            error: null
        })
    }

    const showUploadError = (id, message) => {
        const notif = uploadNotifications.value.find((n) => n.id === id)
        if (notif) {
            notif.status = 'failed'
            notif.error = message
        } else {
            uploadNotifications.value.push({ id, status: 'failed', error: message, fileSize: '0 MB' })
        }
    }

    const uploadFile = async (file, notificationId) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', 'screenshot')
        formData.append('title', `Screenshot ${new Date().toLocaleString()}`)

        const result = await apiClient.post('/media/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => updateUploadProgress(notificationId, e)
        })

        const notif = uploadNotifications.value.find((n) => n.id === notificationId)
        if (notif) {
            if (result.data) {
                notif.status = 'completed'
                notif.url = result.data.media?.url || result.data.media?.public_url || '#'
                setTimeout(handleCancel, 2000)
            } else {
                throw new Error(result.response?.data?.message || 'Upload failed')
            }
        }
    }

    const updateUploadProgress = (id, progressEvent) => {
        const notif = uploadNotifications.value.find((n) => n.id === id)
        if (notif) {
            notif.progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        }
    }

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
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

            if (!result?.success) console.error('Copy failed:', result?.error)
        } catch (error) {
            console.error('Error copying screenshot:', error)
        }
    }

    const printScreenshot = async () => {
        try {
            const { left, top, width, height } = selectionRect.value
            const result = await window.electron?.printScreenshot(
                'area',
                {
                    x: Math.round(left),
                    y: Math.round(top),
                    width: Math.round(width),
                    height: Math.round(height)
                },
                displayId.value
            )

            if (!result?.success) console.error('Print failed:', result?.error)
        } catch (error) {
            console.error('Error printing screenshot:', error)
        }
    }

    const searchImageGoogle = async () => {
        try {
            const { left, top, width, height } = selectionRect.value
            const result = await window.electron?.searchImageGoogle(
                'area',
                {
                    x: Math.round(left),
                    y: Math.round(top),
                    width: Math.round(width),
                    height: Math.round(height)
                },
                displayId.value
            )

            if (!result?.success) console.error('Search failed:', result?.error)
        } catch (error) {
            console.error('Error opening Google Image Search:', error)
        }
    }

    onMounted(async () => {
        const params = new URLSearchParams(window.location.search)
        displayId.value = params.get('displayId')
        mouseX.value = parseInt(params.get('initialMouseX') || '0', 10)
        mouseY.value = parseInt(params.get('initialMouseY') || '0', 10)

        document.addEventListener('keydown', handleCancel)

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

        // Fetch the initial data from the main process once the component is mounted.
        // This avoids a race condition where the main process sends data before the listener is ready.
        try {
            const initialDataURL = await window.electronWindows?.getInitialMagnifierData()
            processMagnifierData(initialDataURL)
        } catch (error) {
            console.error('Failed to get initial magnifier data:', error)
        }

        // Listen for subsequent data updates (e.g., when moving to a new display)
        window.electronWindows?.onDisplayChanged((data) => {
            // A leftover alert for debugging, can be removed or commented out.
            // alert('Display changed!')
            displayId.value = data.displayId
            if (data.mouseX !== undefined) mouseX.value = data.mouseX
            if (data.mouseY !== undefined) mouseY.value = data.mouseY
        })
        window.electronWindows?.onMagnifierData(processMagnifierData)
    })

    onUnmounted(() => {
        document.removeEventListener('keydown', handleCancel)
        window.electronWindows?.removeDisplayChangedListener()
        window.electronWindows?.removeMagnifierDataListener()
    })
</script>

<template>
    <div
        class="fixed top-0 left-0 h-screen w-screen cursor-crosshair select-none"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp">
        <!-- Dark overlay for everything outside the selection -->
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

        <!-- Selection rectangle -->
        <div
            v-if="mode !== 'idle'"
            :class="[
                'animated-dashed-border absolute',
                mode === 'confirming' || mode === 'resizing' ? 'pointer-events-all' : 'pointer-events-none'
            ]"
            :style="{
                left: `${selectionRect.left}px`,
                top: `${selectionRect.top}px`,
                width: `${selectionRect.width}px`,
                height: `${selectionRect.height}px`
            }">
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

        <!-- Instructions -->
        <div
            v-if="mode === 'idle'"
            class="pointer-events-none fixed top-1/2 left-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select an area or click to capture full screen</p>
        </div>

        <!-- Crosshair (only when not confirming) -->
        <div
            v-if="mode !== 'confirming'"
            class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-[99] h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div
            v-if="mode !== 'confirming'"
            class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-[99] w-px transition-none"
            :style="{ left: mouseX + 'px' }" />

        <!-- Magnifier -->
        <div
            v-if="magnifierActive"
            class="pointer-events-none fixed z-[101] flex h-[200px] w-[200px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-black shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
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
            v-if="mode === 'confirming'"
            class="absolute flex items-center gap-4"
            :style="toolbarStyle">
            <div class="flex items-center rounded-full bg-white/90">
                <button
                    @click="handleUpload"
                    title="Upload"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="group-hover:text-white"
                        width="24"
                        height="24"
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
                        class="group-hover:text-white"
                        width="24"
                        height="24"
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
                        class="group-hover:text-white"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M8.78125 13.2002H15.4746C15.6843 13.2002 15.8564 13.3717 15.8564 13.585V19.5C15.8564 19.6933 15.6992 19.8496 15.5059 19.8496H8.75C8.55672 19.8496 8.40039 19.6933 8.40039 19.5V13.585C8.40039 13.3717 8.5716 13.2002 8.78125 13.2002ZM7.8252 3.15039C8.09431 3.1505 8.3125 3.36856 8.3125 3.6377V5.88672C8.3125 6.85441 9.09271 7.64062 10.0566 7.64062H14.2002C15.164 7.64049 15.9434 6.85433 15.9434 5.88672V4.21094C15.9434 4.14578 15.9785 4.09968 16.0195 4.0791C16.0582 4.05972 16.104 4.06116 16.1465 4.09961L18.5703 6.29492C19.3447 6.99621 19.787 7.99515 19.7871 9.04395V16.1514C19.7869 17.6994 18.8424 19.0247 17.502 19.5762C17.3737 19.6289 17.219 19.5336 17.2188 19.3623V13.585C17.2188 12.6173 16.4385 11.8311 15.4746 11.8311H8.78125C7.81734 11.8311 7.03711 12.6173 7.03711 13.585V19.4736C7.03709 19.6348 6.89786 19.7335 6.77051 19.6953C5.25543 19.2392 4.15058 17.8254 4.15039 16.1514V6.84863C4.15062 4.80501 5.79657 3.15039 7.8252 3.15039ZM10.0254 3.15039H14.2314C14.4246 3.15053 14.5811 3.30679 14.5811 3.5V5.88672C14.5811 6.09992 14.4098 6.27134 14.2002 6.27148H10.0566C9.84697 6.27148 9.6748 6.10001 9.6748 5.88672V3.5C9.6748 3.3067 9.83209 3.15039 10.0254 3.15039Z"
                            fill="currentColor" />
                    </svg>
                    <span class="hidden group-hover:block group-hover:text-white"> Save </span>
                </button>

                <button
                    @click="handlePrint"
                    title="Print"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="group-hover:text-white"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M7 5C7 3.34 8.34 2 10 2H14C15.66 2 17 3.34 17 5C17 5.55 16.55 6 16 6H8C7.45 6 7 5.55 7 5Z"
                            fill="currentColor" />
                        <path
                            d="M17.75 15C17.75 15.41 17.41 15.75 17 15.75H16V19C16 20.66 14.66 22 13 22H11C9.34 22 8 20.66 8 19V15.75H7C6.59 15.75 6.25 15.41 6.25 15C6.25 14.59 6.59 14.25 7 14.25H17C17.41 14.25 17.75 14.59 17.75 15Z"
                            fill="currentColor" />
                        <path
                            d="M18 7H6C4 7 3 8 3 10V15C3 17 4 18 6 18H6.375C6.72018 18 7 17.7202 7 17.375C7 17.0298 6.71131 16.7604 6.38841 16.6384C5.72619 16.3882 5.25 15.7453 5.25 15C5.25 14.04 6.04 13.25 7 13.25H17C17.96 13.25 18.75 14.04 18.75 15C18.75 15.7453 18.2738 16.3882 17.6116 16.6384C17.2887 16.7604 17 17.0298 17 17.375C17 17.7202 17.2798 18 17.625 18H18C20 18 21 17 21 15V10C21 8 20 7 18 7ZM10 11.75H7C6.59 11.75 6.25 11.41 6.25 11C6.25 10.59 6.59 10.25 7 10.25H10C10.41 10.25 10.75 10.59 10.75 11C10.75 11.41 10.41 11.75 10 11.75Z"
                            fill="currentColor" />
                    </svg>
                    <span class="hidden group-hover:block group-hover:text-white"> Print </span>
                </button>

                <button
                    @click="handleSearch"
                    title="Search with Google Lens"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="group-hover:text-white"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M9.95 3.00002H7C4.79086 3.00002 3 4.79088 3 7.00002V9.25502"
                            stroke="currentColor"
                            stroke-linecap="round" />
                        <path
                            d="M9.95 21.07H7C4.79086 21.07 3 19.2791 3 17.07V14.815"
                            stroke="currentColor"
                            stroke-linecap="round" />
                        <path
                            d="M14.8146 3.00002H17.7646C19.9738 3.00002 21.7646 4.79088 21.7646 7.00002V9.25502"
                            stroke="currentColor"
                            stroke-linecap="round" />
                        <path
                            d="M14.8146 21.07H17.7646C19.9738 21.07 21.7646 19.2791 21.7646 17.07V14.815"
                            stroke="currentColor"
                            stroke-linecap="round" />
                        <path
                            d="M11.7913 15.787C13.9775 15.787 15.7497 14.0148 15.7497 11.8287C15.7497 9.64258 13.9775 7.87038 11.7913 7.87038C9.60521 7.87038 7.83301 9.64258 7.83301 11.8287C7.83301 14.0148 9.60521 15.787 11.7913 15.787Z"
                            fill="currentColor" />
                        <path
                            d="M16.1663 16.2037L15.333 15.3704"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                    <span class="hidden group-hover:block group-hover:text-white"> Search </span>
                </button>

                <button
                    @click="handleEdit"
                    title="Edit"
                    class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                    <svg
                        class="group-hover:text-white"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
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
            </div>

            <div class="flex items-center rounded-full bg-white/90">
                <button
                    @click="handleCancel"
                    title="Cancel"
                    class="flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-2 text-red-500 transition-colors hover:bg-red-500 hover:text-white">
                    <svg
                        width="24"
                        height="24"
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
            </div>
        </div>

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
</style>
