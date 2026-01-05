<script setup>
    import { ref, onMounted } from 'vue'
    import { useWindows } from '@/composables/useWindows'
    import { useStore } from '@/store'
    import SettingsSwitchItem from '@/components/SettingsSwitchItem.vue'
    import SettingsHotkeyItem from '@/components/SettingsHotkeyItem.vue'
    import Switch from '@/components/Switch.vue'
    import TitleBar from '@/components/TitleBar.vue'
    import { WINDOW_TITLES, WINDOW_DIMENSIONS } from '@/config/window-config'

    const { resizeWindowTo } = useWindows()
    const store = useStore()

    // Direct reference to store.settings (it's already reactive)
    const settings = store.settings

    const activeTab = ref('general')
    const contentRef = ref(null)
    const appVersion = ref('')

    const mainTabs = [
        { id: 'general', label: 'General', width: WINDOW_DIMENSIONS.settings.width, height: WINDOW_DIMENSIONS.settings.height },
        { id: 'hotkeys', label: 'Hotkeys', width: WINDOW_DIMENSIONS.settings.width, height: 670 },
        { id: 'capture', label: 'Capture', width: WINDOW_DIMENSIONS.settings.width, height: 540 }
    ]

    const browseSaveFolder = async () => {
        if (window.electron?.invoke) {
            const result = await window.electron.invoke('dialog:openDirectory')
            if (!result.canceled && result.filePaths.length > 0) {
                store.updateSetting('defaultSaveFolder', result.filePaths[0])
            }
        }
    }

    const changeTab = async (tab) => {
        await resizeWindowTo('settings', tab.width, tab.height)
        activeTab.value = tab.id
    }

    onMounted(async () => {
        if (window.electron?.getAppVersion) {
            appVersion.value = await window.electron.getAppVersion()
        }
    })
</script>

