import { globalShortcut, BrowserWindow } from 'electron'

/**
 * Comprehensive Shortcut Manager
 * Handles both global and local shortcuts with cross-platform support
 */
class ShortcutManager {
    constructor(store) {
        this.store = store
        this.registeredShortcuts = new Map() // Map of shortcut IDs to their configs
        this.activeShortcuts = new Map() // Map of Electron accelerators to shortcut IDs
    }

    /**
     * Convert user-friendly hotkey format to Electron accelerator format
     * Also handles cross-platform key mappings (Mac/Windows)
     * @param {string} hotkey - User-defined hotkey (e.g., "Shift + Cmd + S")
     * @returns {string|null} - Electron accelerator format
     */
    convertHotkeyToElectron(hotkey) {
        if (!hotkey || typeof hotkey !== 'string') return null

        hotkey = hotkey.trim()
        if (!hotkey) return null

        // Convert from our format (Shift + Cmd + S) to Electron format (Shift+Command+S)
        let electronKey = hotkey.replace(/\s*\+\s*/g, '+') // Remove spaces around +

        // Cross-platform key conversions
        const platform = process.platform

        if (platform === 'darwin') {
            // macOS specific conversions
            electronKey = electronKey
                .replace(/Cmd/gi, 'Command')
                .replace(/Ctrl/gi, 'Control')
                .replace(/Win/gi, 'Command') // Windows key doesn't exist on Mac
        } else if (platform === 'win32') {
            // Windows specific conversions
            electronKey = electronKey
                .replace(/Cmd/gi, 'Ctrl') // Cmd -> Ctrl on Windows
                .replace(/Command/gi, 'Ctrl')
                .replace(/Win/gi, 'Super') // Windows key
        } else {
            // Linux and others
            electronKey = electronKey
                .replace(/Cmd/gi, 'Ctrl')
                .replace(/Command/gi, 'Ctrl')
                .replace(/Win/gi, 'Super')
        }

        // Handle special key names that Electron expects
        const keyMappings = {
            ArrowUp: 'Up',
            ArrowDown: 'Down',
            ArrowLeft: 'Left',
            ArrowRight: 'Right',
            Enter: 'Return',
            ' ': 'Space',
            Escape: 'Esc'
        }

        // Replace any mapped keys
        Object.keys(keyMappings).forEach((key) => {
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(`(^|\\+)${escapedKey}(\\+|$)`, 'gi')
            electronKey = electronKey.replace(regex, `$1${keyMappings[key]}$2`)
        })

        return electronKey
    }

    /**
     * Register a shortcut with automatic handling of global/local types
     * @param {Object} config - Shortcut configuration
     * @param {string} config.id - Unique identifier for the shortcut
     * @param {string} config.hotkey - Hotkey string (e.g., "Shift + Cmd + S")
     * @param {Function} config.action - Action to execute when triggered
     * @param {string} config.type - 'global' or 'local'
     * @param {string} config.windowId - Required for local shortcuts - the window ID
     * @param {string} config.description - Optional description for logging
     * @returns {Object} - Registration result {success: boolean, error?: string, accelerator?: string}
     */
    register(config) {
        const { id, hotkey, action, type = 'global', windowId = null, description = '' } = config

        // Validation
        if (!id || !hotkey || !action) {
            console.error('[ShortcutManager] Missing required parameters:', { id, hotkey, action })
            return { success: false, error: 'Missing required parameters' }
        }

        if (type !== 'global' && type !== 'local') {
            console.error('[ShortcutManager] Invalid type. Must be "global" or "local"')
            return { success: false, error: 'Invalid type. Must be "global" or "local"' }
        }

        if (type === 'local' && !windowId) {
            console.error('[ShortcutManager] windowId is required for local shortcuts')
            return { success: false, error: 'windowId is required for local shortcuts' }
        }

        // Unregister existing shortcut with same ID if it exists
        this.unregister(id)

        // Convert hotkey to Electron format
        const electronKey = this.convertHotkeyToElectron(hotkey)
        if (!electronKey) {
            console.error(`[ShortcutManager] Invalid hotkey format: ${hotkey}`)
            return { success: false, error: `Invalid hotkey format: ${hotkey}` }
        }

        // Store the configuration
        this.registeredShortcuts.set(id, {
            id,
            hotkey,
            electronKey,
            action,
            type,
            windowId,
            description
        })

        if (type === 'global') {
            return this._registerGlobal(id, electronKey, action, description)
        } else {
            return this._registerLocal(id, electronKey, action, windowId, description)
        }
    }

