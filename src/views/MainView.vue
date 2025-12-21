<script setup>
    import { useWindows } from '@/composables/useWindows'
    import { onMounted, onUnmounted, ref } from 'vue'
    import router from '@/router'
    import { useStore } from '@/store'
    import { BASE_URL } from '@/api/config'
    import GradientFrame from '@/components/GradientFrame.vue'

    const { createWindow, hideWindow, resizeWindowTo } = useWindows()
    const store = useStore()

    const isUserMenuOpen = ref(false)

    const openSettings = async () => {
        isUserMenuOpen.value = false
        hideWindow('main')
        await createWindow('settings')
    }

    // Menu actions
    const takeScreenshot = async () => {
        await window.electron?.startScreenshotMode()
    }

    const recordVideo = async () => {
        await window.electron?.startVideoRecordingMode()
    }

    const openLastCapture = () => {
        if (store.lastCapture) {
            hideWindow('main')
            if (store.lastCapture.startsWith('http')) {
                store.openExternal(store.lastCapture)
            } else {
                window.electron.showItemInFolder(store.lastCapture)
            }
        }
    }

    const uploadMedia = async () => {
        await window.electronWindows.createWindow('welcome')
        await window.electronWindows.createWindow('permissions')
        // store.openExternal(BASE_URL + '/captures?showUploadModal=true')
        // hideWindow('main')
    }

    const viewUploadedHistory = () => {
        store.openExternal(BASE_URL + '/captures')
        isUserMenuOpen.value = false
        hideWindow('main')
    }

    const visitProfile = () => {
        store.openExternal(BASE_URL + '/account/settings')
        isUserMenuOpen.value = false
        hideWindow('main')
    }

    const showHelp = () => {
        store.openExternal(BASE_URL + '/help-center')
        isUserMenuOpen.value = false
        hideWindow('main')
    }

    const handleLogout = () => {
        store.logout()
        window.electronWindows?.hideWindow('main')
        setTimeout(() => {
            router.push('/login')
            window.electron.showMainAtTray({ force: true, gap: 0 })
        }, 100)
    }

    const quitApplication = () => {
        window.electron?.quitApp()
    }

    const toggleUserMenu = () => {
        isUserMenuOpen.value = !isUserMenuOpen.value
    }

    onMounted(async () => {
        if (!store.isLoggedIn) {
            window.electronWindows?.hideWindow('main')
            setTimeout(() => {
                router.push('/login')
                window.electron.showMainAtTray({ force: true, gap: 0 })
            }, 100)
        }
        await resizeWindowTo('main', 232, 550)
        console.log('Main window resized')
    })

    onUnmounted(() => {})
</script>