<template>
    <section
        ref="contentRef"
        class="dark:bg-dark-blue relative flex h-screen w-full flex-col bg-white text-slate-900 dark:text-gray-200">
        <!-- Custom Title Bar -->
        <TitleBar :title="WINDOW_TITLES.settings" />

        <div class="mb-2.5 space-y-0.5 px-4">
            <h1 class="text-xl font-semibold dark:text-white">Settings <span class="text-sm text-slate-500 dark:text-gray-400">(v{{ appVersion }})</span></h1>
            <p class="text-sm text-slate-500 dark:text-gray-400">Configure Snaplark to your preferences</p>
        </div>

        <nav
            v-if="mainTabs.length > 1"
            class="dark:bg-dark-800 mx-4 mb-2.5 flex space-x-1 rounded-xl bg-slate-100 p-1">
            <button
                v-for="tab in mainTabs"
                :key="tab.id"
                @click="changeTab(tab)"
                type="button"
                :class="[
                    'w-full cursor-pointer rounded-lg py-2 text-sm font-medium transition-all',
                    tab.id === activeTab
                        ? 'dark:bg-dark-700 bg-white text-blue-700 shadow dark:text-blue-400'
                        : 'dark:hover:bg-dark-700 text-slate-700 hover:bg-gray-50 hover:text-blue-600 dark:text-gray-400 dark:hover:text-gray-400'
                ]">
                {{ tab.label }}
            </button>
        </nav>

        <div class="custom-scrollbar flex-1 overflow-y-auto rounded-xl px-4 pb-2">
            <transition
                mode="out-in"
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0"
                enter-to-class="opacity-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0">
                <div
                    :key="activeTab"
                    class="space-y-2 pb-2">
                    <!-- GENERAL TAB -->
                    <template v-if="activeTab === 'general'">
                        <!-- Launch at Startup -->
                        <SettingsSwitchItem
                            title="Launch at Startup"
                            description="Start Snaplark when your system boots"
                            v-model="settings.launchAtStartup" />

                        <!-- Dark Mode -->
                        <SettingsSwitchItem
                            title="Dark Mode"
                            description="Enable dark theme for the application"
                            v-model="settings.darkMode" />

                        <!-- Open in Browser -->
                        <SettingsSwitchItem
                            title="Open in Browser"
                            description="Automatically open the uploaded capture link"
                            v-model="settings.openInBrowser" />

                        <!-- Language Selection -->
                        <!-- <div
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                            <label class="block">
                                <h3 class="text-sm font-medium dark:text-gray-100">Language</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    Choose your preferred language
                                </p>
                                <select
                                    v-model="settings.language"
                                    class="dark:border-dark-700 dark:bg-dark-900 mt-1.5 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none dark:text-gray-400">
                                    <option value="en">English</option>
                                    <option value="ru">Russian</option>
                                </select>
                            </label>
                        </div> -->

                        <!-- Save Location Behavior -->
                        <SettingsSwitchItem
                            title="Prompt for Save Location"
                            description="Ask where to save each screenshot"
                            v-model="settings.promptForSaveLocation" />

                        <!-- Default Save Folder -->
                        <div
                            v-if="!settings.promptForSaveLocation"
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <label class="block">
                                <h3 class="ttext-sm font-medium dark:text-gray-100">Default Save Folder</h3>
                                <p class="mt-1 text-sm font-medium text-slate-500 dark:text-gray-300">
                                    Where screenshots and recordings are saved
                                </p>
                                <div class="mt-3 flex gap-2">
                                    <input
                                        type="text"
                                        :value="settings.defaultSaveFolder"
                                        readonly
                                        class="dark:border-dark-700 dark:bg-dark-900 flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 dark:text-gray-300" />
                                    <button
                                        type="button"
                                        @click="browseSaveFolder"
                                        class="rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 transition hover:bg-blue-500/20 focus:ring-2 focus:ring-blue-500/30 focus:outline-none dark:text-blue-400">
                                        Browse
                                    </button>
                                </div>
                            </label>
                        </div>
                    </template>

                    <!-- HOTKEYS TAB -->
                    <template v-else-if="activeTab === 'hotkeys'">
                        <!-- QUICK MENU -->
                        <div class="mb-3 px-1">
                            <h3
                                class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-gray-500">
                                Quick Access
                            </h3>
                        </div>

                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                            <SettingsHotkeyItem
                                title="Quick Menu"
                                description="Open quick menu to access all features"
                                storeKey="hotkeyQuickMenu"
                                v-model="settings.hotkeyQuickMenu" />
                        </div>

                        <!-- SCREENSHOT -->
                        <div class="mt-5 mb-3 px-1">
                            <h3
                                class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-gray-500">
                                Screenshot
                            </h3>
                        </div>

                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-0 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                            <SettingsHotkeyItem
                                title="Capture Screen"
                                description="Open screenshot selection tool"
                                storeKey="hotkeyScreenshot"
                                v-model="settings.hotkeyScreenshot" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                title="Upload"
                                description="Upload screenshot to website"
                                storeKey="hotkeyUpload"
                                v-model="settings.hotkeyUpload" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                title="Copy"
                                description="Copy screenshot to clipboard"
                                storeKey="hotkeyCopy"
                                v-model="settings.hotkeyCopy" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                title="Save"
                                description="Save screenshot to file"
                                storeKey="hotkeySave"
                                v-model="settings.hotkeySave" />
                        </div>

                        <!-- VIDEO RECORDING -->
                        <div class="mt-5 mb-3 px-1">
                            <h3
                                class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-gray-500">
                                Video Recording
                            </h3>
                        </div>

                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-0 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                            <SettingsHotkeyItem
                                title="Select Recording Area"
                                description="Open screen area selection for recording"
                                storeKey="hotkeyRecording"
                                v-model="settings.hotkeyRecording" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                title="Start/Stop Recording"
                                description="Toggle recording on/off"
                                storeKey="hotkeyStartStopRecording"
                                v-model="settings.hotkeyStartStopRecording" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                title="Toggle Microphone"
                                description="Mute or unmute microphone"
                                storeKey="hotkeyToggleMicrophone"
                                v-model="settings.hotkeyToggleMicrophone" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                title="Toggle Webcam"
                                description="Enable or disable webcam"
                                storeKey="hotkeyToggleWebcam"
                                v-model="settings.hotkeyToggleWebcam" />
                        </div>
                    </template>

                    <!-- CAPTURE TAB -->
                    <template v-else-if="activeTab === 'capture'">
                        <!-- Crop Tools -->
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                            <div>
                                <h3 class="text-sm font-medium dark:text-gray-100">Crop Screen Tools</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    Enable additional capture tools
                                </p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm text-slate-700 dark:text-gray-100">Show Magnifier</label>
                                <Switch
                                    v-model="settings.showMagnifier"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm text-slate-700 dark:text-gray-100">Show Crosshair</label>
                                <Switch
                                    v-model="settings.showCrosshair"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm text-slate-700 dark:text-gray-100">Show Cursor</label>
                                <Switch
                                    v-model="settings.showCursor"
                                    size="md" />
                            </div>
                        </div>

                        <!-- Recording  -->
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <div>
                                <h3 class="text-sm font-medium dark:text-gray-100">Recording</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    Enable additional capture tools
                                </p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm text-slate-700 dark:text-gray-100">Mirror Webcam</label>
                                <Switch
                                    v-model="settings.flipCamera"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm text-slate-700 dark:text-gray-100">3 Second Countdown</label>
                                <Switch
                                    v-model="settings.recordingCountdown"
                                    size="md" />
                            </div>
                        </div>
                    </template>
                </div>
            </transition>
        </div>
    </section>
</template>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: rgba(156, 163, 175, 0.5);
        border-radius: 20px;
        border: 2px solid transparent;
        background-clip: content-box;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background-color: rgba(156, 163, 175, 0.8);
    }
</style>
