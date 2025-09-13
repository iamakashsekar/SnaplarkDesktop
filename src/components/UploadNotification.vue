<script setup>
    import { onMounted, onUnmounted, ref } from 'vue'
    import { apiClient } from '../api/config'
    import { useStore } from '@/store'

    const props = defineProps({
        fileInfo: Object
    })

    const store = useStore()

    const emit = defineEmits(['close', 'hide', 'show'])

    const uploadProgress = ref(0)
    const uploadStatus = ref('pending')
    const link = ref('')
    const tooltipText = ref('Copy Link')
    const autoCloseCountdown = ref(0)
    const autoCloseTimer = ref(null)

    const bufferToFile = (buffer, fileName) => {
        return new File([new Blob([buffer], { type: 'image/png' })], fileName, { type: 'image/png' })
    }

    const animateProgressTo = (targetProgress) => {
        const currentProgress = uploadProgress.value
        const difference = targetProgress - currentProgress
        const steps = Math.abs(difference)
        const stepSize = difference / Math.max(steps, 1)
        const animationSpeed = 25 // milliseconds between steps

        let step = 0
        const interval = setInterval(() => {
            step++
            const newProgress = currentProgress + stepSize * step

            if (
                (stepSize > 0 && newProgress >= targetProgress) ||
                (stepSize < 0 && newProgress <= targetProgress) ||
                step >= steps
            ) {
                uploadProgress.value = targetProgress
                clearInterval(interval)
            } else {
                uploadProgress.value = Math.round(newProgress)
            }
        }, animationSpeed)

        return interval
    }

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(link.value)
            // Change tooltip to "Copied" on successful copy
            tooltipText.value = 'Copied'
            // Reset tooltip back to "Copy Link" after 2 seconds
            setTimeout(() => {
                tooltipText.value = 'Copy Link'
            }, 2000)

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

    const uploadFile = async () => {
        try {
            uploadStatus.value = 'pending'
            uploadProgress.value = 0
            let currentAnimationInterval = null

            const buffer = await window.electron.readFileAsBuffer(props.fileInfo.path)
            const blobFile = bufferToFile(buffer, props.fileInfo.fileName)

            const formData = new FormData()
            formData.append('capture', blobFile)

            const result = await apiClient.post('/media/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    console.log('progressEvent', progressEvent)
                    if (progressEvent.lengthComputable) {
                        const percentCompleted = Math.min(
                            Math.round((progressEvent.loaded * 100) / progressEvent.total),
                            99
                        )

                        // Clear any existing animation
                        if (currentAnimationInterval) {
                            clearInterval(currentAnimationInterval)
                        }

                        // Only animate to progress that's higher than current
                        if (percentCompleted > uploadProgress.value) {
                            currentAnimationInterval = animateProgressTo(percentCompleted)
                        }
                    }
                }
            })

            // Clear any existing animation
            if (currentAnimationInterval) {
                clearInterval(currentAnimationInterval)
            }

            // Only set to 99% after upload is complete and animate to it
            if (uploadProgress.value < 99) {
                currentAnimationInterval = animateProgressTo(99)
            }

            // Set success status and data
            uploadStatus.value = 'success'
            link.value = 'https://snaplark.com/' + result.data
            store.lastCapture = link.value // Automatic sync will handle this

            // Start auto-close countdown for successful uploads
            startAutoCloseCountdown()
        } catch (error) {
            uploadStatus.value = 'error'
            console.error('Upload failed:', error)

            // Show notification if it was hidden (for failed uploads)
            emit('show')
        }
    }

    // Automatically start upload when component mounts
    onMounted(() => {
        uploadFile()

        console.log(props.fileInfo?.fileSize)
    })

    // Clean up timer when component is unmounted
    onUnmounted(() => {
        cancelAutoClose()
    })
</script>

