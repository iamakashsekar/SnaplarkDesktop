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

    // Quick menu shortcut - Global (currently commented out in UI, but ready to use)
    QUICK_MENU: {
        id: 'quickMenu',
        storeKey: 'hotkeyQuickMenu',
        type: 'global',
        description: 'Open quick menu',
        category: 'navigation'
    }

    // Example of a local shortcut (add more as needed):
    // SAVE_SCREENSHOT: {
    //     id: 'saveScreenshot',
    //     storeKey: 'hotkeySaveScreenshot',
    //     type: 'local',
    //     windowId: 'screenshot', // The window where this shortcut is active
    //     description: 'Save current screenshot',
    //     category: 'screenshot'
    // }
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
