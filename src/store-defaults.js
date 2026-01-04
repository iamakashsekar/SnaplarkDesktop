// Shared default state for both Pinia store and Electron Store
// This ensures consistency and avoids duplication
const getPlatform = () => {
    // In main process (Node.js context)
    if (typeof process !== 'undefined' && process.platform) {
        return process.platform
    }
    // In renderer process (browser context)
    if (typeof window !== 'undefined' && window.electron?.platform) {
        return window.electron.platform
    }
    // Fallback
    return 'darwin'
}
const isMac = getPlatform() === 'darwin'

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

        // Hotkeys (Global)
        hotkeyScreenshot: isMac ? 'Cmd + Option + S' : 'Ctrl + Alt + S',
        hotkeyRecording: isMac ? 'Cmd + Option + R' : 'Ctrl + Alt + R',
        hotkeyQuickMenu: isMac ? 'Cmd + Option + Q' : 'Ctrl + Alt + Q',
        hotkeyStartStopRecording: isMac ? 'Cmd + Shift + R' : 'Ctrl + Shift + R',

        // Capture Toolbar Shortcuts (Local to Screenshot Window)
        hotkeyUpload: isMac ? 'Cmd + U' : 'Ctrl + U',
        hotkeyCopy: isMac ? 'Cmd + C' : 'Ctrl + C',
        hotkeySave: isMac ? 'Cmd + S' : 'Ctrl + S',

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
