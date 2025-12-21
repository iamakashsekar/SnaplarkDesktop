<script setup>
    import { ref, watch, onMounted } from 'vue'
    import { useWindows } from '@/composables/useWindows'
    import { useStore } from '@/store'
    import SettingsSwitchItem from '@/components/SettingsSwitchItem.vue'
    import Switch from '@/components/Switch.vue'

    const { resizeWindowTo } = useWindows()
    const store = useStore()

    // Direct reference to store.settings (it's already reactive)
    const settings = store.settings

    watch(
        () => settings.hotkeyScreenshot,
        (newValue) => {
            if (window.electron?.invoke) {
                window.electron.invoke('update-screenshot-shortcut', newValue)
            }
        }
    )

    watch(
        () => settings.hotkeyRecording,
        (newValue) => {
            if (window.electron?.invoke) {
                window.electron.invoke('update-recording-shortcut', newValue)
            }
        }
    )

    const activeTab = ref('general')
    const contentRef = ref(null)

    // Track which hotkey field is currently being recorded
    const recordingHotkey = ref(null)
    const previousHotkeyValue = ref({})

    const mainTabs = [
        { id: 'general', label: 'General', height: 750 },
        { id: 'hotkeys', label: 'Hotkeys', height: 440 },
        { id: 'capture', label: 'Capture', height: 680 }
    ]

    const browseSaveFolder = async () => {
        if (window.electron?.invoke) {
            const result = await window.electron.invoke('dialog:openDirectory')
            if (!result.canceled && result.filePaths.length > 0) {
                store.updateSetting('defaultSaveFolder', result.filePaths[0])
            }
        }
    }

    const startRecordingHotkey = (field) => {
        // Store the current value before clearing
        previousHotkeyValue.value[field] = settings[field] || ''
        recordingHotkey.value = field
        // Clear the value for visual feedback
        settings[field] = ''
    }

    const stopRecordingHotkey = () => {
        // Only restore if we're still recording and no new value was set
        if (recordingHotkey.value && previousHotkeyValue.value[recordingHotkey.value] !== undefined) {
            // Only restore if the field is still empty (no key was recorded)
            if (!settings[recordingHotkey.value] || settings[recordingHotkey.value] === '') {
                settings[recordingHotkey.value] = previousHotkeyValue.value[recordingHotkey.value]
            }
            delete previousHotkeyValue.value[recordingHotkey.value]
        }
        recordingHotkey.value = null
    }

    const recordHotkey = async (field, event) => {
        event.preventDefault()

        // Handle Escape key to cancel recording
        if (event.key === 'Escape') {
            // Restore previous value
            if (previousHotkeyValue.value[field] !== undefined) {
                settings[field] = previousHotkeyValue.value[field]
            }
            recordingHotkey.value = null
            delete previousHotkeyValue.value[field]
            return
        }

        const keys = []

        if (event.ctrlKey) keys.push('Ctrl')
        if (event.altKey) keys.push('Alt')
        if (event.shiftKey) keys.push('Shift')
        if (event.metaKey) keys.push('Cmd')

        const key = event.key.length === 1 ? event.key.toUpperCase() : event.key

        // Skip modifier keys themselves
        if (!['Control', 'Alt', 'Shift', 'Meta', 'Tab', 'Escape'].includes(event.key)) {
            keys.push(key)
        }

        // Only set if we have at least one modifier and a key, or if it's a valid single key combo
        if (keys.length > 0) {
            const hotkeyString = keys.join(' + ')
            await store.updateSetting(field, hotkeyString)
            // Clear recording state and previous value since we successfully recorded
            recordingHotkey.value = null
            delete previousHotkeyValue.value[field]
        }
    }

    const changeTab = async (tab) => {
        await resizeWindowTo('settings', 600, tab.height)
        activeTab.value = tab.id
    }

    onMounted(async () => {
        // Init window to the General tab height
        await resizeWindowTo('settings', 600, 700)
    })
</script>

