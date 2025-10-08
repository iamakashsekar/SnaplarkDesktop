<script setup>
    import { ref, onMounted, computed } from 'vue'
    import { apiClient } from '../api/config.js'

    const videoPath = ref('')
    const videoSrc = ref('')
    const videoRef = ref(null)
    const isPlaying = ref(false)
    const currentTime = ref(0)
    const duration = ref(0)
    const uploading = ref(false)
    const uploadProgress = ref(0)

    const currentTimeFormatted = computed(() => formatTime(currentTime.value))
    const durationFormatted = computed(() => formatTime(duration.value))
    const progressPercent = computed(() => {
        return duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0
    })

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }

    const togglePlayPause = () => {
        if (!videoRef.value) return

        if (isPlaying.value) {
            videoRef.value.pause()
        } else {
            videoRef.value.play()
        }
    }

    const handleTimeUpdate = () => {
        if (videoRef.value) {
            currentTime.value = videoRef.value.currentTime
        }
    }

    const handleLoadedMetadata = () => {
        if (videoRef.value) {
            duration.value = videoRef.value.duration
        }
    }

    const handlePlay = () => {
        isPlaying.value = true
    }

    const handlePause = () => {
        isPlaying.value = false
    }

    const seekVideo = (event) => {
        if (!videoRef.value) return

        const progressBar = event.currentTarget
        const rect = progressBar.getBoundingClientRect()
        const percent = (event.clientX - rect.left) / rect.width
        videoRef.value.currentTime = percent * duration.value
    }

    const handleUpload = async () => {
        if (!videoPath.value) return

        try {
            uploading.value = true
            uploadProgress.value = 0

            const buffer = await window.electron?.readFileAsBuffer(videoPath.value)
            if (!buffer) {
                throw new Error('Failed to read video file')
            }

            const fileName = videoPath.value.split('/').pop()
            const file = new File([buffer], fileName, { type: 'video/webm' })

            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'video')

            const response = await apiClient.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                }
            })

            if (response.data.success) {
                window.electronNotifications?.notify({
                    id: `upload-${Date.now()}`,
                    title: 'Upload Complete',
                    message: response.data.url,
                    variant: 'success',
                    timeoutMs: 6000,
                    actions: [
                        {
                            label: 'Copy Link',
                            onClick: () => navigator.clipboard.writeText(response.data.url)
                        },
                        {
                            label: 'Open',
                            onClick: () => window.electron.openExternal(response.data.url)
                        }
                    ]
                })

                window.electronWindows?.closeWindow('recording-preview')
            }
        } catch (error) {
            console.error('Upload failed:', error)
            window.electronNotifications?.notify({
                id: `upload-error-${Date.now()}`,
                title: 'Upload Failed',
                message: error.message,
                variant: 'error',
                timeoutMs: 5000
            })
        } finally {
            uploading.value = false
        }
    }

    const handleCopy = async () => {
        if (!videoPath.value) return

        try {
            await navigator.clipboard.writeText(videoPath.value)
            window.electronNotifications?.notify({
                id: `copy-${Date.now()}`,
                title: 'Path Copied',
                message: 'Video path copied to clipboard',
                variant: 'success',
                timeoutMs: 3000
            })
        } catch (error) {
            console.error('Copy failed:', error)
        }
    }

    const handleSave = async () => {
        window.electron?.openExternal('file://' + videoPath.value)
    }

    const handleRedo = async () => {
        window.electronWindows?.closeWindow('recording-preview')
        await window.electron?.startRecordingMode()
    }

    const handleClose = () => {
        window.electronWindows?.closeWindow('recording-preview')
    }

    onMounted(async () => {
        const urlParams = new URLSearchParams(window.location.search)
        videoPath.value = urlParams.get('filepath') || ''

        if (videoPath.value) {
            videoSrc.value = 'file://' + videoPath.value
        }
    })
</script>

