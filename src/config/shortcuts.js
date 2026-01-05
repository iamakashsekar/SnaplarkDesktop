/**
 * Central configuration for all application shortcuts
 * This defines which shortcuts are available, their IDs, types, and descriptions
 */

export const SHORTCUT_DEFINITIONS = {
    // Screenshot shortcut - Global
    SCREENSHOT: {
        id: 'screenshot',
        storeKey: 'hotkeyScreenshot',
        type: 'global',
        description: 'Capture screen area',
        category: 'capture'
    },

    // Screen recording shortcut - Global
    RECORDING: {
        id: 'recording',
        storeKey: 'hotkeyRecording',
        type: 'global',
        description: 'Start screen recording',
        category: 'capture'
    },

    // Start/Stop recording shortcut - Global
    START_STOP_RECORDING: {
        id: 'startStopRecording',
        storeKey: 'hotkeyStartStopRecording',
        type: 'global',
        description: 'Start/Stop recording',
        category: 'capture'
    },

    // Toggle microphone shortcut - Global
    TOGGLE_MICROPHONE: {
        id: 'toggleMicrophone',
        storeKey: 'hotkeyToggleMicrophone',
        type: 'global',
        description: 'Mute/Unmute microphone',
        category: 'capture'
    },

    // Toggle webcam shortcut - Global
    TOGGLE_WEBCAM: {
        id: 'toggleWebcam',
        storeKey: 'hotkeyToggleWebcam',
        type: 'global',
        description: 'Enable/Disable webcam',
        category: 'capture'
    },

    // Quick menu shortcut - Global
    QUICK_MENU: {
        id: 'quickMenu',
        storeKey: 'hotkeyQuickMenu',
        type: 'global',
        description: 'Open quick menu',
        category: 'navigation'
    },

    // Local shortcuts for screenshot toolbar
    UPLOAD: {
        id: 'upload',
        storeKey: 'hotkeyUpload',
        type: 'local',
        windowId: 'screenshot',
        description: 'Upload to website',
        category: 'screenshot'
    },

    COPY: {
        id: 'copy',
        storeKey: 'hotkeyCopy',
        type: 'local',
        windowId: 'screenshot',
        description: 'Copy to clipboard',
        category: 'screenshot'
    },

    SAVE: {
        id: 'save',
        storeKey: 'hotkeySave',
        type: 'local',
        windowId: 'screenshot',
        description: 'Save to file',
        category: 'screenshot'
    }
}

/**
 * Get all shortcuts of a specific type
 * @param {string} type - 'global' or 'local'
 * @returns {Array}
 */
export function getShortcutsByType(type) {
    return Object.values(SHORTCUT_DEFINITIONS).filter((shortcut) => shortcut.type === type)
}

/**
 * Get all shortcuts in a category
 * @param {string} category - Category name (e.g., 'capture', 'navigation')
 * @returns {Array}
 */
export function getShortcutsByCategory(category) {
    return Object.values(SHORTCUT_DEFINITIONS).filter((shortcut) => shortcut.category === category)
}

/**
 * Get shortcut definition by ID
 * @param {string} id - Shortcut ID
 * @returns {Object|null}
 */
export function getShortcutById(id) {
    return Object.values(SHORTCUT_DEFINITIONS).find((shortcut) => shortcut.id === id) || null
}

/**
 * Get shortcut definition by store key
 * @param {string} storeKey - Store key (e.g., 'hotkeyScreenshot')
 * @returns {Object|null}
 */
export function getShortcutByStoreKey(storeKey) {
    return Object.values(SHORTCUT_DEFINITIONS).find((shortcut) => shortcut.storeKey === storeKey) || null
}