<template>
    <section
        ref="contentRef"
        class="dark:bg-dark-blue relative flex h-screen w-full flex-col bg-white text-slate-900 dark:text-gray-200">
        <!-- Custom Title Bar -->
        <div class="drag flex h-14 w-full shrink-0 items-center justify-center bg-transparent">
            <span class="text-sm font-semibold text-slate-500/80 dark:text-gray-400">Snaplark - Settings</span>
        </div>

        <div class="no-drag mb-6 space-y-2 px-7">
            <h1 class="text-2xl font-bold dark:text-white">Settings</h1>
            <p class="text-sm text-slate-500 dark:text-gray-400">Configure Snaplark to your preferences</p>
        </div>

        <nav
            v-if="mainTabs.length > 1"
            class="no-drag dark:bg-dark-800 mx-7 mb-6 flex space-x-1 rounded-xl bg-slate-100 p-1">
            <button
                v-for="tab in mainTabs"
                :key="tab.id"
                @click="changeTab(tab)"
                type="button"
                :class="[
                    'w-full rounded-lg py-2.5 text-sm leading-5 font-medium transition-all',
                    tab.id === activeTab
                        ? 'dark:bg-dark-700 bg-white text-blue-700 shadow dark:text-blue-400'
                        : 'dark:hover:bg-dark-700 text-slate-700 hover:bg-gray-50 hover:text-blue-600 dark:text-gray-400 dark:hover:text-gray-400'
                ]">
                {{ tab.label }}
            </button>
        </nav>

        <div class="no-drag custom-scrollbar flex-1 overflow-y-auto rounded-xl px-7 pb-2">
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
                    class="space-y-4 pb-4">
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
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <label class="block">
                                <h3 class="text-base font-semibold dark:text-gray-100">Language</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    Choose your preferred language
                                </p>
                                <select
                                    v-model="settings.language"
                                    class="dark:border-dark-700 dark:bg-dark-900 mt-3 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:text-gray-200">
                                    <option value="en">English</option>
                                    <option value="ru">Russian</option>
                                </select>
                            </label>
                        </div>

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
                                <h3 class="text-base font-semibold dark:text-gray-100">Default Save Folder</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
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
                                        class="rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/20 focus:ring-2 focus:ring-blue-500/30 focus:outline-none dark:text-blue-400">
                                        Browse
                                    </button>
                                </div>
                            </label>
                        </div>
                    </template>

                    <!-- HOTKEYS TAB -->
                    <template v-else-if="activeTab === 'hotkeys'">
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <div
                                class="dark:border-dark-700/50 flex items-center justify-between border-b border-slate-200/50 pb-4">
                                <div>
                                    <h3 class="text-base font-semibold dark:text-gray-100">Screenshot</h3>
                                    <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">Capture screen area</p>
                                </div>
                                <input
                                    type="text"
                                    :value="recordingHotkey === 'hotkeyScreenshot' ? '' : settings.hotkeyScreenshot"
                                    :placeholder="
                                        recordingHotkey === 'hotkeyScreenshot' ? 'Recording...' : 'Click to set'
                                    "
                                    @focus="startRecordingHotkey('hotkeyScreenshot')"
                                    @blur="stopRecordingHotkey()"
                                    @keydown.prevent="recordHotkey('hotkeyScreenshot', $event)"
                                    :class="[
                                        'dark:bg-dark-900 w-40 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors focus:ring-2 focus:outline-none',
                                        recordingHotkey === 'hotkeyScreenshot'
                                            ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20 dark:text-blue-400'
                                            : 'dark:border-dark-700 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20 dark:text-gray-300'
                                    ]"
                                    readonly />
                            </div>

                            <div
                                class="dark:border-dark-700/50 flex items-center justify-between border-b border-slate-200/50 py-4">
                                <div>
                                    <h3 class="text-base font-semibold dark:text-gray-100">Recording</h3>
                                    <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">Start screen recording</p>
                                </div>
                                <input
                                    type="text"
                                    :value="recordingHotkey === 'hotkeyRecording' ? '' : settings.hotkeyRecording"
                                    :placeholder="
                                        recordingHotkey === 'hotkeyRecording' ? 'Recording...' : 'Click to set'
                                    "
                                    @focus="startRecordingHotkey('hotkeyRecording')"
                                    @blur="stopRecordingHotkey()"
                                    @keydown.prevent="recordHotkey('hotkeyRecording', $event)"
                                    :class="[
                                        'dark:bg-dark-900 w-40 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors focus:ring-2 focus:outline-none',
                                        recordingHotkey === 'hotkeyRecording'
                                            ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20 dark:text-blue-400'
                                            : 'dark:border-dark-700 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20 dark:text-gray-300'
                                    ]"
                                    readonly />
                            </div>

                            <!-- <div class="flex items-center justify-between pt-4">
                                <div>
                                    <h3 class="text-base font-semibold dark:text-gray-100">Quick Menu</h3>
                                    <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">Open quick menu</p>
                                </div>
                                <input
                                    type="text"
                                    :value="recordingHotkey === 'hotkeyQuickMenu' ? '' : settings.hotkeyQuickMenu"
                                    :placeholder="
                                        recordingHotkey === 'hotkeyQuickMenu' ? 'Recording...' : 'Click to set'
                                    "
                                    @focus="startRecordingHotkey('hotkeyQuickMenu')"
                                    @blur="stopRecordingHotkey()"
                                    @keydown.prevent="recordHotkey('hotkeyQuickMenu', $event)"
                                    :class="[
                                        'dark:bg-dark-900 w-40 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors focus:ring-2 focus:outline-none',
                                        recordingHotkey === 'hotkeyQuickMenu'
                                            ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20 dark:text-blue-400'
                                            : 'dark:border-dark-700 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20 dark:text-gray-300'
                                    ]"
                                    readonly />
                            </div> -->
                        </div>
                    </template>

                    <!-- CAPTURE TAB -->
                    <template v-else-if="activeTab === 'capture'">
                        <!-- Crop Tools -->
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <div>
                                <h3 class="text-base font-semibold dark:text-gray-100">Crop Screen Tools</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    Enable additional capture tools
                                </p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm font-medium text-slate-700 dark:text-gray-100"
                                    >Show Magnifier</label
                                >
                                <Switch
                                    v-model="settings.showMagnifier"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700 dark:text-gray-100"
                                    >Show Crosshair</label
                                >
                                <Switch
                                    v-model="settings.showCrosshair"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700 dark:text-gray-100">Show Cursor</label>
                                <Switch
                                    v-model="settings.showCursor"
                                    size="md" />
                            </div>
                        </div>

                        <!-- Recording  -->
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <div>
                                <h3 class="text-base font-semibold dark:text-gray-100">Recording</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    Enable additional capture tools
                                </p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm font-medium text-slate-700 dark:text-gray-100"
                                    >Mirror Webcam</label
                                >
                                <Switch
                                    v-model="settings.flipCamera"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700 dark:text-gray-100"
                                    >3 Second Countdown</label
                                >
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
