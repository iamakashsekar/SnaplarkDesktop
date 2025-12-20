<script setup>
    import { ref } from 'vue'
    import VideoPlayer from '../components/VideoPlayer.vue'

    const isProcessing = ref(true)
    const recordedVideoUrl = ref('http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4')
    const isDownloading = ref(false)
</script>

<template>
    <div class="size-full rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2">
        <div class="rounded-2xl bg-white p-5">
            <!-- Title -->
            <div class="drag mb-5 flex items-center gap-4">
                <h2 class="font-bold">Name of the video file</h2>

                <div class="ml-auto flex items-center gap-1">
                    <button>
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

            <!-- Video Preview & Processing Overlay -->
            <div class="relative overflow-hidden rounded-2xl">
                <VideoPlayer
                    :src="recordedVideoUrl"
                    :class="{ invisible: isProcessing }"
                    :autoplay="!isProcessing"
                    :show-controls="!isProcessing" />

                <!-- Processing Overlay -->
                <div
                    v-if="isProcessing"
                    class="bg-gray-black/60 absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 backdrop-blur-md">
                    <div class="relative h-16 w-16">
                        <div
                            class="absolute inset-0 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
                    </div>
                    <div class="text-center">
                        <p class="text-lg font-semibold text-white">Processing video...</p>
                        <small class="mt-1 block text-sm text-white/70">Fixing duration metadata</small>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Action Toolbar -->
    <div
        v-if="recordedVideoUrl"
        class="toolbar-container mt-2 flex items-center gap-4 transition-shadow">
        <div class="mx-auto flex items-center rounded-full bg-white/90">
            <button
                @click="handleUpload"
                title="Upload"
                class="group hover:bg-primary-blue flex cursor-pointer gap-2.5 rounded-full border border-transparent px-3.5 py-3 transition-all hover:border-white hover:px-5">
                <svg
                    class="size-6 group-hover:text-white"
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
                    class="size-6 group-hover:text-white"
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
                    class="size-6 group-hover:text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M8.78125 13.2002H15.4746C15.6843 13.2002 15.8564 13.3717 15.8564 13.585V19.5C15.8564 19.6933 15.6992 19.8496 15.5059 19.8496H8.75C8.55672 19.8496 8.40039 19.6933 8.40039 19.5V13.585C8.40039 13.3717 8.5716 13.2002 8.78125 13.2002ZM7.8252 3.15039C8.09431 3.1505 8.3125 3.36856 8.3125 3.6377V5.88672C8.3125 6.85441 9.09271 7.64062 10.0566 7.64062H14.2002C15.164 7.64049 15.9434 6.85433 15.9434 5.88672V4.21094C15.9434 4.14578 15.9785 4.09968 16.0195 4.0791C16.0582 4.05972 16.104 4.06116 16.1465 4.09961L18.5703 6.29492C19.3447 6.99621 19.787 7.99515 19.7871 9.04395V16.1514C19.7869 17.6994 18.8424 19.0247 17.502 19.5762C17.3737 19.6289 17.219 19.5336 17.2188 19.3623V13.585C17.2188 12.6173 16.4385 11.8311 15.4746 11.8311H8.78125C7.81734 11.8311 7.03711 12.6173 7.03711 13.585V19.4736C7.03709 19.6348 6.89786 19.7335 6.77051 19.6953C5.25543 19.2392 4.15058 17.8254 4.15039 16.1514V6.84863C4.15062 4.80501 5.79657 3.15039 7.8252 3.15039ZM10.0254 3.15039H14.2314C14.4246 3.15053 14.5811 3.30679 14.5811 3.5V5.88672C14.5811 6.09992 14.4098 6.27134 14.2002 6.27148H10.0566C9.84697 6.27148 9.6748 6.10001 9.6748 5.88672V3.5C9.6748 3.3067 9.83209 3.15039 10.0254 3.15039Z"
                        fill="currentColor" />
                </svg>
                <span class="hidden group-hover:block group-hover:text-white"> Save </span>
            </button>
        </div>
    </div>
</template>

<style scoped>
    /* Empty */
</style>