<template>
    <div>
        <!-- Title -->
        <div class="mb-5 flex items-center gap-4">
            <template v-if="uploadStatus === 'pending'">
                <div class="box-shadow bg-primary-blue flex size-8 items-center justify-center rounded-lg">
                    <svg
                        class="size-5"
                        viewBox="0 0 28 28"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M23.918 11.8883H20.5463C17.7813 11.8883 15.5296 9.63665 15.5296 6.87165V3.49998C15.5296 2.85831 15.0046 2.33331 14.363 2.33331H9.4163C5.82297 2.33331 2.91797 4.66665 2.91797 8.83165V19.1683C2.91797 23.3333 5.82297 25.6666 9.4163 25.6666H18.5863C22.1796 25.6666 25.0846 23.3333 25.0846 19.1683V13.055C25.0846 12.4133 24.5596 11.8883 23.918 11.8883ZM13.453 15.785C13.278 15.96 13.0563 16.0416 12.8346 16.0416C12.613 16.0416 12.3913 15.96 12.2163 15.785L11.3763 14.945V19.8333C11.3763 20.3116 10.9796 20.7083 10.5013 20.7083C10.023 20.7083 9.6263 20.3116 9.6263 19.8333V14.945L8.7863 15.785C8.44797 16.1233 7.88797 16.1233 7.54964 15.785C7.2113 15.4466 7.2113 14.8866 7.54964 14.5483L9.88297 12.215C9.96464 12.145 10.0463 12.0866 10.1396 12.04C10.163 12.0283 10.198 12.0166 10.2213 12.005C10.2913 11.9816 10.3613 11.97 10.443 11.9583C10.478 11.9583 10.5013 11.9583 10.5363 11.9583C10.6296 11.9583 10.723 11.9816 10.8163 12.0166C10.828 12.0166 10.828 12.0166 10.8396 12.0166C10.933 12.0516 11.0263 12.1216 11.0963 12.1916C11.108 12.2033 11.1196 12.2033 11.1196 12.215L13.453 14.5483C13.7913 14.8866 13.7913 15.4466 13.453 15.785Z"
                            fill="white" />
                        <path
                            d="M20.3333 10.2783C21.4417 10.29 22.9817 10.29 24.3 10.29C24.965 10.29 25.315 9.50835 24.8483 9.04168C23.1683 7.35001 20.1583 4.30501 18.4317 2.57835C17.9533 2.10001 17.125 2.42668 17.125 3.09168V7.16334C17.125 8.86668 18.5717 10.2783 20.3333 10.2783Z"
                            fill="white" />
                    </svg>
                </div>
                <h2 class="font-bold">Uploading</h2>
            </template>
            <template v-if="uploadStatus === 'error'">
                <div class="error-shadow flex size-8 items-center justify-center rounded-lg bg-[#D73A3A]">
                    <svg
                        class="size-5"
                        viewBox="0 0 28 28"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M16.742 2.33325H11.2587C10.0454 2.33325 9.05371 3.31325 9.05371 4.52659V5.62325C9.05371 6.83659 10.0337 7.81659 11.247 7.81659H16.742C17.9554 7.81659 18.9354 6.83659 18.9354 5.62325V4.52659C18.947 3.31325 17.9554 2.33325 16.742 2.33325Z"
                            fill="white" />
                        <path
                            d="M20.1129 5.62331C20.1129 7.47831 18.5962 8.99498 16.7412 8.99498H11.2579C9.40289 8.99498 7.88622 7.47831 7.88622 5.62331C7.88622 4.96998 7.18622 4.56164 6.60289 4.86498C4.95789 5.73998 3.83789 7.47831 3.83789 9.47331V20.4516C3.83789 23.3216 6.18289 25.6666 9.05289 25.6666H18.9462C21.8162 25.6666 24.1612 23.3216 24.1612 20.4516V9.47331C24.1612 7.47831 23.0412 5.73998 21.3962 4.86498C20.8129 4.56164 20.1129 4.96998 20.1129 5.62331ZM16.9512 19.4716C16.7762 19.6466 16.5546 19.7283 16.3329 19.7283C16.1112 19.7283 15.8896 19.6466 15.7146 19.4716L14.0229 17.78L12.2846 19.5183C12.1096 19.6933 11.8879 19.775 11.6662 19.775C11.4446 19.775 11.2229 19.6933 11.0479 19.5183C10.7096 19.18 10.7096 18.62 11.0479 18.2816L12.7862 16.5433L11.0946 14.8516C10.7562 14.5133 10.7562 13.9533 11.0946 13.615C11.4329 13.2766 11.9929 13.2766 12.3312 13.615L14.0229 15.3066L15.6562 13.6733C15.9946 13.335 16.5546 13.335 16.8929 13.6733C17.2312 14.0116 17.2312 14.5716 16.8929 14.91L15.2596 16.5433L16.9512 18.235C17.2896 18.5733 17.2896 19.1216 16.9512 19.4716Z"
                            fill="white" />
                    </svg>
                </div>
                <h2 class="font-bold">Upload Failed</h2>
            </template>
            <template v-if="uploadStatus === 'success'">
                <div class="box-shadow bg-primary-blue flex size-8 items-center justify-center rounded-lg">
                    <svg
                        class="size-5"
                        viewBox="0 0 28 28"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M18.4331 2.57841C17.9548 2.10007 17.1265 2.42674 17.1265 3.09174V7.16341C17.1265 8.86674 18.5731 10.2784 20.3348 10.2784C21.4431 10.2901 22.9831 10.2901 24.3015 10.2901C24.9665 10.2901 25.3165 9.50841 24.8498 9.04174C23.1698 7.35007 20.1598 4.30507 18.4331 2.57841Z"
                            fill="white" />
                        <path
                            d="M17.2198 22.47C14.4782 22.6683 14.4782 26.635 17.2198 26.8333H23.7065C24.4882 26.8333 25.2582 26.5416 25.8298 26.0166C27.7548 24.3366 26.7282 20.9766 24.1965 20.6616C23.2865 15.19 15.3765 17.2666 17.2432 22.4816"
                            fill="white" />
                        <path
                            d="M25.0832 13.0549V16.8466C25.0832 17.1966 24.5698 17.3599 24.3132 17.1149C23.7532 16.5666 23.0648 16.1466 22.2715 15.9016C20.3115 15.2949 18.0365 15.8899 16.6248 17.3833C15.6798 18.3633 15.2015 19.6116 15.2132 20.9649C15.2132 21.1866 15.1082 21.3849 14.9332 21.5133C13.9998 22.2249 13.4165 23.3449 13.4165 24.6399C13.4165 24.7333 13.4165 24.8266 13.4282 24.9199C13.4515 25.2933 13.1832 25.6549 12.7982 25.6549H9.41484C5.8215 25.6549 2.9165 23.3216 2.9165 19.1566V8.83159C2.9165 4.66659 5.8215 2.33325 9.41484 2.33325H14.3615C15.0032 2.33325 15.5282 2.85825 15.5282 3.49992V6.87158C15.5282 9.64825 17.7682 11.8883 20.5448 11.8883H23.9165C24.5582 11.8883 25.0832 12.4133 25.0832 13.0549Z"
                            fill="white" />
                    </svg>
                </div>
                <h2 class="font-bold">Upload Completed</h2>
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

                <button @click="$emit('close')">
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

        <!-- Progress -->
        <template v-if="uploadStatus === 'pending' || uploadStatus === 'error'">
            <div class="flex items-end justify-between">
                <p class="text-xs text-slate-500">{{ fileInfo.fileSize }}</p>
                <p
                    v-if="uploadStatus === 'pending'"
                    class="text-sm font-semibold">
                    {{ `${uploadProgress}%` }}
                </p>
                <button
                    @click="uploadFile"
                    v-else
                    class="group relative">
                    <svg
                        class="size-8"
                        viewBox="0 0 47 45"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            opacity="0.4"
                            d="M31.3658 3.75H15.15C8.07862 3.75 3.87451 7.81875 3.87451 14.6438V30.3375C3.87451 37.1625 8.0786 41.2313 15.1306 41.2313H31.3464C38.3984 41.2313 42.6026 37.1625 42.6026 30.3375V14.6438C42.6219 7.81875 38.4178 3.75 31.3658 3.75Z"
                            fill="#2178FF" />
                        <path
                            d="M32.5089 17.0062C32.0633 16.3499 31.1528 16.1812 30.4941 16.6124C29.8353 17.0437 29.6416 17.9249 30.0872 18.5624C30.9978 19.8749 31.4627 21.4124 31.4627 22.9874C31.4627 27.3749 27.7624 30.9562 23.2289 30.9562C18.6955 30.9562 14.9951 27.3749 14.9951 22.9874C14.9951 18.5999 18.6955 15.0187 23.2289 15.0187C23.597 15.0187 23.9457 15.0562 24.3138 15.0937L23.2483 15.8624C22.6089 16.3124 22.4539 17.1937 22.9383 17.8312C23.2289 18.2062 23.6745 18.4124 24.1201 18.4124C24.4107 18.4124 24.7207 18.3187 24.9725 18.1499L28.731 15.4874C28.7504 15.4687 28.7504 15.4499 28.7698 15.4499C28.7892 15.4312 28.8085 15.4312 28.8279 15.4124C28.886 15.3562 28.9248 15.2999 28.9635 15.2437C29.0216 15.1687 29.0991 15.1124 29.1379 15.0187C29.1766 14.9437 29.196 14.8499 29.2347 14.7749C29.2541 14.6812 29.2929 14.6062 29.3123 14.5124C29.3316 14.4187 29.3122 14.3437 29.2929 14.2499C29.2929 14.1562 29.2929 14.0812 29.2541 13.9874C29.2348 13.8937 29.1766 13.8187 29.1379 13.7249C29.0991 13.6687 29.0991 13.5937 29.041 13.5187C29.0217 13.4999 29.0023 13.4999 29.0023 13.4812C28.9829 13.4624 28.9829 13.4437 28.9635 13.4249L25.7281 9.84368C25.205 9.26243 24.2751 9.18743 23.6745 9.71243C23.0739 10.2187 23.0158 11.1187 23.5389 11.6999L24.0813 12.2999C23.8101 12.2812 23.5389 12.2437 23.2483 12.2437C17.1068 12.2437 12.1084 17.0812 12.1084 23.0249C12.1084 28.9687 17.1068 33.8062 23.2483 33.8062C29.3897 33.8062 34.3882 28.9687 34.3882 23.0249C34.3882 20.8499 33.7488 18.7874 32.5089 17.0062Z"
                            fill="#2178FF" />
                    </svg>

                    <div class="absolute top-full -left-2 z-10 mt-1.5 hidden w-max group-hover:block">
                        <div class="relative rounded-md bg-[#1e2530] px-3 py-1.5 text-xs text-white">
                            Retry
                            <!-- Arrow -->
                            <div
                                class="absolute -top-1.5 left-1/2 h-0 w-0 -translate-x-1/2 border-r-8 border-b-8 border-l-8 border-r-transparent border-b-[#1e2530] border-l-transparent"></div>
                        </div>
                    </div>
                </button>
            </div>
            <div class="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                    v-if="uploadStatus === 'pending'"
                    :style="{ width: `${uploadProgress}%` }"
                    class="let-0 absolute inset-y-0 bg-linear-to-r from-blue-500 to-cyan-500 transition-all duration-150 ease-out"></div>
            </div>
            <p class="mt-2 text-right text-xs text-slate-400">
                {{ uploadStatus === 'pending' ? '12 Second Remaining' : 'Error 500  API not working' }}
            </p>
        </template>

        <template v-if="uploadStatus === 'success'">
            <div class="flex gap-2 pb-4">
                <div
                    class="flex-1 truncate rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-blue-500">
                    {{ link }}
                </div>
                <button
                    @click="copyToClipboard"
                    class="group relative flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-500 hover:bg-blue-200">
                    <svg
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M16 12.9V17.1C16 20.6 14.6 22 11.1 22H6.9C3.4 22 2 20.6 2 17.1V12.9C2 9.4 3.4 8 6.9 8H11.1C14.6 8 16 9.4 16 12.9Z"
                            stroke="#2178FF"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M22 6.9V11.1C22 14.6 20.6 16 17.1 16H16V12.9C16 9.4 14.6 8 11.1 8H8V6.9C8 3.4 9.4 2 12.9 2H17.1C20.6 2 22 3.4 22 6.9Z"
                            stroke="#2178FF"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>

                    <!-- Tooltip -->
                    <div class="absolute top-full mt-1.5 hidden w-max group-hover:block">
                        <div class="relative rounded-md bg-[#1e2530] px-3 py-1.5 text-xs text-white">
                            {{ tooltipText }}
                            <!-- Arrow -->
                            <div
                                class="absolute -top-1.5 left-1/2 h-0 w-0 -translate-x-1/2 border-r-8 border-b-8 border-l-8 border-r-transparent border-b-[#1e2530] border-l-transparent"></div>
                        </div>
                    </div>
                </button>
                <button
                    type="button"
                    @click="openLink"
                    class="group relative flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-500 hover:bg-blue-200">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="size-5"
                        viewBox="0 0 24 24"
                        fill="none">
                        <path
                            d="M13 10.9998L21.2 2.7998"
                            stroke="#2178ff"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M22 6.8V2H17.2"
                            stroke="#2178ff"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13"
                            stroke="#2178ff"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>

                    <div class="absolute top-full mt-1.5 hidden group-hover:block">
                        <div class="relative rounded-md bg-[#1e2530] px-3 py-1.5 text-xs text-white">
                            Open
                            <!-- Arrow -->
                            <div
                                class="absolute -top-1.5 left-1/2 h-0 w-0 -translate-x-1/2 border-r-8 border-b-8 border-l-8 border-r-transparent border-b-[#1e2530] border-l-transparent"></div>
                        </div>
                    </div>
                </button>
            </div>

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
        </template>
    </div>
</template>

<style scoped>
    .error-shadow {
        box-shadow: 0px 11px 35px 0px #d73a3a4a !important;
    }

    .box-shadow {
        box-shadow: 0px 11px 35px 0px #2178ff4a;
    }
</style>
