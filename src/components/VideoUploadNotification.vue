<script setup>
    import { ref, onMounted, onUnmounted } from 'vue'
    import { ChunkUploadManager } from '../services/chunk-upload-manager'
    import { BASE_URL } from '../api/config'
    import { useStore } from '../store'

    const props = defineProps({
        notificationId: {
            type: String,
            required: true
        },
        fileInfo: {
            type: Object,
            required: true
        }
    })

    const emit = defineEmits(['close', 'hide', 'show'])

    const store = useStore()

    const manager = ref(null)
    const progress = ref({ uploaded: 0, total: 0, percentage: 0, isOnline: true })
    const status = ref('uploading') // uploading, finalizing, success, error
    const link = ref('')
    const tooltipText = ref('Copy Link')

    const autoCloseCountdown = ref(0)
    const autoCloseTimer = ref(null)

    const updateProgress = () => {
        if (!manager.value) return
        const p = manager.value.getProgress()
        progress.value = {
            uploaded: p.uploaded,
            total: p.totalQueued,
            percentage: p.percentage,
            isOnline: p.isOnline
        }
    }

    const copyToClipboard = async () => {
        try {
            await window.electron.writeToClipboard(link.value)
            tooltipText.value = 'Copied'
            setTimeout(() => {
                tooltipText.value = 'Copy Link'
            }, 2000)

            // Give user a moment to see "Copied" before closing
            setTimeout(() => {
                emit('close')
            }, 1000)
        } catch (error) {
            console.error('Failed to copy link:', error)
        }
    }

    const openLink = () => {
        window.electron.openExternal(link.value)
        emit('close')
    }

    const startAutoCloseCountdown = () => {
        autoCloseCountdown.value = 10
        autoCloseTimer.value = setInterval(() => {
            autoCloseCountdown.value--
            if (autoCloseCountdown.value <= 0) {
                clearInterval(autoCloseTimer.value)
                emit('close')
            }
        }, 1000)
    }

    const cancelAutoClose = () => {
        if (autoCloseTimer.value) {
            clearInterval(autoCloseTimer.value)
            autoCloseTimer.value = null
            autoCloseCountdown.value = 0
        }
    }

    onMounted(() => {
        console.log(`VideoUploadNotification mounted for ${props.notificationId}`)

        // precise UI updates
        const interval = setInterval(updateProgress, 500)

        // Instantiate manager
        manager.value = new ChunkUploadManager()

        // Listen for chunks
        window.electronNotifications.onVideoChunk((payload) => {
            if (payload.id !== props.notificationId) return

            // Convert buffer/array to Blob
            // payload.chunk is likely a Buffer/Uint8Array from IPC
            const blob = new Blob([payload.chunk], { type: 'video/webm' })
            manager.value.queueChunk(blob, payload.chunkIndex)
            updateProgress()
        })

        // Listen for finalize
        window.electronNotifications.onVideoFinalize(async (payload) => {
            if (payload.id !== props.notificationId) return

            console.log('Received finalize signal')
            status.value = 'finalizing'
            emit('show') // Show notification when finalizing starts

            try {
                const result = await manager.value.finalizeSession(payload.metadata)

                if (result.success) {
                    status.value = 'success'
                    link.value = BASE_URL + '/' + result.key
                    store.lastCapture = link.value // Automatic sync will handle this

                    if (store.settings.openInBrowser) {
                        await window.electron.openExternal(link.value)
                        emit('close')
                    } else {
                        // Start auto-close countdown for successful uploads
                        startAutoCloseCountdown()
                    }
                } else {
                    status.value = 'error'
                    console.error('Upload finalization failed:', result.error)
                    emit('show') // ensure visible
                }
            } catch (error) {
                status.value = 'error'
                console.error('Upload error:', error)
            } finally {
                updateProgress()
            }
        })

        // Queue initial metadata
        if (props.fileInfo.metadata) {
            manager.value.queueInit(props.fileInfo.metadata)
        }

        onUnmounted(() => {
            clearInterval(interval)
            cancelAutoClose()
            // Cleanup listeners if we could (electronNotifications.removeListener...)
            // Currently preload doesn't expose removeListener for these specific ones,
            // but Vue component unmounts usually happen when notification is removed.
            // A more robust app would implement removeListener.
        })
    })
</script>

