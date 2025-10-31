<script setup>
    import { ref, watch, nextTick } from 'vue'
    import { useWindows } from '@/composables/useWindows'
    import { useStore } from '@/store'

    const { resizeWindowTo } = useWindows()
    const store = useStore()

    // Direct reference to store.settings (it's already reactive)
    const settings = store.settings

    const activeTab = ref('general')
    const contentRef = ref(null)
    
    // Track which hotkey field is currently being recorded
    const recordingHotkey = ref(null)
    const previousHotkeyValue = ref({})

    const mainTabs = [
        { id: 'general', label: 'General', height: 720 },
        { id: 'hotkeys', label: 'Hotkeys', height: 525 },
        { id: 'capture', label: 'Capture', height: 820 }
    ]

    const closeWindow = () => {
        if (window.electronWindows) {
            window.electronWindows.closeWindow('settings')
        }
    }

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
        // This prevents restoring if a key was just recorded (which would have cleared recordingHotkey)
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

    const changeTab = (tab) => {
        activeTab.value = tab.id
        resizeWindowTo('settings', 600, tab.height)
    }
</script>

<template>
    <section
        ref="contentRef"
        class="drag relative w-full rounded-2xl bg-white shadow-[0_20px_60px_rgba(17,32,67,0.1)] ring-1 ring-slate-100/80">
        <button
            @click="closeWindow"
            class="no-drag absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg font-semibold text-slate-500 transition hover:bg-slate-200 focus:ring-2 focus:ring-slate-300 focus:outline-none"
            aria-label="Close settings">
            ×
        </button>

        <div class="space-y-5 px-7 pt-7">
            <div class="space-y-2">
                <h1 class="text-xl font-bold text-slate-900">Settings</h1>
                <p class="text-sm text-slate-500">Configure Snaplark to your preferences</p>
            </div>

            <nav
                v-if="mainTabs.length > 1"
                class="no-drag flex flex-wrap gap-2 border-b border-slate-100 pb-4">
                <button
                    v-for="tab in mainTabs"
                    :key="tab.id"
                    @click="changeTab(tab)"
                    type="button"
                    :class="[
                        'rounded-lg border px-4 py-2 text-sm font-semibold transition focus:ring-2 focus:ring-blue-500/30 focus:outline-none',
                        tab.id === activeTab
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    ]">
                    {{ tab.label }}
                </button>
            </nav>
        </div>

        <div class="no-drag px-7 pt-4 pb-7">
            <transition
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="opacity-0 translate-y-2 scale-[0.99]"
                enter-to-class="opacity-100 translate-y-0 scale-100"
                leave-active-class="transition-all duration-250 ease-in"
                leave-from-class="opacity-100 translate-y-0 scale-100"
                leave-to-class="opacity-0 translate-y-2 scale-[0.99]">
                <div
                    :key="activeTab"
                    class="space-y-4">
                    <!-- GENERAL TAB -->
                    <template v-if="activeTab === 'general'">
                        <!-- Launch at Startup -->
                        <div class="rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-base font-semibold text-slate-900">Launch at Startup</h3>
                                    <p class="mt-1 text-sm text-slate-500">Start Snaplark when your system boots</p>
                                </div>
                                <label class="relative inline-flex h-7 w-14 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.launchAtStartup"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-7"></span>
                                </label>
                            </div>
                        </div>

                        <!-- Language Selection -->
                        <div class="rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <label class="block">
                                <h3 class="text-base font-semibold text-slate-900">Language</h3>
                                <p class="mt-1 text-sm text-slate-500">Choose your preferred language</p>
                                <select
                                    v-model="settings.language"
                                    class="mt-3 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none">
                                    <option value="en">English</option>
                                    <option value="ru">Russian</option>
                                </select>
                            </label>
                        </div>

                        <!-- Save Location Behavior -->
                        <div class="rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-base font-semibold text-slate-900">Prompt for Save Location</h3>
                                    <p class="mt-1 text-sm text-slate-500">Ask where to save each screenshot</p>
                                </div>
                                <label class="relative inline-flex h-7 w-14 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.promptForSaveLocation"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-7"></span>
                                </label>
                            </div>
                        </div>

                        <!-- Default Save Folder -->
                        <div
                            v-if="!settings.promptForSaveLocation"
                            class="rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <label class="block">
                                <h3 class="text-base font-semibold text-slate-900">Default Save Folder</h3>
                                <p class="mt-1 text-sm text-slate-500">
                                    Where screenshots and recordings are saved automatically
                                </p>
                                <div class="mt-3 flex gap-2">
                                    <input
                                        type="text"
                                        :value="settings.defaultSaveFolder"
                                        readonly
                                        class="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600" />
                                    <button
                                        type="button"
                                        @click="browseSaveFolder"
                                        class="rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-500/20 focus:ring-2 focus:ring-blue-500/30 focus:outline-none">
                                        Browse
                                    </button>
                                </div>
                            </label>
                        </div>
                    </template>

                    <!-- HOTKEYS TAB -->
                    <template v-else-if="activeTab === 'hotkeys'">
                        <div
                            class="space-y-4 rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <div class="flex items-center justify-between border-b border-slate-100 pb-4">
                                <div>
                                    <h3 class="text-base font-semibold text-slate-900">Screenshot</h3>
                                    <p class="mt-1 text-sm text-slate-500">Capture screen area</p>
                                </div>
                                <input
                                    type="text"
                                    :value="recordingHotkey === 'hotkeyScreenshot' ? '' : settings.hotkeyScreenshot"
                                    :placeholder="recordingHotkey === 'hotkeyScreenshot' ? 'Recording...' : 'Click to set'"
                                    @focus="startRecordingHotkey('hotkeyScreenshot')"
                                    @blur="stopRecordingHotkey()"
                                    @keydown.prevent="recordHotkey('hotkeyScreenshot', $event)"
                                    :class="[
                                        'w-40 rounded-lg border bg-white px-3 py-2 text-center text-sm font-medium focus:ring-2 focus:outline-none transition-colors',
                                        recordingHotkey === 'hotkeyScreenshot'
                                            ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20'
                                            : 'border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20'
                                    ]"
                                    readonly />
                            </div>

                            <div class="flex items-center justify-between border-b border-slate-100 pb-4">
                                <div>
                                    <h3 class="text-base font-semibold text-slate-900">Recording</h3>
                                    <p class="mt-1 text-sm text-slate-500">Start screen recording</p>
                                </div>
                                <input
                                    type="text"
                                    :value="recordingHotkey === 'hotkeyRecording' ? '' : settings.hotkeyRecording"
                                    :placeholder="recordingHotkey === 'hotkeyRecording' ? 'Recording...' : 'Click to set'"
                                    @focus="startRecordingHotkey('hotkeyRecording')"
                                    @blur="stopRecordingHotkey()"
                                    @keydown.prevent="recordHotkey('hotkeyRecording', $event)"
                                    :class="[
                                        'w-40 rounded-lg border bg-white px-3 py-2 text-center text-sm font-medium focus:ring-2 focus:outline-none transition-colors',
                                        recordingHotkey === 'hotkeyRecording'
                                            ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20'
                                            : 'border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20'
                                    ]"
                                    readonly />
                            </div>

                            <div class="flex items-center justify-between">
                                <div>
                                    <h3 class="text-base font-semibold text-slate-900">Quick Menu</h3>
                                    <p class="mt-1 text-sm text-slate-500">Open quick menu</p>
                                </div>
                                <input
                                    type="text"
                                    :value="recordingHotkey === 'hotkeyQuickMenu' ? '' : settings.hotkeyQuickMenu"
                                    :placeholder="recordingHotkey === 'hotkeyQuickMenu' ? 'Recording...' : 'Click to set'"
                                    @focus="startRecordingHotkey('hotkeyQuickMenu')"
                                    @blur="stopRecordingHotkey()"
                                    @keydown.prevent="recordHotkey('hotkeyQuickMenu', $event)"
                                    :class="[
                                        'w-40 rounded-lg border bg-white px-3 py-2 text-center text-sm font-medium focus:ring-2 focus:outline-none transition-colors',
                                        recordingHotkey === 'hotkeyQuickMenu'
                                            ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20'
                                            : 'border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20'
                                    ]"
                                    readonly />
                            </div>
                        </div>
                    </template>

                    <!-- CAPTURE TAB -->
                    <template v-else-if="activeTab === 'capture'">
                        <!-- Screenshot Quality -->
                        <div class="rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <label class="block">
                                <h3 class="text-base font-semibold text-slate-900">Screenshot Quality</h3>
                                <p class="mt-1 text-sm text-slate-500">Quality for saved and uploaded screenshots</p>
                                <select
                                    v-model="settings.uploadQuality"
                                    class="mt-3 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none">
                                    <option value="low">Low - JPEG 75% (Smaller files)</option>
                                    <option value="medium">Medium - JPEG 90% (Balanced)</option>
                                    <option value="high">High - PNG (Best quality)</option>
                                </select>
                            </label>
                        </div>

                        <!-- Crop Tools -->
                        <div
                            class="space-y-4 rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <div>
                                <h3 class="text-base font-semibold text-slate-900">Crop Screen Tools</h3>
                                <p class="mt-1 text-sm text-slate-500">Enable additional capture tools</p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm font-medium text-slate-700">Show Magnifier</label>
                                <label class="relative inline-flex h-6 w-12 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.showMagnifier"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                                </label>
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700">Show Grid</label>
                                <label class="relative inline-flex h-6 w-12 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.showGrid"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                                </label>
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700">Show Cursor</label>
                                <label class="relative inline-flex h-6 w-12 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.showCursor"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                                </label>
                            </div>
                        </div>

                        <!-- Recording  -->
                        <div
                            class="space-y-4 rounded-lg border border-slate-100 bg-gradient-to-b from-white to-slate-50/60 p-5">
                            <div>
                                <h3 class="text-base font-semibold text-slate-900">Recording</h3>
                                <p class="mt-1 text-sm text-slate-500">Enable additional capture tools</p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm font-medium text-slate-700">Mirror Webcam</label>
                                <label class="relative inline-flex h-6 w-12 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.flipCamera"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                                </label>
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700">Record Audio in Mono</label>
                                <label class="relative inline-flex h-6 w-12 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.recordAudioMono"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                                </label>
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm font-medium text-slate-700">3 Second Countdown</label>
                                <label class="relative inline-flex h-6 w-12 cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        v-model="settings.recordingCountdown"
                                        class="peer sr-only" />
                                    <span
                                        class="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
                                    <span
                                        class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6"></span>
                                </label>
                            </div>
                        </div>
                    </template>
                </div>
            </transition>
        </div>
    </section>
</template>
