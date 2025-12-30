// Shared default state for both Pinia store and Electron Store
// This ensures consistency and avoids duplication

export const defaultState = {
    // Auth State
    user: null,
    isAuthenticated: false,

    welcomeCompleted: false,

    // Upload State
    lastCapture: null,

    // App Settings
    settings: {
        // General
        darkMode: false,
        launchAtStartup: true,
        openInBrowser: false,
        language: 'en',
        defaultSaveFolder: '~/Pictures/Snaplark',
        promptForSaveLocation: true,

        // Hotkeys
        hotkeyScreenshot: 'Shift + Cmd + S',
        hotkeyRecording: 'Shift + Cmd + R',
        hotkeyQuickMenu: 'Ctrl + Alt + S',

        // Capture Toolbar Shortcuts (Local to Screenshot Window)
        hotkeyUpload: 'Ctrl + U',
        hotkeyCopy: 'Ctrl + C',
        hotkeySave: 'Ctrl + S',
        hotkeyOCR: 'Ctrl + O',
        hotkeySearch: 'Ctrl + Shift + S',
        hotkeyEdit: 'Ctrl + E',

        // Capture
        showMagnifier: true,
        showCrosshair: true,
        showCursor: true,

        // Recording
        flipCamera: false,
        recordingCountdown: true,
        selectedMicrophoneDeviceId: null, // null means muted, otherwise stores the deviceId
        webcamEnabled: false, // Whether webcam overlay is enabled by default
        selectedWebcamDeviceId: null // Selected webcam device ID, null means use default or none
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
