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
        showTooltips: true,

        // Hotkeys (Global)
        hotkeyScreenshot: isMac ? 'Option + S' : 'Alt + S',
        hotkeyRecording: isMac ? 'Option + A' : 'Alt + A',
        hotkeyQuickMenu: isMac ? 'Option + Q' : 'Alt + Q',
        hotkeyStartStopRecording: isMac ? 'Option + R' : 'Alt + R',
        hotkeyToggleMicrophone: isMac ? 'Option + M' : 'Alt + M',
        hotkeyToggleWebcam: isMac ? 'Option + W' : 'Alt + W',

        // Capture Toolbar Shortcuts (Local to Screenshot Window)
        hotkeyUpload: isMac ? 'Option + U' : 'Alt + U',
        hotkeyCopy: isMac ? 'Option + C' : 'Alt + C',
        hotkeySave: isMac ? 'Option + D' : 'Alt + D',

        // Capture
        showMagnifier: true,
        showCrosshair: true,
        showCursor: true,

        // Recording
        flipCamera: false,
        recordingCountdown: true,
        selectedMicrophoneDeviceId: null, // null means muted, otherwise stores the deviceId
        webcamEnabled: false, // Whether webcam overlay is enabled by default
        selectedWebcamDeviceId: null, // Selected webcam device ID, null means use default or none
        systemAudioEnabled: false // Whether to record system audio (computer sound)
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
