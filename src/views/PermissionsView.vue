<script setup>
    import { ref, onMounted } from 'vue'

    const permissions = ref([
        {
            id: 'camera',
            name: 'Camera',
            description: 'So viewers can see you',
            icon: 'camera',
            granted: false
        },
        {
            id: 'microphone',
            name: 'Microphone',
            description: 'So viewers can hear you',
            icon: 'microphone',
            granted: false
        },
        {
            id: 'accessibility',
            name: 'Accessibility',
            description: 'To record specific windows',
            icon: 'accessibility',
            granted: false
        },
        {
            id: 'screen',
            name: 'Screen Recording',
            description: 'To Share Your Screen',
            icon: 'screen',
            granted: false
        }
    ])

    const loading = ref(true)

    const checkPermissions = async () => {
        try {
            const statuses = await window.electron.checkSystemPermissions()
            // statuses: { camera: bool, microphone: bool, screen: bool, accessibility: bool }
            permissions.value.forEach((p) => {
                if (statuses[p.id] !== undefined) {
                    p.granted = statuses[p.id]
                }
            })
        } catch (e) {
            console.error('Failed to check permissions', e)
        } finally {
            loading.value = false
        }
    }

    const requestPermission = async (id) => {
        await window.electron.requestSystemPermission(id)
        // We can't always know immediately if it was granted (OS dialog), but we can try re-checking
        // often the user has to restart or toggle a setting.
        // For this UI, "Enable" usually opens System Preferences.
    }

    const relaunch = () => {
        window.electron.relaunchApp()
    }

    const quitApp = () => {
        window.electron.quitApp()
    }

    onMounted(() => {
        checkPermissions()
        // Poll for changes every few seconds in case user toggles them
        setInterval(checkPermissions, 2000)

        // Resize window to fit content
        // window.electron.resizeWindow('permissions', 450, 600)
    })
</script>

