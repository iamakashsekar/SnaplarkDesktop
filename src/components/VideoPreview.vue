<script setup>
    const props = defineProps({
        filename: {
            type: String,
            default: null
        }
    })

    const emit = defineEmits(['cancel'])
</script>

<template>
    <div class="fixed inset-0 flex flex-col">
        <div class="flex w-full flex-1 flex-col rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2">
            <div class="flex h-full flex-col rounded-2xl bg-white p-5">
                <!-- Title -->
                <div class="drag mb-5 flex shrink-0 items-center gap-4">
                    <h2
                        v-if="filename"
                        class="font-bold">
                        {{ filename }}
                    </h2>

                    <div class="no-drag ml-auto flex items-center gap-1">
                        <button @click="emit('cancel')">
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
                <div class="relative flex-1 overflow-hidden rounded-2xl bg-black">
                    <!-- Processing Overlay -->
                    <div
                        class="bg-gray-black/60 absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 backdrop-blur-md">
                        <div class="relative h-16 w-16">
                            <div
                                class="absolute inset-0 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
                        </div>
                        <div class="text-center">
                            <p class="text-lg font-semibold text-white">Processing video...</p>
                            <small class="mt-1 block text-sm text-white/70">Please wait...</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
