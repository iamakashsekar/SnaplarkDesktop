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
        promptForSaveLocation: true,

        // Hotkeys
        hotkeyScreenshot: 'Shift + Cmd + S',
        hotkeyRecording: 'Shift + Cmd + R',
        hotkeyQuickMenu: 'Ctrl + Alt + S',

        // Capture
        showMagnifier: true,
        showCrosshair: true,
        showCursor: true,

        // Recording
        flipCamera: false,
        recordAudioMono: false,
        recordingCountdown: true,
        selectedMicrophoneDeviceId: null, // null means muted, otherwise stores the deviceId
        webcamEnabled: false // Whether webcam overlay is enabled by default
    }
}

// Keys that should NOT be persisted (runtime-only state)
// Note: 'auth_token' is managed separately by TokenManager, not by Pinia state
export const excludeFromPersist = ['isLoading', 'isOnline', 'authError', 'auth_token']

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
