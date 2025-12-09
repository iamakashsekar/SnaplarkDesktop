<script setup>
    import { computed, onMounted, onUnmounted, ref } from 'vue'
    import { useStore } from '@/store'

    const store = useStore()

    const videoElement = ref(null)
    const stream = ref(null)
    const isLoading = ref(true)
    const hasError = ref(false)

    const flipCamera = computed(() => store.settings.flipCamera)

    const startWebcam = async () => {
        try {
            isLoading.value = true
            hasError.value = false

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                hasError.value = true
                isLoading.value = false
                return
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            })

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
            hasError.value = true
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

    onMounted(() => {
        startWebcam()
        document.addEventListener('keydown', handleEscapeKeyCancel)
    })

    onUnmounted(() => {
        document.removeEventListener('keydown', handleEscapeKeyCancel)
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
                    <p>Camera unavailable</p>
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
