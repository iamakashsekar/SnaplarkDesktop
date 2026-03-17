<script setup>
    import { ref, onMounted, computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useWindows } from '@/composables/useWindows'
    import { useStore } from '@/store'
    import SettingsSwitchItem from '@/components/SettingsSwitchItem.vue'
    import SettingsHotkeyItem from '@/components/SettingsHotkeyItem.vue'
    import Switch from '@/components/Switch.vue'
    import TitleBar from '@/components/TitleBar.vue'
    import { WINDOW_TITLE_KEYS, WINDOW_DIMENSIONS } from '@/config/window-config'
    import { SUPPORTED_LOCALES } from '@/i18n/shared'

    const { resizeWindowTo } = useWindows()
    const store = useStore()
    const { t } = useI18n()

    // Direct reference to store.settings (it's already reactive)
    const settings = store.settings

    const activeTab = ref('general')
    const contentRef = ref(null)
    const appVersion = ref('')

    const mainTabs = computed(() => [
        {
            id: 'general',
            label: t('settings.tabs.general'),
            width: WINDOW_DIMENSIONS.settings.width,
            height: WINDOW_DIMENSIONS.settings.height
        },
        { id: 'hotkeys', label: t('settings.tabs.hotkeys'), width: WINDOW_DIMENSIONS.settings.width, height: 670 },
        { id: 'capture', label: t('settings.tabs.capture'), width: WINDOW_DIMENSIONS.settings.width, height: 540 }
    ])

    const languageOptions = computed(() => {
        return SUPPORTED_LOCALES.map((language) => ({
            code: language.code,
            label: language.name
        }))
    })

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
        <TitleBar :title="$t(WINDOW_TITLE_KEYS.settings)" />

        <div class="mb-2.5 space-y-0.5 px-4">
            <h1 class="text-xl font-semibold dark:text-white">
                {{ $t('settings.title') }} <span class="text-sm text-slate-500 dark:text-gray-400">(v{{ appVersion }})</span>
            </h1>
            <p class="text-sm text-slate-500 dark:text-gray-400">{{ $t('settings.description') }}</p>
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
                        <SettingsSwitchItem
                            :title="$t('settings.general.launchAtStartup.title')"
                            :description="$t('settings.general.launchAtStartup.description')"
                            v-model="settings.launchAtStartup" />

                        <SettingsSwitchItem
                            :title="$t('settings.general.darkMode.title')"
                            :description="$t('settings.general.darkMode.description')"
                            v-model="settings.darkMode" />

                        <SettingsSwitchItem
                            :title="$t('settings.general.openInBrowser.title')"
                            :description="$t('settings.general.openInBrowser.description')"
                            v-model="settings.openInBrowser" />

                        <SettingsSwitchItem
                            :title="$t('settings.general.showTooltips.title')"
                            :description="$t('settings.general.showTooltips.description')"
                            v-model="settings.showTooltips" />

                        <!-- Language Selection -->
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                            <label class="block">
                                <h3 class="text-sm font-medium dark:text-gray-100">{{ $t('settings.language.label') }}</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    {{ $t('settings.language.description') }}
                                </p>
                                <select
                                    v-model="settings.language"
                                    class="dark:border-dark-700 dark:bg-dark-900 mt-1.5 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none dark:text-gray-400">
                                    <option
                                        v-for="language in languageOptions"
                                        :key="language.code"
                                        :value="language.code">
                                        {{ language.label }}
                                    </option>
                                </select>
                            </label>
                        </div>

                        <SettingsSwitchItem
                            :title="$t('settings.general.promptForSaveLocation.title')"
                            :description="$t('settings.general.promptForSaveLocation.description')"
                            v-model="settings.promptForSaveLocation" />

                        <div
                            v-if="!settings.promptForSaveLocation"
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <label class="block">
                                <h3 class="ttext-sm font-medium dark:text-gray-100">{{ $t('settings.general.defaultSaveFolder.title') }}</h3>
                                <p class="mt-1 text-sm font-medium text-slate-500 dark:text-gray-300">
                                    {{ $t('settings.general.defaultSaveFolder.description') }}
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
                                        {{ $t('common.buttons.browse') }}
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
                                {{ $t('settings.hotkeys.sections.quickAccess') }}
                            </h3>
                        </div>

                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.quickMenu.title')"
                                :description="$t('settings.hotkeys.quickMenu.description')"
                                storeKey="hotkeyQuickMenu"
                                v-model="settings.hotkeyQuickMenu" />
                        </div>

                        <!-- SCREENSHOT -->
                        <div class="mt-5 mb-3 px-1">
                            <h3
                                class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-gray-500">
                                {{ $t('settings.hotkeys.sections.screenshot') }}
                            </h3>
                        </div>

                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-0 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.captureScreen.title')"
                                :description="$t('settings.hotkeys.captureScreen.description')"
                                storeKey="hotkeyScreenshot"
                                v-model="settings.hotkeyScreenshot" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.upload.title')"
                                :description="$t('settings.hotkeys.upload.description')"
                                storeKey="hotkeyUpload"
                                v-model="settings.hotkeyUpload" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.copy.title')"
                                :description="$t('settings.hotkeys.copy.description')"
                                storeKey="hotkeyCopy"
                                v-model="settings.hotkeyCopy" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.save.title')"
                                :description="$t('settings.hotkeys.save.description')"
                                storeKey="hotkeySave"
                                v-model="settings.hotkeySave" />
                        </div>

                        <!-- VIDEO RECORDING -->
                        <div class="mt-5 mb-3 px-1">
                            <h3
                                class="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-gray-500">
                                {{ $t('settings.hotkeys.sections.videoRecording') }}
                            </h3>
                        </div>

                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-0 rounded-xl border border-slate-100 bg-slate-50/50 px-4">
                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.selectRecordingArea.title')"
                                :description="$t('settings.hotkeys.selectRecordingArea.description')"
                                storeKey="hotkeyRecording"
                                v-model="settings.hotkeyRecording" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.startStopRecording.title')"
                                :description="$t('settings.hotkeys.startStopRecording.description')"
                                storeKey="hotkeyStartStopRecording"
                                v-model="settings.hotkeyStartStopRecording" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.toggleMicrophone.title')"
                                :description="$t('settings.hotkeys.toggleMicrophone.description')"
                                storeKey="hotkeyToggleMicrophone"
                                v-model="settings.hotkeyToggleMicrophone" />

                            <hr class="dark:border-dark-700/50 border-slate-100" />

                            <SettingsHotkeyItem
                                :title="$t('settings.hotkeys.toggleWebcam.title')"
                                :description="$t('settings.hotkeys.toggleWebcam.description')"
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
                                <h3 class="text-sm font-medium dark:text-gray-100">{{ $t('settings.capture.cropTools.title') }}</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    {{ $t('settings.capture.cropTools.description') }}
                                </p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm text-slate-700 dark:text-gray-100">{{ $t('settings.capture.cropTools.showMagnifier') }}</label>
                                <Switch
                                    v-model="settings.showMagnifier"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm text-slate-700 dark:text-gray-100">{{ $t('settings.capture.cropTools.showCrosshair') }}</label>
                                <Switch
                                    v-model="settings.showCrosshair"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm text-slate-700 dark:text-gray-100">{{ $t('settings.capture.cropTools.showCursor') }}</label>
                                <Switch
                                    v-model="settings.showCursor"
                                    size="md" />
                            </div>
                        </div>

                        <!-- Recording  -->
                        <div
                            class="dark:border-dark-700 dark:bg-dark-800 space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                            <div>
                                <h3 class="text-sm font-medium dark:text-gray-100">{{ $t('settings.capture.recording.title') }}</h3>
                                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                                    {{ $t('settings.capture.recording.description') }}
                                </p>
                            </div>

                            <div class="flex items-center justify-between pt-2">
                                <label class="text-sm text-slate-700 dark:text-gray-100">{{ $t('settings.capture.recording.mirrorWebcam') }}</label>
                                <Switch
                                    v-model="settings.flipCamera"
                                    size="md" />
                            </div>

                            <div class="flex items-center justify-between">
                                <label class="text-sm text-slate-700 dark:text-gray-100">{{ $t('settings.capture.recording.countdown') }}</label>
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