<template>
    <GradientFrame>
        <div class="main-container dark:bg-dark-blue flex h-full w-full flex-col rounded-2xl bg-white px-4 py-6">
            <!-- Capture Actions -->
            <div class="space-y-2">
                <div class="group relative">
                    <button
                        type="button"
                        @click="takeScreenshot"
                        class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                        <svg
                            width="28"
                            height="25"
                            viewBox="0 0 28 25"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <rect
                                x="4.73857"
                                y="0.876263"
                                width="22.3854"
                                height="22.3854"
                                stroke="#2178FF"
                                stroke-width="1.75253"
                                stroke-dasharray="10.52 10.52" />
                            <path
                                d="M10.7178 9.59332C12.3675 9.59358 13.7049 10.9309 13.7051 12.5806C13.7051 13.2013 14.2084 13.7047 14.8291 13.7047H15.5176C16.0303 13.7047 16.4463 14.1206 16.4463 14.6334V22.5601C16.4463 23.7245 15.5022 24.6683 14.3379 24.6685H2.1084C0.943956 24.6685 0 23.7246 0 22.5601V14.6334C0 14.1206 0.415969 13.7047 0.928711 13.7047H1.61719C2.23785 13.7047 2.74121 13.2013 2.74121 12.5806C2.74142 10.9308 4.07867 9.59341 5.72852 9.59332H10.7178ZM8.22168 15.0757C6.70802 15.0759 5.48145 16.3033 5.48145 17.817C5.4817 19.3304 6.70818 20.557 8.22168 20.5572C9.73533 20.5572 10.9626 19.3305 10.9629 17.817C10.9629 16.3031 9.73549 15.0757 8.22168 15.0757Z"
                                fill="#2178FF" />
                        </svg>
                        <p class="text-gray-black dark:group-hover:text-primary-blue text-sm font-bold dark:text-white">
                            Take Screenshot
                        </p>
                    </button>

                    <span
                        class="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {{ store.settings.hotkeyScreenshot }}
                    </span>
                </div>

                <div class="group relative">
                    <button
                        type="button"
                        @click="recordVideo()"
                        class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                        <svg
                            width="29"
                            height="30"
                            viewBox="0 0 29 30"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M25.5559 8.12425C25.0605 7.85842 24.0213 7.5805 22.6076 8.57133L20.8313 9.828C20.6984 6.07008 19.0672 4.59592 15.1038 4.59592H7.85384C3.72134 4.59592 2.11426 6.203 2.11426 10.3355V20.0022C2.11426 22.7813 3.62467 25.7417 7.85384 25.7417H15.1038C19.0672 25.7417 20.6984 24.2676 20.8313 20.5097L22.6076 21.7663C23.3568 22.298 24.0093 22.4672 24.5288 22.4672C24.9759 22.4672 25.3263 22.3342 25.5559 22.2134C26.0513 21.9597 26.8851 21.2709 26.8851 19.543V10.7947C26.8851 9.06675 26.0513 8.378 25.5559 8.12425ZM13.2913 14.4197C12.0468 14.4197 11.0197 13.4047 11.0197 12.148C11.0197 10.8913 12.0468 9.87633 13.2913 9.87633C14.5359 9.87633 15.563 10.8913 15.563 12.148C15.563 13.4047 14.5359 14.4197 13.2913 14.4197Z"
                                fill="#2178FF" />
                        </svg>

                        <p class="text-gray-black dark:group-hover:text-primary-blue text-sm font-bold dark:text-white">
                            Record Video
                        </p>
                    </button>

                    <span
                        class="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {{ store.settings.hotkeyRecording }}
                    </span>
                </div>

                <!-- <div class="group relative">
                    <button
                        type="button"
                        @click="recordGIF"
                        class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                        <svg
                            width="29"
                            height="30"
                            viewBox="0 0 29 30"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M14.4642 3.08548C7.79419 3.08548 2.38086 8.49881 2.38086 15.1688C2.38086 21.8388 7.79419 27.2521 14.4642 27.2521C21.1342 27.2521 26.5475 21.8388 26.5475 15.1688C26.5475 8.49881 21.1463 3.08548 14.4642 3.08548ZM14.5004 20.2801C11.6729 20.2801 9.38919 17.9963 9.38919 15.1688C9.38919 12.3413 11.6729 10.0576 14.5004 10.0576C17.3279 10.0576 19.6117 12.3413 19.6117 15.1688C19.6117 17.9963 17.3279 20.2801 14.5004 20.2801Z"
                                fill="#2178FF" />
                        </svg>

                        <p class="text-gray-black dark:group-hover:text-primary-blue text-sm font-bold dark:text-white">
                            Record GIF
                        </p>
                    </button>
                    <span
                        class="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {{ store.settings.hotkeyRecording }}
                    </span>
                </div> -->
            </div>

            <hr class="dark:border-dark-700 my-3 border-gray-400" />

            <!-- Media Actions -->
            <div class="space-y-2">
                <div class="group relative">
                    <button
                        :disabled="!store.lastCapture"
                        type="button"
                        @click="openLastCapture"
                        :class="{ 'opacity-50': !store.lastCapture }"
                        class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                        <svg
                            width="29"
                            height="29"
                            viewBox="0 0 29 29"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M2.41699 9.13501H4.84574H7.78199"
                                fill="#2178FF" />
                            <path
                                d="M17.5816 26.1846C22.7653 24.8192 26.5837 20.1067 26.5837 14.5C26.5837 7.83001 21.2187 2.41667 14.5003 2.41667C6.44074 2.41667 2.41699 9.13501 2.41699 9.13501M2.41699 9.13501V3.62501M2.41699 9.13501H4.84574H7.78199"
                                stroke="#2178FF"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                            <path
                                d="M2.41699 14.5C2.41699 21.17 7.83033 26.5833 14.5003 26.5833"
                                stroke="#2178FF"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-dasharray="3 3" />
                            <path
                                d="M20.0093 16.41L18.4443 12.75C18.1593 12.08 17.7343 11.7 17.2493 11.675C16.7693 11.65 16.3043 11.985 15.9493 12.625L14.9993 14.33C14.7993 14.69 14.5143 14.905 14.2043 14.93C13.8893 14.96 13.5743 14.795 13.3193 14.47L13.2093 14.33C12.8543 13.885 12.4143 13.67 11.9643 13.715C11.5143 13.76 11.1293 14.07 10.8743 14.575L10.0093 16.3C9.69934 16.925 9.72934 17.65 10.0943 18.24C10.4593 18.83 11.0943 19.185 11.7893 19.185H18.1693C18.8393 19.185 19.4643 18.85 19.8343 18.29C20.2143 17.73 20.2743 17.025 20.0093 16.41Z"
                                fill="#2178FF" />
                            <path
                                d="M12.4849 12.19C13.4183 12.19 14.1749 11.4334 14.1749 10.5C14.1749 9.56664 13.4183 8.81 12.4849 8.81C11.5516 8.81 10.7949 9.56664 10.7949 10.5C10.7949 11.4334 11.5516 12.19 12.4849 12.19Z"
                                fill="#2178FF" />
                        </svg>

                        <p class="text-gray-black dark:group-hover:text-primary-blue text-sm dark:text-white">
                            Last Capture
                        </p>
                    </button>
                    <span
                        class="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {{ store.lastCapture ? 'Open last uploaded capture' : 'No capture uploaded yet' }}
                    </span>
                </div>

                <button
                    type="button"
                    @click="uploadMedia"
                    class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                    <svg
                        width="29"
                        height="29"
                        viewBox="0 0 29 29"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M26.2695 15.5996C25.9553 14.5604 25.4357 13.6542 24.747 12.9171C23.8649 11.9142 22.6928 11.2254 21.3757 10.9233C20.7112 7.9025 18.8503 5.7275 16.2041 4.91792C13.3282 4.02375 9.99324 4.89375 7.90283 7.08083C6.06616 9.00208 5.46199 11.6483 6.17491 14.4637C3.75824 15.0558 2.56199 17.0737 2.42908 18.995C2.41699 19.1279 2.41699 19.2487 2.41699 19.3696C2.41699 21.6413 3.90324 24.1908 7.21408 24.4325H19.7566C21.4724 24.4325 23.1157 23.7921 24.3724 22.6442C26.342 20.9162 27.067 18.2217 26.2695 15.5996Z"
                            fill="#2178FF" />
                        <path
                            d="M14.5 19.75L14.5 11.7"
                            stroke="white"
                            stroke-width="1.0625"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M12.4062 13.0937L14.5 11L16.5938 13.0938"
                            stroke="white"
                            stroke-width="1.0625"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>

                    <p class="text-gray-black dark:group-hover:text-primary-blue text-sm dark:text-white">
                        Upload Image(s)
                    </p>
                </button>

                <button
                    type="button"
                    @click="viewUploadedHistory"
                    class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                    <svg
                        width="29"
                        height="29"
                        viewBox="0 0 29 29"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M20.5875 15.0687C20.425 14.5312 20.1562 14.0625 19.8 13.6812C19.3438 13.1625 18.7375 12.8062 18.0563 12.65C17.7125 11.0875 16.75 9.9625 15.3812 9.54375C13.8937 9.08125 12.1688 9.53125 11.0875 10.6625C10.1375 11.6562 9.825 13.025 10.1938 14.4812C8.94375 14.7875 8.325 15.8312 8.25625 16.825C8.25 16.8937 8.25 16.9562 8.25 17.0187C8.25 18.1937 9.01875 19.5125 10.7312 19.6375H17.2188C18.1062 19.6375 18.9563 19.3062 19.6062 18.7125C20.625 17.8187 21 16.425 20.5875 15.0687Z"
                            fill="#2178FF" />
                        <path
                            d="M14.5 17.2158L14.5 13.052"
                            stroke="white"
                            stroke-width="0.549569"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M13.4161 13.7729L14.4991 12.6899L15.582 13.7729"
                            stroke="white"
                            stroke-width="0.549569"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M2.41699 9.13501H4.84574H7.78199"
                            fill="#2178FF" />
                        <path
                            d="M17.5816 26.1846C22.7653 24.8192 26.5837 20.1067 26.5837 14.5C26.5837 7.83001 21.2187 2.41667 14.5003 2.41667C6.44074 2.41667 2.41699 9.13501 2.41699 9.13501M2.41699 9.13501V3.62501M2.41699 9.13501H4.84574H7.78199"
                            stroke="#2178FF"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round" />
                        <path
                            d="M2.41699 14.5C2.41699 21.17 7.83033 26.5833 14.5003 26.5833"
                            stroke="#2178FF"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-dasharray="3 3" />
                    </svg>

                    <p class="text-gray-black dark:group-hover:text-primary-blue text-sm dark:text-white">
                        Uploaded History
                    </p>
                </button>
            </div>

            <hr class="dark:border-dark-700 my-3 border-gray-400" />

            <!-- App Actions -->
            <div class="space-y-4">
                <div class="group relative">
                    <button
                        type="button"
                        @click="quitApplication"
                        class="dark:hover:bg-dark-800 group flex w-full items-center gap-6 rounded-lg px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-gray-200/10 dark:text-gray-200">
                        <svg
                            width="29"
                            height="29"
                            viewBox="0 0 29 29"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M14.5003 2.41667C7.84241 2.41667 2.41699 7.84208 2.41699 14.5C2.41699 21.1579 7.84241 26.5833 14.5003 26.5833C21.1582 26.5833 26.5837 21.1579 26.5837 14.5C26.5837 7.84208 21.1582 2.41667 14.5003 2.41667ZM18.5603 17.2792C18.9107 17.6296 18.9107 18.2096 18.5603 18.56C18.3791 18.7413 18.1495 18.8258 17.9199 18.8258C17.6903 18.8258 17.4607 18.7413 17.2795 18.56L14.5003 15.7808L11.7212 18.56C11.5399 18.7413 11.3103 18.8258 11.0807 18.8258C10.8512 18.8258 10.6216 18.7413 10.4403 18.56C10.0899 18.2096 10.0899 17.6296 10.4403 17.2792L13.2195 14.5L10.4403 11.7208C10.0899 11.3704 10.0899 10.7904 10.4403 10.44C10.7907 10.0896 11.3707 10.0896 11.7212 10.44L14.5003 13.2192L17.2795 10.44C17.6299 10.0896 18.2099 10.0896 18.5603 10.44C18.9107 10.7904 18.9107 11.3704 18.5603 11.7208L15.7812 14.5L18.5603 17.2792Z"
                                fill="#2178FF" />
                        </svg>

                        <p class="text-gray-black dark:group-hover:text-primary-blue text-sm dark:text-white">
                            {{ store.getOs() === 'darwin' ? 'Quit' : 'Close' }}
                        </p>
                    </button>
                    <span
                        class="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {{ store.getOs() === 'darwin' ? 'Quit' : 'Close' }}
                        ({{ store.getOs() === 'darwin' ? 'Cmd' : 'Ctrl' }} + Q)
                    </span>
                </div>
                <!-- User Profile -->
                <div class="relative flex items-center gap-3 rounded-2xl px-2.5 py-1.5">
                    <img
                        class="ring-primary-blue h-10 w-10 cursor-pointer rounded-full object-cover shadow-lg ring-2"
                        @click="visitProfile"
                        :src="store.user?.profile_photo_url"
                        alt="User avatar" />

                    <div
                        class="flex-1 cursor-pointer"
                        @click="visitProfile">
                        <p class="text-sm font-semibold text-gray-800 dark:text-white">
                            {{ store.user?.name || 'Jade Warren' }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            {{ store.user?.is_premium ? 'Premium' : 'Free' }}
                        </p>
                    </div>

                    <button
                        @click="toggleUserMenu"
                        class="rounded-lg px-4 py-2 text-gray-500 hover:bg-gray-200/10 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <svg
                            width="5"
                            height="23"
                            viewBox="0 0 5 23"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <circle
                                cx="2.5"
                                cy="2.5"
                                r="2.5"
                                fill="#2178FF" />
                            <circle
                                cx="2.5"
                                cy="11.5"
                                r="2.5"
                                fill="#2178FF" />
                            <circle
                                cx="2.5"
                                cy="20.5"
                                r="2.5"
                                fill="#2178FF" />
                        </svg>
                    </button>

                    <!-- User Menu -->
                    <div
                        v-if="isUserMenuOpen"
                        class="dark:bg-dark-800 absolute right-0 bottom-12 z-10 w-48 rounded-lg bg-gray-100 py-2 shadow-2xl">
                        <a
                            @click="showHelp"
                            href="#"
                            class="dark:hover:bg-dark-700 dark:group-hover:text-primary-blue flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200/10 dark:text-white">
                            <svg
                                width="29"
                                height="29"
                                viewBox="0 0 29 29"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M20.542 2.93625H8.45866C4.83366 2.93625 2.41699 5.35292 2.41699 8.97792V16.2279C2.41699 19.8529 4.83366 22.2696 8.45866 22.2696V24.8433C8.45866 25.81 9.53408 26.39 10.3316 25.8462L15.7087 22.2696H20.542C24.167 22.2696 26.5837 19.8529 26.5837 16.2279V8.97792C26.5837 5.35292 24.167 2.93625 20.542 2.93625ZM14.5003 17.6417C13.9928 17.6417 13.5941 17.2308 13.5941 16.7354C13.5941 16.24 13.9928 15.8292 14.5003 15.8292C15.0078 15.8292 15.4066 16.24 15.4066 16.7354C15.4066 17.2308 15.0078 17.6417 14.5003 17.6417ZM16.0228 12.6271C15.5516 12.9412 15.4066 13.1467 15.4066 13.485V13.7387C15.4066 14.2342 14.9957 14.645 14.5003 14.645C14.0049 14.645 13.5941 14.2342 13.5941 13.7387V13.485C13.5941 12.0833 14.6212 11.3946 15.0078 11.1287C15.4549 10.8267 15.5999 10.6212 15.5999 10.3071C15.5999 9.70291 15.1045 9.2075 14.5003 9.2075C13.8962 9.2075 13.4007 9.70291 13.4007 10.3071C13.4007 10.8025 12.9899 11.2133 12.4945 11.2133C11.9991 11.2133 11.5882 10.8025 11.5882 10.3071C11.5882 8.7 12.8932 7.395 14.5003 7.395C16.1074 7.395 17.4124 8.7 17.4124 10.3071C17.4124 11.6846 16.3974 12.3733 16.0228 12.6271Z"
                                    fill="#2178FF" />
                            </svg>

                            <span>Help</span>
                        </a>
                        <button
                            @click="openSettings"
                            type="button"
                            class="dark:hover:bg-dark-700 dark:group-hover:text-primary-blue flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200/10 dark:text-white">
                            <svg
                                width="29"
                                height="29"
                                viewBox="0 0 29 29"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M24.2878 11.1408C22.1007 11.1408 21.2066 9.59417 22.2941 7.69709C22.9224 6.5975 22.5478 5.19584 21.4482 4.5675L19.3578 3.37125C18.4032 2.80334 17.1707 3.14167 16.6028 4.09625L16.4699 4.32584C15.3824 6.22292 13.5941 6.22292 12.4945 4.32584L12.3616 4.09625C11.8178 3.14167 10.5853 2.80334 9.63074 3.37125L7.54033 4.5675C6.44074 5.19584 6.06616 6.60959 6.69449 7.70917C7.79408 9.59417 6.89991 11.1408 4.71283 11.1408C3.45616 11.1408 2.41699 12.1679 2.41699 13.4367V15.5633C2.41699 16.82 3.44408 17.8592 4.71283 17.8592C6.89991 17.8592 7.79408 19.4058 6.69449 21.3029C6.06616 22.4025 6.44074 23.8042 7.54033 24.4325L9.63074 25.6288C10.5853 26.1967 11.8178 25.8583 12.3857 24.9038L12.5187 24.6742C13.6062 22.7771 15.3945 22.7771 16.4941 24.6742L16.627 24.9038C17.1949 25.8583 18.4274 26.1967 19.382 25.6288L21.4724 24.4325C22.572 23.8042 22.9466 22.3904 22.3182 21.3029C21.2187 19.4058 22.1128 17.8592 24.2999 17.8592C25.5566 17.8592 26.5957 16.8321 26.5957 15.5633V13.4367C26.5837 12.18 25.5566 11.1408 24.2878 11.1408ZM14.5003 18.4271C12.3374 18.4271 10.5732 16.6629 10.5732 14.5C10.5732 12.3371 12.3374 10.5729 14.5003 10.5729C16.6632 10.5729 18.4274 12.3371 18.4274 14.5C18.4274 16.6629 16.6632 18.4271 14.5003 18.4271Z"
                                    fill="#2178FF" />
                            </svg>

                            <span>Settings</span>
                        </button>

                        <hr class="dark:border-dark-700 my-2 border-gray-400" />
                        <a
                            @click="handleLogout"
                            href="#"
                            class="dark:hover:bg-dark-700 flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-gray-200/10">
                            <svg
                                width="29"
                                height="29"
                                viewBox="0 0 29 29"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M20.3 2.41666H17.1583C13.2917 2.41666 10.875 4.83332 10.875 8.69999V13.5937H16.24L13.7387 11.0925C13.5575 10.9112 13.4729 10.6817 13.4729 10.4521C13.4729 10.2225 13.5575 9.99291 13.7387 9.81166C14.0892 9.46124 14.6692 9.46124 15.0196 9.81166L19.0675 13.8596C19.4179 14.21 19.4179 14.79 19.0675 15.1404L15.0196 19.1883C14.6692 19.5387 14.0892 19.5387 13.7387 19.1883C13.3883 18.8379 13.3883 18.2579 13.7387 17.9075L16.24 15.4062H10.875V20.3C10.875 24.1667 13.2917 26.5833 17.1583 26.5833H20.2879C24.1546 26.5833 26.5713 24.1667 26.5713 20.3V8.69999C26.5833 4.83332 24.1667 2.41666 20.3 2.41666Z"
                                    fill="#E12626" />
                                <path
                                    d="M3.32324 13.5938C2.82783 13.5938 2.41699 14.0046 2.41699 14.5C2.41699 14.9954 2.82783 15.4063 3.32324 15.4063H10.8753V13.5938H3.32324Z"
                                    fill="#E12626" />
                            </svg>

                            <span>LogOut</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </GradientFrame>
</template>
