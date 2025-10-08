<script setup>
    import { ref, onMounted, onUnmounted, computed } from 'vue'

    const startX = ref(0)
    const startY = ref(0)
    const endX = ref(0)
    const endY = ref(0)
    const mouseX = ref(0)
    const mouseY = ref(0)
    const displayId = ref(null)
    const mode = ref('idle')
    const resizingHandle = ref(null)

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

    const isRecording = ref(false)
    const isPaused = ref(false)
    const recordingTime = ref(0)
    const recordingInterval = ref(null)

    const webcamEnabled = ref(false)
    const webcamDevices = ref([])
    const selectedWebcam = ref(null)
    const webcamStream = ref(null)
    const webcamPosition = ref({ x: 100, y: 100 })
    const webcamSize = ref(150)
    const isDraggingWebcam = ref(false)
    const webcamDragOffset = ref({ x: 0, y: 0 })

    const audioDevices = ref([])
    const selectedAudioDevice = ref(null)
    const audioMuted = ref(false)

    const showWebcamDropdown = ref(false)
    const showAudioDropdown = ref(false)
    const videoQuality = ref('default')

    const mediaRecorder = ref(null)
    const recordedChunks = ref([])
    const recordingStream = ref(null)

    const selectionRect = computed(() => {
        const left = Math.min(startX.value, endX.value)
        const top = Math.min(startY.value, endY.value)
        const width = Math.abs(endX.value - startX.value)
        const height = Math.abs(endY.value - startY.value)
        return { left, top, width, height }
    })

    const recordingTimeFormatted = computed(() => {
        const hours = Math.floor(recordingTime.value / 3600)
        const minutes = Math.floor((recordingTime.value % 3600) / 60)
        const seconds = recordingTime.value % 60
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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

    const handleMouseDown = async (e) => {
        if (mode.value === 'confirming' || isRecording.value) return

        try {
            await window.electronWindows?.closeOtherRecordingWindows(displayId.value)
        } catch (error) {
            console.error('Error closing other recording windows:', error)
        }

        isWindowActive.value = true
        mode.value = 'selecting'
        magnifierActive.value = true
        startX.value = endX.value = e.clientX
        startY.value = endY.value = e.clientY
    }

    const handleResizeHandleMouseDown = (e, handle) => {
        e.stopPropagation()
        mode.value = 'resizing'
        magnifierActive.value = true
        resizingHandle.value = handle
    }

    const handleSelectionMouseDown = (e) => {
        if (mode.value !== 'confirming' || isRecording.value) return
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

            // If it's a click (no drag), select full screen
            if (width < 10 && height < 10) {
                startX.value = startY.value = 0
                endX.value = window.innerWidth
                endY.value = window.innerHeight
            }

            // Normalize coordinates
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

            const imgCursorX = x * scaleX
            const imgCursorY = y * scaleY

            const sourceSize = (magnifierSize / zoomFactor) * Math.max(scaleX, scaleY)
            const sx = imgCursorX - sourceSize / 2
            const sy = imgCursorY - sourceSize / 2

            ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, magnifierSize, magnifierSize)

            // Draw crosshair
            ctx.strokeStyle = '#2178FF'
            ctx.lineWidth = 1

            const centerX = magnifierSize / 2
            const centerY = magnifierSize / 2
            const crosshairSize = 10

            ctx.beginPath()
            ctx.moveTo(centerX - crosshairSize, centerY)
            ctx.lineTo(centerX + crosshairSize, centerY)
            ctx.moveTo(centerX, centerY - crosshairSize)
            ctx.lineTo(centerX, centerY + crosshairSize)
            ctx.stroke()
        } catch (err) {
            console.error('Magnifier error:', err)
        }
    }

    const handleWebcamMouseDown = (e) => {
        if (!webcamEnabled.value || isRecording.value) return
        e.stopPropagation()
        isDraggingWebcam.value = true
        webcamDragOffset.value = {
            x: e.clientX - webcamPosition.value.x,
            y: e.clientY - webcamPosition.value.y
        }
    }

    const handleWebcamMove = (e) => {
        if (!isDraggingWebcam.value) return
        webcamPosition.value = {
            x: e.clientX - webcamDragOffset.value.x,
            y: e.clientY - webcamDragOffset.value.y
        }
    }

    const handleWebcamMouseUp = () => {
        isDraggingWebcam.value = false
    }

    const loadMediaDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            webcamDevices.value = devices.filter((d) => d.kind === 'videoinput')
            audioDevices.value = devices.filter((d) => d.kind === 'audioinput')

            if (webcamDevices.value.length > 0 && !selectedWebcam.value) {
                selectedWebcam.value = webcamDevices.value[0].deviceId
            }
            if (audioDevices.value.length > 0 && !selectedAudioDevice.value) {
                selectedAudioDevice.value = audioDevices.value[0].deviceId
            }
        } catch (error) {
            console.error('Error loading media devices:', error)
        }
    }

    const toggleWebcam = async () => {
        webcamEnabled.value = !webcamEnabled.value

        if (webcamEnabled.value && selectedWebcam.value) {
            try {
                webcamStream.value = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: selectedWebcam.value }
                })

                const video = document.getElementById('webcam-preview')
                if (video) {
                    video.srcObject = webcamStream.value
                }
            } catch (error) {
                console.error('Error accessing webcam:', error)
                webcamEnabled.value = false
            }
        } else if (!webcamEnabled.value && webcamStream.value) {
            webcamStream.value.getTracks().forEach((track) => track.stop())
            webcamStream.value = null
        }
    }

    const selectWebcam = async (deviceId) => {
        selectedWebcam.value = deviceId
        showWebcamDropdown.value = false

        if (webcamEnabled.value) {
            if (webcamStream.value) {
                webcamStream.value.getTracks().forEach((track) => track.stop())
            }

            try {
                webcamStream.value = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId }
                })

                const video = document.getElementById('webcam-preview')
                if (video) {
                    video.srcObject = webcamStream.value
                }
            } catch (error) {
                console.error('Error switching webcam:', error)
            }
        }
    }

    const selectAudioDevice = (deviceId) => {
        selectedAudioDevice.value = deviceId
        showAudioDropdown.value = false
    }

    const toggleAudioMute = () => {
        audioMuted.value = !audioMuted.value
    }

    const handleToggleWebcam = () => {
        toggleWebcam()
        showWebcamDropdown.value = false
    }

    const handleToggleAudioMute = () => {
        toggleAudioMute()
        showAudioDropdown.value = false
    }

    const startRecording = async () => {
        if (mode.value !== 'confirming') return

        try {
            const { left, top, width, height } = selectionRect.value

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor',
                    width: { ideal: width },
                    height: { ideal: height }
                },
                audio: audioMuted.value
                    ? false
                    : {
                          deviceId: selectedAudioDevice.value
                      }
            })

            let tracks = [...screenStream.getTracks()]

            if (webcamEnabled.value && webcamStream.value) {
                const webcamTracks = webcamStream.value.getVideoTracks()
                tracks = [...tracks, ...webcamTracks]
            }

            recordingStream.value = new MediaStream(tracks)

            const options = {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: videoQuality.value === 'low' ? 1000000 : 2500000
            }

            mediaRecorder.value = new MediaRecorder(recordingStream.value, options)
            recordedChunks.value = []

            mediaRecorder.value.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.value.push(event.data)
                }
            }

            mediaRecorder.value.onstop = async () => {
                const blob = new Blob(recordedChunks.value, { type: 'video/webm' })
                await saveRecording(blob)
            }

            mediaRecorder.value.start(100)
            isRecording.value = true
            isPaused.value = false
            recordingTime.value = 0

            recordingInterval.value = setInterval(() => {
                if (!isPaused.value) {
                    recordingTime.value++
                }
            }, 1000)
        } catch (error) {
            console.error('Error starting recording:', error)
        }
    }

    const pauseRecording = () => {
        if (mediaRecorder.value && isRecording.value) {
            if (isPaused.value) {
                mediaRecorder.value.resume()
                isPaused.value = false
            } else {
                mediaRecorder.value.pause()
                isPaused.value = true
            }
        }
    }

    const stopRecording = () => {
        if (mediaRecorder.value && isRecording.value) {
            mediaRecorder.value.stop()
            isRecording.value = false

            if (recordingInterval.value) {
                clearInterval(recordingInterval.value)
            }

            if (recordingStream.value) {
                recordingStream.value.getTracks().forEach((track) => track.stop())
            }
        }
    }

    const saveRecording = async (blob) => {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
            const filename = `Recording_${timestamp}.webm`

            const arrayBuffer = await blob.arrayBuffer()
            const buffer = new Uint8Array(arrayBuffer)

            const result = await window.electron?.invoke('save-recording', {
                filename,
                buffer: Array.from(buffer)
            })

            if (result?.success) {
                await window.electronWindows?.createWindow('recording-preview', {
                    params: { filepath: result.filepath }
                })
                window.electron?.cancelRecordingMode()
            }
        } catch (error) {
            console.error('Error saving recording:', error)
        }
    }

    const handleCancel = () => {
        if (isRecording.value) {
            stopRecording()
        }

        if (webcamStream.value) {
            webcamStream.value.getTracks().forEach((track) => track.stop())
        }

        window.electron?.cancelRecordingMode()
    }

    const handleEscapeKey = (event) => {
        if (event.key === 'Escape') {
            handleCancel()
        }
    }

    onMounted(async () => {
        const urlParams = new URLSearchParams(window.location.search)
        displayId.value = parseInt(urlParams.get('displayId') || '0', 10)
        const timestamp = urlParams.get('timestamp')

        try {
            const handlerKey = `get-initial-magnifier-data-${displayId.value}-${timestamp}`
            const initialDataURL = await window.electron?.invoke(handlerKey)
            if (initialDataURL) {
                const img = new Image()
                img.src = initialDataURL
                img.onload = () => {
                    fullScreenImage.value = img
                    if (mouseX.value || mouseY.value) {
                        updateMagnifier(mouseX.value, mouseY.value)
                    }
                }
                img.onerror = (e) => console.error('Error loading image:', e)
            }
        } catch (error) {
            console.error('Error loading screen capture:', error)
        }

        await loadMediaDevices()

        // Listen for display activation changes
        window.electronWindows?.onDisplayActivationChanged?.((activationData) => {
            if (activationData.displayId === displayId.value && activationData.isActive) {
                isWindowActive.value = true
                mouseX.value = Math.max(0, Math.min(activationData.mouseX, window.innerWidth))
                mouseY.value = Math.max(0, Math.min(activationData.mouseY, window.innerHeight))

                if (mode.value === 'idle') {
                    updateMagnifier(mouseX.value, mouseY.value)
                }
            } else {
                magnifierActive.value = false
            }
        })

        window.addEventListener('keydown', handleEscapeKey)
    })

    onUnmounted(() => {
        if (recordingInterval.value) {
            clearInterval(recordingInterval.value)
        }

        if (webcamStream.value) {
            webcamStream.value.getTracks().forEach((track) => track.stop())
        }

        if (recordingStream.value) {
            recordingStream.value.getTracks().forEach((track) => track.stop())
        }

        window.removeEventListener('keydown', handleEscapeKey)
        window.electronWindows?.removeDisplayActivationChangedListener?.()
    })