<template>
    <div
        class="dark:bg-dark-blue flex h-full w-full flex-col items-center justify-center bg-white p-6 text-slate-900 shadow-xl select-none dark:text-gray-200">
        <div class="mb-8 flex flex-col items-center">
            <img
                class="mb-4 size-16"
                src="@/assets/icons/icon.png"
                alt="premium member" />
            <h1 class="mb-2 text-2xl font-bold dark:text-white">
                Welcome To <span class="text-blue-500">Snaplark</span>
            </h1>
            <p class="text-sm text-slate-500 dark:text-gray-400">Enable all permissions to get started</p>
        </div>

        <div class="mb-8 w-full space-y-6">
            <div
                v-for="perm in permissions"
                :key="perm.id"
                class="dark:border-dark-700 dark:bg-dark-800 flex items-center justify-between rounded-full border border-slate-100 bg-white px-4 py-2.5">
                <div class="flex items-center space-x-4">
                    <div class="">
                        <svg
                            v-if="perm.icon === 'camera'"
                            width="28"
                            height="28"
                            viewBox="0 0 28 28"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M24.675 7.19842C24.1966 6.94175 23.1933 6.67341 21.8283 7.63008L20.1133 8.84341C19.985 5.21508 18.41 3.79175 14.5833 3.79175H7.58329C3.59329 3.79175 2.04163 5.34341 2.04163 9.33342V18.6667C2.04163 21.3501 3.49996 24.2084 7.58329 24.2084H14.5833C18.41 24.2084 19.985 22.7851 20.1133 19.1567L21.8283 20.3701C22.5516 20.8834 23.1816 21.0468 23.6833 21.0468C24.115 21.0468 24.4533 20.9184 24.675 20.8017C25.1533 20.5567 25.9583 19.8917 25.9583 18.2234V9.77675C25.9583 8.10842 25.1533 7.44341 24.675 7.19842ZM12.8333 13.2767C11.6316 13.2767 10.64 12.2967 10.64 11.0834C10.64 9.87008 11.6316 8.89008 12.8333 8.89008C14.035 8.89008 15.0266 9.87008 15.0266 11.0834C15.0266 12.2967 14.035 13.2767 12.8333 13.2767Z"
                                fill="#2178FF" />
                        </svg>

                        <svg
                            v-else-if="perm.icon === 'microphone'"
                            width="28"
                            height="28"
                            viewBox="0 0 28 28"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M22.3067 10.64C21.8517 10.64 21.49 11.0016 21.49 11.4566V13.3C21.49 17.43 18.13 20.79 14 20.79C9.87004 20.79 6.51004 17.43 6.51004 13.3V11.445C6.51004 10.99 6.14838 10.6283 5.69338 10.6283C5.23838 10.6283 4.87671 10.99 4.87671 11.445V13.2883C4.87671 18.0366 8.52838 21.945 13.1834 22.365V24.85C13.1834 25.305 13.545 25.6666 14 25.6666C14.455 25.6666 14.8167 25.305 14.8167 24.85V22.365C19.46 21.9566 23.1234 18.0366 23.1234 13.2883V11.445C23.1117 11.0016 22.75 10.64 22.3067 10.64Z"
                                fill="#2178FF" />
                            <path
                                d="M14.0001 2.33337C11.1534 2.33337 8.84338 4.64337 8.84338 7.49004V13.4634C8.84338 16.31 11.1534 18.62 14.0001 18.62C16.8467 18.62 19.1567 16.31 19.1567 13.4634V7.49004C19.1567 4.64337 16.8467 2.33337 14.0001 2.33337ZM15.5284 10.4417C15.4467 10.745 15.1784 10.9434 14.875 10.9434C14.8167 10.9434 14.7584 10.9317 14.7001 10.92C14.2451 10.7917 13.7667 10.7917 13.3117 10.92C12.9384 11.025 12.5767 10.8034 12.4834 10.4417C12.3784 10.08 12.6 9.70671 12.9617 9.61337C13.65 9.42671 14.3734 9.42671 15.0617 9.61337C15.4117 9.70671 15.6217 10.08 15.5284 10.4417ZM16.1467 8.17837C16.0417 8.45837 15.785 8.62171 15.505 8.62171C15.4234 8.62171 15.3534 8.61004 15.2717 8.58671C14.455 8.28337 13.545 8.28337 12.7284 8.58671C12.3784 8.71504 11.9817 8.52837 11.8534 8.17837C11.725 7.82837 11.9117 7.43171 12.2617 7.31504C13.3817 6.90671 14.6184 6.90671 15.7384 7.31504C16.0884 7.44337 16.275 7.82837 16.1467 8.17837Z"
                                fill="#2178FF" />
                        </svg>

                        <svg
                            v-else-if="perm.icon === 'accessibility'"
                            width="28"
                            height="28"
                            viewBox="0 0 28 28"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <mask
                                id="mask0_1054_2568"
                                style="mask-type: luminance"
                                maskUnits="userSpaceOnUse"
                                x="0"
                                y="0"
                                width="28"
                                height="28">
                                <path
                                    d="M28 0H0V28H28V0Z"
                                    fill="white" />
                            </mask>
                            <g mask="url(#mask0_1054_2568)">
                                <path
                                    d="M18.7483 24.8267C18.0833 24.64 17.6283 24.0567 17.6283 23.345C17.6283 22.6334 18.0716 22.05 18.7716 21.8517L19.8916 21.56C20.4866 21.385 20.9183 20.9534 21.0816 20.37L21.385 19.2617L21.455 19.0634C21.6766 18.48 22.2366 18.095 22.8783 18.095C23.5316 18.095 24.0566 18.4917 24.2783 19.075L24.64 20.3817C24.745 20.7667 24.99 21.0934 25.305 21.315C25.445 20.8367 25.5266 20.3467 25.5266 19.8334V8.16671C25.5266 4.95837 22.645 2.33337 19.1216 2.33337H8.85495C5.33162 2.33337 2.44995 4.95837 2.44995 8.16671V19.8334C2.44995 23.0534 5.31995 25.6667 8.85495 25.6667H19.11C19.6 25.6667 20.09 25.6084 20.545 25.515C20.3583 25.3517 20.1366 25.2234 19.88 25.1534L18.7483 24.8267ZM16.905 15.75C16.905 17.36 15.5983 18.6667 13.9883 18.6667H10.4883C8.87828 18.6667 7.57162 17.36 7.57162 15.75V12.25C7.57162 10.64 8.87828 9.33337 10.4883 9.33337H13.9883C15.5983 9.33337 16.905 10.64 16.905 12.25V12.8334L19.495 11.095C19.88 10.8384 20.405 11.1184 20.405 11.585V16.4034C20.405 16.87 19.88 17.15 19.495 16.8934L16.905 15.1667V15.75Z"
                                    fill="#2178FF" />
                                <path
                                    d="M26.9616 23.3683C26.9616 23.45 26.915 23.6367 26.6933 23.7067L25.55 24.0217C24.5583 24.29 23.8116 25.0367 23.5433 26.0283L23.24 27.1483C23.17 27.405 22.9716 27.4283 22.8783 27.4283C22.785 27.4283 22.5866 27.405 22.5166 27.1483L22.2133 26.0167C21.945 25.0367 21.1866 24.29 20.2066 24.0217L19.075 23.7183C18.83 23.6483 18.8066 23.4383 18.8066 23.3567C18.8066 23.2633 18.83 23.0533 19.075 22.9833L20.2183 22.68C21.1983 22.4 21.945 21.6533 22.2133 20.6733L22.54 19.4833C22.6216 19.285 22.8083 19.25 22.8783 19.25C22.9483 19.25 23.1466 19.2733 23.2166 19.46L23.5433 20.6617C23.8116 21.6417 24.57 22.3883 25.55 22.6683L26.7166 22.995C26.95 23.0883 26.9616 23.2983 26.9616 23.3683Z"
                                    fill="#2178FF" />
                            </g>
                        </svg>

                        <svg
                            v-else-if="perm.icon === 'screen'"
                            width="28"
                            height="28"
                            viewBox="0 0 28 28"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <mask
                                id="mask0_1054_2583"
                                style="mask-type: luminance"
                                maskUnits="userSpaceOnUse"
                                x="0"
                                y="0"
                                width="28"
                                height="28">
                                <path
                                    d="M28 0H0V28H28V0Z"
                                    fill="white" />
                            </mask>
                            <g mask="url(#mask0_1054_2583)">
                                <path
                                    d="M24.465 12.0983V15.82C24.465 18.5267 22.2717 20.72 19.565 20.72H15.4117C14.77 20.72 14.245 21.2333 14.245 21.8867V22.8433C14.245 23.485 14.77 24.01 15.4117 24.01H18.0484C18.5034 24.01 18.8767 24.3717 18.8767 24.8383C18.8767 25.2933 18.5034 25.6667 18.0484 25.6667H8.78504C8.33004 25.6667 7.95671 25.2933 7.95671 24.8383C7.95671 24.3717 8.33004 24.01 8.78504 24.01H11.4217C12.0634 24.01 12.5884 23.485 12.5884 22.8433V21.8867C12.5884 21.2333 12.0634 20.72 11.4217 20.72H7.22171C4.52671 20.72 2.33337 18.5267 2.33337 15.82V8.38833C2.33337 5.69333 4.52671 3.5 7.22171 3.5H12.25C12.8917 3.5 13.4167 4.025 13.4167 4.66667V7.175C13.4167 9.42667 14.9217 10.9317 17.1617 10.9317H23.2984C23.94 10.9317 24.465 11.4567 24.465 12.0983Z"
                                    fill="#2178FF" />
                                <path
                                    d="M25.6551 2.75289L24.3367 3.67456V3.18456C24.3367 2.07622 23.4384 1.18956 22.3417 1.18956H17.3484C16.1467 1.17789 15.1667 2.15789 15.1667 3.35956V7.18622C15.1667 8.18956 15.6684 9.18122 17.1617 9.18122H22.3301C23.4384 9.18122 24.3251 8.28289 24.3251 7.18622V6.68456L25.6434 7.60622C26.3084 8.06122 26.8334 7.78122 26.8334 6.98789V3.37122C26.8334 2.57789 26.3084 2.30956 25.6551 2.75289Z"
                                    fill="#2178FF" />
                            </g>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-base font-bold dark:text-gray-100">{{ perm.name }}</h3>
                        <p class="text-sm text-slate-500 dark:text-gray-300">{{ perm.description }}</p>
                    </div>
                </div>

                <button
                    @click="!perm.granted && requestPermission(perm.id)"
                    :class="[
                        'no-drag flex items-center justify-center space-x-1 rounded-full px-6 py-2 text-sm font-semibold transition-colors',
                        perm.granted
                            ? 'cursor-default bg-green-600 text-white'
                            : 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-600'
                    ]">
                    <span v-if="perm.granted">Done</span>
                    <svg
                        v-if="perm.granted"
                        class="ml-1 h-4 w-4"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M6 1.125C5.03582 1.125 4.09329 1.41091 3.2916 1.94659C2.48991 2.48226 1.86507 3.24363 1.49609 4.13442C1.12711 5.02521 1.03057 6.00541 1.21867 6.95107C1.40678 7.89672 1.87108 8.76537 2.55286 9.44715C3.23464 10.1289 4.10328 10.5932 5.04894 10.7813C5.99459 10.9694 6.97479 10.8729 7.86558 10.5039C8.75637 10.1349 9.51775 9.51009 10.0534 8.70841C10.5891 7.90672 10.875 6.96418 10.875 6C10.8736 4.70749 10.3596 3.46831 9.44564 2.55436C8.5317 1.64042 7.29251 1.12636 6 1.125ZM8.14032 5.14031L5.51532 7.76531C5.48049 7.80018 5.43913 7.82784 5.39361 7.84671C5.34808 7.86558 5.29928 7.8753 5.25 7.8753C5.20072 7.8753 5.15192 7.86558 5.1064 7.84671C5.06088 7.82784 5.01952 7.80018 4.98469 7.76531L3.85969 6.64031C3.78932 6.56995 3.74979 6.47451 3.74979 6.375C3.74979 6.27549 3.78932 6.18005 3.85969 6.10969C3.93005 6.03932 4.02549 5.99979 4.125 5.99979C4.22451 5.99979 4.31995 6.03932 4.39032 6.10969L5.25 6.96984L7.60969 4.60969C7.64453 4.57485 7.68589 4.54721 7.73142 4.52835C7.77694 4.5095 7.82573 4.49979 7.875 4.49979C7.92428 4.49979 7.97307 4.5095 8.01859 4.52835C8.06411 4.54721 8.10547 4.57485 8.14032 4.60969C8.17516 4.64453 8.20279 4.68589 8.22165 4.73141C8.24051 4.77694 8.25021 4.82573 8.25021 4.875C8.25021 4.92427 8.24051 4.97306 8.22165 5.01859C8.20279 5.06411 8.17516 5.10547 8.14032 5.14031Z"
                            fill="white" />
                    </svg>
                    <span v-else>Enable</span>
                </button>
            </div>
        </div>

        <div class="dark:border-dark-700 mt-auto flex w-full justify-center border-t border-slate-100 pt-6">
            <button
                @click="relaunch"
                class="no-drag flex cursor-pointer items-center space-x-1 text-sm font-medium">
                <span class="text-blue-500 underline hover:text-blue-600">Relaunch Snaplark</span>
                <span class="text-slate-500 dark:text-gray-400">after enabling permissions</span>
            </button>
        </div>
    </div>
</template>