    /**
     * Register a global shortcut
     * @private
     */
    _registerGlobal(id, electronKey, action, description) {
        // Check if shortcut is already registered by us or another app
        if (globalShortcut.isRegistered(electronKey)) {
            console.warn(`[ShortcutManager] Shortcut ${electronKey} is already registered. Attempting to unregister...`)
            try {
                globalShortcut.unregister(electronKey)
            } catch (error) {
                console.error('[ShortcutManager] Cannot unregister existing shortcut:', error)
                return {
                    success: false,
                    error: 'Shortcut is already in use by another application.'
                }
            }
        }

        try {
            const registered = globalShortcut.register(electronKey, () => {
                console.log(
                    `[ShortcutManager] Global shortcut triggered: ${electronKey}${description ? ` (${description})` : ''}`
                )
                action()
            })

            if (registered) {
                this.activeShortcuts.set(electronKey, id)
                console.log(
                    `[ShortcutManager] Successfully registered global shortcut: ${electronKey}${description ? ` - ${description}` : ''}`
                )
                return { success: true, accelerator: electronKey }
            } else {
                console.error(`[ShortcutManager] Failed to register global shortcut: ${electronKey}`)
                return {
                    success: false,
                    error: 'Failed to register shortcut. It may be in use by another application.'
                }
            }
        } catch (error) {
            console.error('[ShortcutManager] Error registering global shortcut:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * Register a local shortcut (window-specific)
     * @private
     */
    _registerLocal(id, electronKey, action, windowId, description) {
        try {
            const windows = BrowserWindow.getAllWindows()
            const targetWindow = windows.find((win) => win.id === windowId || win.title === windowId)

            if (!targetWindow) {
                // Window doesn't exist yet - that's okay for local shortcuts
                // They will be registered when the window is created
                console.log(`[ShortcutManager] Window '${windowId}' not found yet. Local shortcut will be registered when window is ready.`)
                this.activeShortcuts.set(electronKey, id)
                return { success: true, accelerator: electronKey, pending: true }
            }

            // For local shortcuts, we use webContents.on('before-input-event')
            // This allows us to capture keyboard events only when the window is focused
            const listener = (event, input) => {
                // Check if this input matches our shortcut
                if (this._matchesShortcut(input, electronKey)) {
                    console.log(
                        `[ShortcutManager] Local shortcut triggered: ${electronKey}${description ? ` (${description})` : ''}`
                    )
                    event.preventDefault()
                    action()
                }
            }

            targetWindow.webContents.on('before-input-event', listener)

            // Store the listener so we can remove it later
            const config = this.registeredShortcuts.get(id)
            if (config) {
                config.listener = listener
                config.targetWindow = targetWindow
            }

            this.activeShortcuts.set(electronKey, id)
            console.log(
                `[ShortcutManager] Successfully registered local shortcut for window ${windowId}: ${electronKey}${description ? ` - ${description}` : ''}`
            )
            return { success: true, accelerator: electronKey }
        } catch (error) {
            console.error('[ShortcutManager] Error registering local shortcut:', error)
            return { success: false, error: error.message }
        }
    }

    /**
     * Check if input event matches the shortcut accelerator
     * @private
     */
    _matchesShortcut(input, accelerator) {
        if (input.type !== 'keyDown') return false

        const parts = accelerator.split('+')
        const key = parts[parts.length - 1].toLowerCase()
        const hasCtrl = parts.some((p) => p.toLowerCase() === 'control' || p.toLowerCase() === 'ctrl')
        const hasShift = parts.some((p) => p.toLowerCase() === 'shift')
        const hasAlt = parts.some((p) => p.toLowerCase() === 'alt')
        const hasMeta = parts.some(
            (p) => p.toLowerCase() === 'command' || p.toLowerCase() === 'cmd' || p.toLowerCase() === 'super'
        )

        return (
            input.key.toLowerCase() === key &&
            input.control === hasCtrl &&
            input.shift === hasShift &&
            input.alt === hasAlt &&
            input.meta === hasMeta
        )
    }

    /**
     * Unregister a shortcut by ID
     * @param {string} id - Shortcut ID
     * @returns {boolean} - Success status
     */
    unregister(id) {
        const config = this.registeredShortcuts.get(id)
        if (!config) {
            return false
        }

        try {
            if (config.type === 'global') {
                if (globalShortcut.isRegistered(config.electronKey)) {
                    globalShortcut.unregister(config.electronKey)
                    console.log(`[ShortcutManager] Unregistered global shortcut: ${config.electronKey}`)
                }
            } else if (config.type === 'local') {
                // Remove the listener
                if (config.targetWindow && config.listener && !config.targetWindow.isDestroyed()) {
                    config.targetWindow.webContents.removeListener('before-input-event', config.listener)
                    console.log(`[ShortcutManager] Unregistered local shortcut: ${config.electronKey}`)
                }
            }

            this.activeShortcuts.delete(config.electronKey)
            this.registeredShortcuts.delete(id)
            return true
        } catch (error) {
            console.error(`[ShortcutManager] Error unregistering shortcut ${id}:`, error)
            return false
        }
    }

    /**
     * Update a shortcut's hotkey
     * Convenience method that unregisters and re-registers
     * @param {string} id - Shortcut ID
     * @param {string} newHotkey - New hotkey string
     * @returns {Object} - Registration result
     */
    update(id, newHotkey) {
        const config = this.registeredShortcuts.get(id)
        if (!config) {
            console.error(`[ShortcutManager] Cannot update: shortcut ${id} not found`)
            return { success: false, error: `Shortcut ${id} not found` }
        }

        // Re-register with new hotkey
        return this.register({
            ...config,
            hotkey: newHotkey
        })
    }

    /**
     * Unregister all shortcuts
     */
    unregisterAll() {
        // Unregister all global shortcuts
        globalShortcut.unregisterAll()

        // Unregister all local shortcuts
        this.registeredShortcuts.forEach((config, id) => {
            if (
                config.type === 'local' &&
                config.targetWindow &&
                config.listener &&
                !config.targetWindow.isDestroyed()
            ) {
                config.targetWindow.webContents.removeListener('before-input-event', config.listener)
            }
        })

        this.registeredShortcuts.clear()
        this.activeShortcuts.clear()
        console.log('[ShortcutManager] Unregistered all shortcuts')
    }

    /**
     * Get all registered shortcuts info
     * @returns {Array} - Array of shortcut configs
     */
    getAllShortcuts() {
        return Array.from(this.registeredShortcuts.values()).map((config) => ({
            id: config.id,
            hotkey: config.hotkey,
            accelerator: config.electronKey,
            type: config.type,
            windowId: config.windowId,
            description: config.description
        }))
    }

    /**
     * Check if a shortcut is registered
     * @param {string} id - Shortcut ID
     * @returns {boolean}
     */
    isRegistered(id) {
        return this.registeredShortcuts.has(id)
    }

    /**
     * Get shortcut info by ID
     * @param {string} id - Shortcut ID
     * @returns {Object|null}
     */
    getShortcut(id) {
        const config = this.registeredShortcuts.get(id)
        if (!config) return null

        return {
            id: config.id,
            hotkey: config.hotkey,
            accelerator: config.electronKey,
            type: config.type,
            windowId: config.windowId,
            description: config.description
        }
    }

    /**
     * Register all pending local shortcuts for a specific window
     * Call this when a window is created/opened
     * @param {string} windowId - The window ID (e.g., 'screenshot')
     * @returns {number} - Number of shortcuts registered
     */
    registerLocalShortcutsForWindow(windowId) {
        let count = 0
        
        for (const [id, config] of this.registeredShortcuts.entries()) {
            // Only process local shortcuts for this window that don't have a listener yet
            if (config.type === 'local' && config.windowId === windowId && !config.listener) {
                const result = this._registerLocal(
                    id,
                    config.electronKey,
                    config.action,
                    windowId,
                    config.description
                )
                
                if (result.success && !result.pending) {
                    count++
                }
            }
        }
        
        if (count > 0) {
            console.log(`[ShortcutManager] Registered ${count} local shortcuts for window: ${windowId}`)
        }
        
        return count
    }

    /**
     * Check if a hotkey is already in use by another shortcut
     * @param {string} hotkey - The hotkey string to check
     * @param {string} excludeId - Optional ID to exclude from the check (for updates)
     * @returns {Object|null} - Returns the conflicting shortcut config or null if no conflict
     */
    findDuplicateHotkey(hotkey, excludeId = null) {
        const electronKey = this.convertHotkeyToElectron(hotkey)
        if (!electronKey) return null

        for (const [id, config] of this.registeredShortcuts.entries()) {
            if (id === excludeId) continue
            if (config.electronKey === electronKey || config.hotkey === hotkey) {
                return {
                    id: config.id,
                    hotkey: config.hotkey,
                    description: config.description
                }
            }
        }
        return null
    }

    /**
     * Validate a hotkey before registration
     * @param {string} hotkey - The hotkey to validate
     * @param {string} type - 'global' or 'local'
     * @param {string} excludeId - Optional ID to exclude from duplicate check
     * @returns {Object} - {valid: boolean, error?: string, duplicate?: Object}
     */
    validateHotkey(hotkey, type = 'global', excludeId = null) {
        if (!hotkey || typeof hotkey !== 'string' || !hotkey.trim()) {
            return { valid: false, error: 'Hotkey cannot be empty' }
        }

        const electronKey = this.convertHotkeyToElectron(hotkey)
        if (!electronKey) {
            return { valid: false, error: 'Invalid hotkey format' }
        }

        // Check for duplicates within our app
        const duplicate = this.findDuplicateHotkey(hotkey, excludeId)
        if (duplicate) {
            return {
                valid: false,
                error: 'Hotkey already in use',
                duplicate: duplicate
            }
        }

        // For global shortcuts, check if it's already registered by another app
        if (type === 'global' && globalShortcut.isRegistered(electronKey)) {
            // Check if it's registered by us
            const ourShortcut = Array.from(this.registeredShortcuts.values()).find(
                (config) => config.electronKey === electronKey
            )
            if (!ourShortcut || (excludeId && ourShortcut.id === excludeId)) {
                return {
                    valid: false,
                    error: 'Hotkey is in use by another application'
                }
            }
        }

        return { valid: true }
    }

    /**
     * Test if a global shortcut can be registered (without actually registering it)
     * @param {string} hotkey - The hotkey to test
     * @returns {Object} - {canRegister: boolean, error?: string}
     */
    testGlobalShortcut(hotkey) {
        const electronKey = this.convertHotkeyToElectron(hotkey)
        if (!electronKey) {
            return { canRegister: false, error: 'Invalid hotkey format' }
        }

        if (globalShortcut.isRegistered(electronKey)) {
            return { canRegister: false, error: 'Already registered by another application' }
        }

        // Try to register and immediately unregister to test
        try {
            const registered = globalShortcut.register(electronKey, () => {})
            if (registered) {
                globalShortcut.unregister(electronKey)
                return { canRegister: true }
            } else {
                return { canRegister: false, error: 'System rejected the shortcut' }
            }
        } catch (error) {
            return { canRegister: false, error: error.message }
        }
    }
}

export default ShortcutManager
