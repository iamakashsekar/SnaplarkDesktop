// Shared default state for both Pinia store and Electron Store
// This ensures consistency and avoids duplication

export const defaultState = {
    // UI State
    isDarkMode: false,

    // Auth State
    user: null,
    isAuthenticated: false,

    welcomeCompleted: false,

    // Upload State
    lastCapture: null,

    // App Settings
    settings: {
        // General
        launchAtStartup: false,
        language: 'en',
        defaultSaveFolder: '~/Pictures/Snaplark',
        promptForSaveLocation: false,

        // Hotkeys
        hotkeyScreenshot: 'Shift + Cmd + S',
        hotkeyRecording: 'Shift + Cmd + R',
        hotkeyQuickMenu: 'Ctrl + Alt + S',

        // Capture
        uploadQuality: 'high',
        showMagnifier: true,
        showGrid: false,
        showCursor: true,

        // Recording
        flipCamera: false,
        recordAudioMono: false,
        recordingCountdown: true
    }
}

// Keys that should NOT be persisted (runtime-only state)
export const excludeFromPersist = ['isLoading', 'isOnline', 'authError']

// Helper to get only persistable defaults (for Electron Store)
export const getPersistableDefaults = () => {
    const defaults = {}
    Object.keys(defaultState).forEach((key) => {
        if (!excludeFromPersist.includes(key)) {
            defaults[key] = defaultState[key]
        }
    })
    return defaults
}
