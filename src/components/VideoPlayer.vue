<script setup>
    import { ref, onMounted, watch } from 'vue'

    // Props
    const props = defineProps({
        src: {
            type: [String, File],
            required: true
        },
        autoplay: {
            type: Boolean,
            default: true
        },
        showControls: {
            type: Boolean,
            default: true
        }
    })

    // Reactive variables
    const videoRef = ref(null)
    const isPlaying = ref(false)
    const isMuted = ref(false)
    const volume = ref(1)
    const currentTime = ref(0)
    const duration = ref(0)

    // Computed video source URL
    const videoSrc = ref('')

    // Handle different src types
    const setVideoSource = () => {
        if (typeof props.src === 'string') {
            // URL string
            videoSrc.value = props.src
        } else if (props.src instanceof File) {
            // File object
            videoSrc.value = URL.createObjectURL(props.src)
        }
    }

    // Set up video source when component mounts or src changes
    onMounted(() => {
        setVideoSource()
    })

    watch(
        () => props.src,
        () => {
            setVideoSource()
        },
        { immediate: true }
    )

    // Video event handlers
    const handleTimeUpdate = () => {
        if (videoRef.value) {
            currentTime.value = videoRef.value.currentTime
        }
    }

    const handleLoadedMetadata = () => {
        if (videoRef.value) {
            duration.value = videoRef.value.duration
            if (props.autoplay) {
                videoRef.value.play().catch(() => {
                    // Autoplay might be blocked, that's okay
                })
            }
        }
    }

    const handlePlay = () => {
        isPlaying.value = true
    }

    const handlePause = () => {
        isPlaying.value = false
    }

    // Control functions
    const togglePlay = () => {
        if (videoRef.value) {
            if (isPlaying.value) {
                videoRef.value.pause()
            } else {
                videoRef.value.play()
            }
        }
    }

    const toggleMute = () => {
        if (videoRef.value) {
            videoRef.value.muted = !isMuted.value
            isMuted.value = !isMuted.value
        }
    }

    const handleVolumeChange = (event) => {
        const newVolume = event.target.value
        volume.value = newVolume
        if (videoRef.value) {
            videoRef.value.volume = newVolume
        }
    }

    const handleProgressChange = (event) => {
        const newTime = event.target.value
        currentTime.value = newTime
        if (videoRef.value) {
            videoRef.value.currentTime = newTime
        }
    }

    const formatTime = (timeInSeconds) => {
        const minutes = Math.floor(timeInSeconds / 60)
        const seconds = Math.floor(timeInSeconds % 60)
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    // Cleanup object URL when component unmounts
    import { onUnmounted } from 'vue'

    // Controls visibility
    const isControlsVisible = ref(false)
    let controlsTimer = null

    const handleMouseMove = () => {
        if (!props.showControls) return

        isControlsVisible.value = true

        if (controlsTimer) clearTimeout(controlsTimer)

        controlsTimer = setTimeout(() => {
            isControlsVisible.value = false
        }, 2500)
    }

    const handleMouseLeave = () => {
        if (controlsTimer) clearTimeout(controlsTimer)
        controlsTimer = setTimeout(() => {
            isControlsVisible.value = false
        }, 2500)
    }

    onUnmounted(() => {
        if (videoSrc.value && videoSrc.value.startsWith('blob:')) {
            URL.revokeObjectURL(videoSrc.value)
        }
        if (controlsTimer) clearTimeout(controlsTimer)
    })
</script>

<template>
    <div
        class="group relative h-full w-full"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave">
        <!-- Video Element -->
        <video
            ref="videoRef"
            :src="videoSrc"
            :autoplay="autoplay"
            :muted="isMuted"
            @timeupdate="handleTimeUpdate"
            @loadedmetadata="handleLoadedMetadata"
            @play="handlePlay"
            @pause="handlePause"
            class="h-full w-full rounded-2xl bg-black object-contain"
            playsinline></video>

        <!-- Custom Controls (only if showControls is true) -->
        <Transition name="fade">
            <div
                v-if="showControls && isControlsVisible"
                class="absolute right-4 bottom-4 left-4">
                <div class="flex items-center justify-between rounded-lg bg-black/50 p-2 backdrop-blur-sm">
                    <!-- Play/Pause Button -->
                    <button
                        @click="togglePlay"
                        class="mr-4 flex size-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30">
                        <svg
                            v-if="!isPlaying"
                            class="size-4"
                            fill="currentColor"
                            viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        <svg
                            v-else
                            class="size-4"
                            fill="currentColor"
                            viewBox="0 0 24 24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    </button>

                    <!-- Progress Bar and Time (Center) -->
                    <div class="mx-4 flex flex-1 items-center gap-3 text-sm text-white">
                        <span class="min-w-[30px] text-right text-xs">{{ formatTime(currentTime) }}</span>
                        <input
                            type="range"
                            min="0"
                            :max="duration"
                            :value="currentTime"
                            @input="handleProgressChange"
                            class="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-white/30 accent-white" />
                        <span class="min-w-[30px] text-xs">{{ formatTime(duration) }}</span>
                    </div>

                    <!-- Volume Control -->
                    <div class="flex items-center gap-2">
                        <button
                            @click="toggleMute"
                            class="flex size-6 items-center justify-center text-white transition-colors hover:text-gray-300">
                            <svg
                                v-if="!isMuted"
                                class="size-3"
                                fill="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                    d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                            </svg>
                            <svg
                                v-else
                                class="size-3"
                                fill="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                    d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v1.79l2.48 2.25 1.77-1.77L16.5 12zm-4.5 0c0 .83.42 1.56 1.05 2l1.43-1.43c-.15-.29-.48-.57-.98-.57-.55 0-.99.44-.99.99zm-2.5-4.03v1.79l2.48 2.25L8.25 9.22C7.58 9.85 7.16 10.58 7.16 11.5c0 .91.44 1.71 1.11 2.25l1.43-1.43c-.51 0-.84-.28-.98-.57-.55 0-.99.44-.99.99 0 .83.42 1.56 1.05 2l1.43-1.43c-.51 0-.84-.28-.98-.57-.15-.29-.48-.57-.98-.57-.55 0-.99.44-.99.99 0 .55.44.99.99.99.42 0 .77-.25.93-.59l1.43 1.43c.67-.54 1.11-1.34 1.11-2.25 0-.92-.44-1.72-1.11-2.25L10.5 7.97zM3 9v6h4l5 5V4L7 9H3z" />
                            </svg>
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            :value="volume"
                            @input="handleVolumeChange"
                            class="h-1 w-10 cursor-pointer appearance-none rounded-lg bg-white/30 accent-white" />
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
    /* Custom range input styling */
    input[type='range']::-webkit-slider-thumb {
        appearance: none;
        height: 12px;
        width: 12px;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        border: none;
    }

    input[type='range']::-moz-range-thumb {
        height: 12px;
        width: 12px;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        border: none;
    }

    /* Transition animations */
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.3s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }
</style>