</script>

<template>
    <div
        :class="{ 'cursor-crosshair select-none': !isRecording }"
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
                handleWebcamMove(e)
            }
        "
        @mouseup="
            (e) => {
                handleMouseUp()
                handleWebcamMouseUp()
            }
        ">
        <!-- Dark overlay -->
        <div
            v-if="mode === 'confirming' || isRecording"
            class="pointer-events-none absolute top-0 left-0 h-full w-full bg-black/50"
            :style="{
                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${selectionRect.left}px ${selectionRect.top}px, ${selectionRect.left}px ${selectionRect.top + selectionRect.height}px, ${selectionRect.left + selectionRect.width}px ${selectionRect.top + selectionRect.height}px, ${selectionRect.left + selectionRect.width}px ${selectionRect.top}px, ${selectionRect.left}px ${selectionRect.top}px)`
            }"></div>

        <!-- Selection rectangle -->
        <div
            v-if="mode !== 'idle'"
            :class="[
                'absolute',
                mode === 'selecting'
                    ? 'animated-dashed-border-selecting pointer-events-none'
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

        <!-- Instructions -->
        <div
            v-if="mode === 'idle' && isWindowActive"
            class="pointer-events-none fixed top-1/2 left-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-center text-sm text-white">
            <p>Click and drag to select recording area or click to record full screen</p>
        </div>

        <!-- Crosshair -->
        <div
            v-if="mode !== 'confirming' && !isRecording && isWindowActive"
            class="animated-dashed-line-h pointer-events-none fixed right-0 left-0 z-[99] h-px transition-none"
            :style="{ top: mouseY + 'px' }" />
        <div
            v-if="mode !== 'confirming' && !isRecording && isWindowActive"
            class="animated-dashed-line-v pointer-events-none fixed top-0 bottom-0 z-[99] w-px transition-none"
            :style="{ left: mouseX + 'px' }" />

        <!-- Magnifier -->
        <div
            v-if="magnifierActive"
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
                {{ selectionRect.width }} × {{ selectionRect.height }}
            </div>
        </div>

        <!-- Webcam overlay -->
        <div
            v-if="webcamEnabled && mode === 'confirming'"
            :style="{
                left: `${webcamPosition.x}px`,
                top: `${webcamPosition.y}px`,
                width: `${webcamSize}px`,
                height: `${webcamSize}px`,
                cursor: isDraggingWebcam ? 'grabbing' : 'grab'
            }"
            class="absolute overflow-hidden rounded-full border-4 border-white shadow-lg"
            @mousedown="handleWebcamMouseDown">
            <video
                id="webcam-preview"
                autoplay
                playsinline
                muted
                class="h-full w-full object-cover"></video>
        </div>

        <!-- Recording Controls Toolbar -->
        <div
            v-if="mode === 'confirming' && !isRecording"
            class="absolute flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-xl dark:bg-gray-800"
            :style="{
                left: `${selectionRect.left + selectionRect.width / 2}px`,
                top: `${selectionRect.top + selectionRect.height + 20}px`,
                transform: 'translateX(-50%)'
            }">
            <!-- Record Button -->
            <button
                @click="startRecording"
                class="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-white transition-colors hover:bg-red-600">
                <svg
                    class="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor">
                    <circle
                        cx="10"
                        cy="10"
                        r="8" />
                </svg>
                <span class="font-medium">Record</span>
            </button>

            <!-- Webcam Dropdown -->
            <div class="relative">
                <button
                    @click="showWebcamDropdown = !showWebcamDropdown"
                    :class="{ 'bg-blue-100': webcamEnabled }"
                    class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                    <svg
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor">
                        <path
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </button>

                <div
                    v-if="showWebcamDropdown"
                    class="absolute top-full z-50 mt-2 min-w-[200px] rounded-lg bg-white py-2 shadow-xl dark:bg-gray-800">
                    <button
                        v-for="device in webcamDevices"
                        :key="device.deviceId"
                        @click="selectWebcam(device.deviceId)"
                        :class="{ 'bg-blue-50 dark:bg-blue-900': selectedWebcam === device.deviceId }"
                        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                        {{ device.label || 'Camera ' + (webcamDevices.indexOf(device) + 1) }}
                    </button>
                    <hr class="my-2" />
                    <button
                        @click="handleToggleWebcam"
                        class="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        {{ webcamEnabled ? 'Disable Webcam' : 'Enable Webcam' }}
                    </button>
                </div>
            </div>

            <!-- Audio Dropdown -->
            <div class="relative">
                <button
                    @click="showAudioDropdown = !showAudioDropdown"
                    :class="{ 'bg-gray-100': audioMuted }"
                    class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                    <svg
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor">
                        <path
                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </button>

                <div
                    v-if="showAudioDropdown"
                    class="absolute top-full z-50 mt-2 min-w-[200px] rounded-lg bg-white py-2 shadow-xl dark:bg-gray-800">
                    <button
                        v-for="device in audioDevices"
                        :key="device.deviceId"
                        @click="selectAudioDevice(device.deviceId)"
                        :class="{ 'bg-blue-50 dark:bg-blue-900': selectedAudioDevice === device.deviceId }"
                        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                        {{ device.label || 'Microphone ' + (audioDevices.indexOf(device) + 1) }}
                    </button>
                    <hr class="my-2" />
                    <button
                        @click="handleToggleAudioMute"
                        class="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        {{ audioMuted ? 'Unmute' : 'Mute' }}
                    </button>
                </div>
            </div>

            <!-- Cancel Button -->
            <button
                @click="handleCancel"
                class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor">
                    <path
                        d="M6 18L18 6M6 6l12 12"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round" />
                </svg>
            </button>
        </div>

        <!-- Recording Active Toolbar -->
        <div
            v-if="isRecording"
            class="absolute top-8 left-1/2 flex -translate-x-1/2 transform items-center gap-4 rounded-lg bg-white px-6 py-3 shadow-xl dark:bg-gray-800">
            <!-- Timer -->
            <div class="flex items-center gap-2">
                <div class="h-3 w-3 animate-pulse rounded-full bg-red-500"></div>
                <span class="font-mono text-lg font-medium">{{ recordingTimeFormatted }}</span>
            </div>

            <!-- Pause Button -->
            <button
                @click="pauseRecording"
                class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                <svg
                    v-if="!isPaused"
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor">
                    <path d="M10 4H6v16h4V4zm8 0h-4v16h4V4z" />
                </svg>
                <svg
                    v-else
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                </svg>
            </button>

            <!-- Stop Button -->
            <button
                @click="stopRecording"
                class="rounded-lg bg-red-500 p-2 text-white transition-colors hover:bg-red-600">
                <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor">
                    <rect
                        x="6"
                        y="6"
                        width="12"
                        height="12"
                        rx="2" />
                </svg>
            </button>
        </div>
    </div>
</template>
