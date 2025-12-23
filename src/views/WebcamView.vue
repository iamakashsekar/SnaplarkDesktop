<script setup>
    import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
    import { useStore } from '@/store'

    const store = useStore()

    const videoElement = ref(null)
    const stream = ref(null)
    const isLoading = ref(true)
    const hasError = ref(false)
    const errorMessage = ref('Camera unavailable')

    const flipCamera = computed(() => store.settings.flipCamera)
    const selectedDeviceId = computed(() => store.settings.selectedWebcamDeviceId)

    const startWebcam = async () => {
        stopWebcam() // Stop existing stream first

        try {
            isLoading.value = true
            hasError.value = false
            errorMessage.value = 'Camera unavailable'

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                hasError.value = true
                isLoading.value = false
                return
            }

            // Check if we have a selected device ID
            const constraints = {
                video: selectedDeviceId.value ? { deviceId: { exact: selectedDeviceId.value } } : true,
                audio: false
            }

            // If a specific device is selected, verify it exists first (optional, but good for error messages)
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = devices.filter((d) => d.kind === 'videoinput')

            if (videoDevices.length === 0) {
                hasError.value = true
                errorMessage.value = 'No webcam found'
                isLoading.value = false
                return
            }

            if (selectedDeviceId.value) {
                const deviceExists = videoDevices.some((d) => d.deviceId === selectedDeviceId.value)
                if (!deviceExists) {
                    // Fallback to first available if selected one is missing
                    // console.warn('Selected webcam not found, falling back to default')
                    // constraints.video = true
                    // Or show error as requested? User said "we remember the selection...".
                    // If missing, maybe better to show error or fallback?
                    // User said: "if they adjust the cam at that moment it will automatically appear"
                    // This implies if they plug it back in, it should work.
                    // If we fallback, we lose the "waiting for specific camera" state.
                    // But if they have NO camera, show "No Webcam found".
                    // If they have OTHER cameras, but selected one is missing?
                    // The request implies "selecting" source.
                }
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

            stream.value = mediaStream

            if (videoElement.value) {
                videoElement.value.srcObject = mediaStream

                videoElement.value.onerror = () => {
                    hasError.value = true
                    isLoading.value = false
                }

                videoElement.value.onloadedmetadata = () => {
                    isLoading.value = false
                }

                try {
                    await videoElement.value.play()
                } catch (playError) {
                    hasError.value = true
                    isLoading.value = false
                }
            } else {
                hasError.value = true
                isLoading.value = false
            }
        } catch (error) {
            console.error('Webcam start error:', error)
            hasError.value = true
            if (error.name === 'OverconstrainedError') {
                errorMessage.value = 'Selected camera not found'
            } else if (error.name === 'NotAllowedError') {
                errorMessage.value = 'Permission denied'
            } else if (error.name === 'NotFoundError') {
                errorMessage.value = 'No webcam found'
            }
            isLoading.value = false
        }
    }

    const closeWebcamWindow = async () => {
        stopWebcam()
        // Hide the webcam window via IPC
        await window.electronWindows?.closeWindow?.('webcam')
    }

    const stopWebcam = () => {
        if (stream.value) {
            stream.value.getTracks().forEach((track) => track.stop())
            stream.value = null
        }

        if (videoElement.value) {
            videoElement.value.srcObject = null
        }
    }

    const handleEscapeKeyCancel = async (event) => {
        if (event.key === 'Escape') {
            await window.electronWindows?.closeWindow?.('webcam')
            await window.electron?.cancelVideoRecordingMode()
        }
    }

    const handleDeviceChange = async () => {
        // If we currently have an error (e.g. no camera), or if we want to ensure we are using the right device
        // We should retry starting the webcam
        // Add a small delay to ensure devices are ready
        setTimeout(() => {
            startWebcam()
        }, 500)
    }

    watch(selectedDeviceId, () => {
        startWebcam()
    })

    onMounted(() => {
        startWebcam()
        document.addEventListener('keydown', handleEscapeKeyCancel)
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    })

    onUnmounted(() => {
        document.removeEventListener('keydown', handleEscapeKeyCancel)
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
        stopWebcam()
    })
</script>

<template>
    <!-- Webcam container wrapper for hover detection -->
    <div class="group relative z-10 size-52">
        <!-- Webcam drag container -->
        <div class="drag relative size-52 overflow-hidden rounded-full border-4 border-gray-100 bg-transparent">
            <!-- Loading indicator -->
            <div
                v-if="isLoading"
                class="bg-opacity-50 flex h-full w-full items-center justify-center bg-gray-900">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            </div>

            <!-- Webcam video -->
            <video
                v-show="!isLoading && !hasError"
                ref="videoElement"
                class="size-52 rounded-full bg-black object-cover"
                :style="{ transform: flipCamera ? 'scaleX(-1)' : 'none' }"
                autoplay
                muted
                playsinline></video>

            <!-- Error state -->
            <div
                v-if="hasError && !isLoading"
                class="bg-opacity-50 flex h-full w-full items-center justify-center bg-gray-900">
                <div class="text-center text-sm">
                    <p>{{ errorMessage }}</p>
                </div>
            </div>
        </div>

        <!-- close button on hover -->
        <!-- <button
            class="no-drag absolute top-5 right-5 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-opacity hover:bg-red-600"
            @click="closeWebcamWindow">
            <svg
                class="size-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button> -->
    </div>
</template>