<template>
    <div>
        <!-- Title -->
        <div class="mb-5 flex items-center gap-4">
            <template v-if="status === 'uploading' || status === 'finalizing'">
                <div class="box-shadow bg-primary-blue flex size-8 items-center justify-center rounded-lg">
                    <!-- Video Icon -->
                    <svg
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z"
                            stroke="white"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <rect
                            x="3"
                            y="6"
                            width="12"
                            height="12"
                            rx="2"
                            stroke="white"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </div>
                <h2 class="font-bold">{{ status === 'finalizing' ? 'Finalizing Video...' : 'Uploading Video...' }}</h2>
            </template>

            <template v-if="status === 'error'">
                <div class="error-shadow flex size-8 items-center justify-center rounded-lg bg-[#D73A3A]">
                    <svg
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round">
                        <circle
                            cx="12"
                            cy="12"
                            r="10"></circle>
                        <line
                            x1="12"
                            y1="8"
                            x2="12"
                            y2="12"></line>
                        <line
                            x1="12"
                            y1="16"
                            x2="12.01"
                            y2="16"></line>
                    </svg>
                </div>
                <h2 class="font-bold">Upload Failed</h2>
            </template>

            <template v-if="status === 'success'">
                <div class="box-shadow bg-primary-blue flex size-8 items-center justify-center rounded-lg">
                    <svg
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <h2 class="font-bold">Video Link Ready</h2>
            </template>

            <div class="ml-auto flex items-center gap-1">
                <button
                    @click="$emit('hide')"
                    class="rounded-full p-1 transition-colors hover:bg-gray-100"
                    title="Hide notification (upload continues in background)">
                    <svg
                        class="size-6"
                        viewBox="0 0 26 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            opacity="0.4"
                            d="M13.1373 22C18.8439 22 23.47 17.5228 23.47 12C23.47 6.47715 18.8439 2 13.1373 2C7.43077 2 2.80469 6.47715 2.80469 12C2.80469 17.5228 7.43077 22 13.1373 22Z"
                            fill="#6C82A3" />
                        <path
                            d="M17.1895 12.75H8.92339C8.49975 12.75 8.14844 12.41 8.14844 12C8.14844 11.59 8.49975 11.25 8.92339 11.25H17.1895C17.6131 11.25 17.9644 11.59 17.9644 12C17.9644 12.41 17.6235 12.75 17.1895 12.75Z"
                            fill="#6C82A3" />
                    </svg>
                </button>

                <button
                    @click="$emit('close')"
                    class="rounded-full p-1 transition-colors hover:bg-gray-100"
                    title="Close">
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

        <!-- Progress Bar -->
        <template v-if="status === 'uploading' || status === 'finalizing' || status === 'error'">
            <div class="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                    class="animate-indeterminate absolute inset-y-0 left-0 w-1/3 rounded-full bg-linear-to-r from-blue-500 to-cyan-500"></div>
            </div>
            <p class="mt-2 text-right text-xs text-slate-400">Processing...</p>
        </template>

        <!-- Success Actions -->
        <template v-if="status === 'success'">
            <div class="flex gap-2 pb-4">
                <div
                    class="flex-1 truncate rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-blue-500">
                    {{ link }}
                </div>
                <!-- Copy Button -->
                <button
                    @click="copyToClipboard"
                    class="group relative flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-500 hover:bg-blue-200">
                    <svg
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round">
                        <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <!-- Tooltip -->
                    <div class="absolute top-full mt-1.5 hidden w-max group-hover:block">
                        <div class="relative rounded-md bg-[#1e2530] px-3 py-1.5 text-xs text-white">
                            {{ tooltipText }}
                            <div
                                class="absolute -top-1.5 left-1/2 h-0 w-0 -translate-x-1/2 border-r-8 border-b-8 border-l-8 border-r-transparent border-b-[#1e2530] border-l-transparent"></div>
                        </div>
                    </div>
                </button>
                <!-- Open Button -->
                <button
                    @click="openLink"
                    class="group relative flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-500 hover:bg-blue-200">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none">
                        <path
                            d="M13 10.9998L21.2 2.7998"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M22 6.8V2H17.2"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </button>
            </div>
        </template>

        <!-- Auto-close countdown -->
        <div
            v-if="autoCloseCountdown > 0"
            class="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>Auto-closing in {{ autoCloseCountdown }}s</span>
            <button
                @click="cancelAutoClose"
                class="text-blue-500 underline hover:text-blue-600">
                Cancel
            </button>
        </div>
    </div>
</template>

<style scoped>
    .error-shadow {
        box-shadow: 0px 11px 35px 0px #d73a3a4a !important;
    }

    .box-shadow {
        box-shadow: 0px 11px 35px 0px #2178ff4a;
    }

    .animate-indeterminate {
        animation: indeterminate 1.5s infinite linear;
    }

    @keyframes indeterminate {
        0% {
            left: -40%;
        }
        100% {
            left: 100%;
        }
    }
</style>