<template>
    <div class="fixed inset-0 flex flex-col bg-gray-50 dark:bg-gray-900">
        <!-- Header -->
        <div class="flex items-center justify-between bg-blue-500 px-6 py-4 text-white">
            <div class="flex items-center gap-3">
                <svg
                    class="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="currentColor">
                    <path d="M13.5 8.5L17 6.5V17.5L13.5 15.5V8.5Z" />
                    <path
                        d="M3 6.5C3 5.67157 3.67157 5 4.5 5H12C12.8284 5 13.5 5.67157 13.5 6.5V17.5C13.5 18.3284 12.8284 19 12 19H4.5C3.67157 19 3 18.3284 3 17.5V6.5Z" />
                </svg>
                <h1 class="text-lg font-semibold">Video Preview</h1>
            </div>

            <div class="flex items-center gap-2">
                <button
                    @click="handleClose"
                    class="rounded-lg p-2 transition-colors hover:bg-blue-600">
                    <svg
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor">
                        <path
                            d="M20 12H4"
                            stroke-width="2"
                            stroke-linecap="round" />
                    </svg>
                </button>
                <button
                    @click="handleClose"
                    class="rounded-lg p-2 transition-colors hover:bg-blue-600">
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
        </div>

        <!-- Video Player -->
        <div class="flex flex-1 items-center justify-center bg-black p-8">
            <div class="w-full max-w-5xl">
                <video
                    ref="videoRef"
                    :src="videoSrc"
                    class="w-full rounded-lg shadow-2xl"
                    @timeupdate="handleTimeUpdate"
                    @loadedmetadata="handleLoadedMetadata"
                    @play="handlePlay"
                    @pause="handlePause"></video>

                <!-- Video Controls -->
                <div class="mt-4 rounded-lg bg-white p-4 shadow-lg dark:bg-gray-800">
                    <!-- Play/Pause Button -->
                    <div class="flex items-center gap-4">
                        <button
                            @click="togglePlayPause"
                            class="rounded-full bg-blue-500 p-3 text-white transition-colors hover:bg-blue-600">
                            <svg
                                v-if="!isPlaying"
                                class="h-6 w-6"
                                viewBox="0 0 24 24"
                                fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            <svg
                                v-else
                                class="h-6 w-6"
                                viewBox="0 0 24 24"
                                fill="currentColor">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                            </svg>
                        </button>

                        <!-- Progress Bar -->
                        <div class="flex-1">
                            <div
                                @click="seekVideo"
                                class="h-2 cursor-pointer overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                    class="h-full bg-blue-500 transition-all"
                                    :style="{ width: `${progressPercent}%` }"></div>
                            </div>
                            <div class="mt-1 flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                <span>{{ currentTimeFormatted }}</span>
                                <span>{{ durationFormatted }}</span>
                            </div>
                        </div>

                        <!-- Edit Button -->
                        <button
                            class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Edit (Coming Soon)">
                            <svg
                                class="h-6 w-6"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor">
                                <path
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Action Buttons -->
        <div
            class="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center gap-3">
                <!-- Upload Button -->
                <button
                    @click="handleUpload"
                    :disabled="uploading"
                    class="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 font-medium text-white shadow-lg transition-colors hover:bg-blue-600 disabled:bg-gray-400">
                    <svg
                        v-if="!uploading"
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor">
                        <path
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                    <span v-if="!uploading">Upload</span>
                    <span v-else>Uploading... {{ uploadProgress }}%</span>
                </button>

                <!-- Copy Button -->
                <button
                    @click="handleCopy"
                    class="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-6 py-3 font-medium text-blue-500 transition-colors hover:bg-blue-50 dark:bg-gray-700 dark:hover:bg-gray-600">
                    <svg
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor">
                        <path
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                    <span>Copy</span>
                </button>

                <!-- Save Button -->
                <button
                    @click="handleSave"
                    class="flex items-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-6 py-3 font-medium text-blue-500 transition-colors hover:bg-blue-50 dark:bg-gray-700 dark:hover:bg-gray-600">
                    <svg
                        class="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor">
                        <path
                            d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                    <span>Save</span>
                </button>
            </div>

            <!-- Redo Button -->
            <button
                @click="handleRedo"
                class="flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-blue-500 transition-colors hover:text-blue-600">
                <svg
                    class="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor">
                    <path
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round" />
                </svg>
                <span>Redo</span>
            </button>
        </div>
    </div>
</template>
