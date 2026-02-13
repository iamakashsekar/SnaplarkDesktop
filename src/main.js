import {
    app,
    BrowserWindow,
    shell,
    ipcMain,
    protocol,
    screen,
    net,
    dialog,
    globalShortcut,
    systemPreferences,
    clipboard,
} from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import started from 'electron-squirrel-startup'
import { initMain as initAudioLoopback } from 'electron-audio-loopback'

// Initialize audio loopback before app is ready (required by the package)
// Use forceCoreAudioTap for better compatibility on some macOS versions
initAudioLoopback({
    forceCoreAudioTap: true,
    loopbackWithMute: false,
    sourcesOptions: { types: ['screen', 'window'] }
})
import Store from 'electron-store'
import SystemTray from './services/system_tray.js'
import WindowManager from './services/window-manager.js'
import ScreenshotService from './services/screenshot-service.js'
import VideoRecordingService from './services/video-recording-service.js'
import NotificationService from './services/notification-service.js'
import StoreService from './services/store-service.js'
import ShortcutManager from './services/shortcut-manager.js'
import { getPersistableDefaults } from './store-defaults.js'
import { SHORTCUT_DEFINITIONS } from './config/shortcuts.js'
import { updateElectronApp, UpdateSourceType } from 'update-electron-app'


// ==================== CONFIGURATION & INITIALIZATION ====================

const store = new Store({
    defaults: getPersistableDefaults(),
    encryptionKey: "snaplark-encryption-key",
})

if (started) {
    app.quit()
}

// ==================== SINGLE INSTANCE LOCK ====================

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        const mainWindow = windowManager?.getWindow('main')
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
        }

        const url = commandLine.find((arg) => arg.startsWith('snaplark://'))
        if (url) {
            handleProtocolUrl(url)
        }
    })
}

// ==================== PROTOCOL CLIENT SETUP ====================

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('snaplark', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('snaplark')
}

// ==================== GLOBAL STATE ====================

let windowManager
let tray
let screenshotService
let videoRecordingService
let notificationService
let storeService
let shortcutManager

// Cache for tracking when permissions were last granted to force refresh
const permissionGrantTimestamps = {}

const checkAppPermissions = () => {
    if (process.platform !== 'darwin') {
        return {
            allGranted: true,
            statuses: {
                camera: true,
                microphone: true,
                screen: true,
                accessibility: true
            }
        }
    }

    const camera = systemPreferences.getMediaAccessStatus('camera') === 'granted'
    const microphone = systemPreferences.getMediaAccessStatus('microphone') === 'granted'
    const screen = systemPreferences.getMediaAccessStatus('screen') === 'granted'
    const accessibility = systemPreferences.isTrustedAccessibilityClient(false)

    return {
        allGranted: camera && microphone && screen && accessibility,
        statuses: {
            camera,
            microphone,
            screen,
            accessibility
        }
    }
}

const createWindow = () => {
    windowManager = new WindowManager(MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME, store, shortcutManager)

    const mainWindow = windowManager.createWindow('main')

    // Initialize StoreService early so IPC handlers are ready for any window (including permissions)
    storeService = new StoreService(windowManager, store)

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // On macOS, check permissions before initializing services or showing welcome
    if (process.platform === 'darwin') {
        const { allGranted } = checkAppPermissions()
        if (!allGranted) {
            // Close main window or just leave it hidden
            // Show permissions window
            windowManager.createWindow('permissions').show()
            return
        }
    }

    tray = new SystemTray(windowManager)

    // Only auto-show the window if the app was NOT launched at login
    // When launched at login, it should stay hidden until user clicks tray or uses shortcut
    const launchInfo = app.getLoginItemSettings()
    const wasOpenedAtLogin = launchInfo.wasOpenedAtLogin || app.getLoginItemSettings().wasOpenedAsHidden

    if (!wasOpenedAtLogin) {
        // Automatically show main window near tray icon on app startup (manual launches only)
        // Use a longer delay on first launch to allow tray icon to be properly positioned by the OS
        // 500ms provides better reliability across different system loads and configurations
        setTimeout(() => {
            tray.showMainAtTray(null, { force: true, gap: 5 })
        }, 500)
    }

    screenshotService = new ScreenshotService(windowManager, store)
    videoRecordingService = new VideoRecordingService(windowManager, store)
    notificationService = new NotificationService(windowManager)

    // OPTIMIZATION: Pre-capture screens when main window is shown
    // This makes screenshot/recording activation nearly instant
    const triggerPreCapture = () => {
        // Small delay to ensure window is fully visible, then start background capture
        setTimeout(() => {
            screenshotService?.preCaptureScreens()
            videoRecordingService?.preCaptureScreens()
        }, 100)
    }

    mainWindow.on('show', triggerPreCapture)
    mainWindow.on('focus', triggerPreCapture)
}

// ==================== GLOBAL SHORTCUTS ====================

/**
 * Register a shortcut from store settings using ShortcutManager
 * @param {string} shortcutId - The shortcut ID from SHORTCUT_DEFINITIONS
 */
const registerShortcutFromStore = (shortcutId) => {
    const definition = SHORTCUT_DEFINITIONS[shortcutId]
    if (!definition) {
        console.error(`[Main] Shortcut definition not found: ${shortcutId}`)
        return { success: false, error: 'Shortcut definition not found' }
    }

    const settings = store.get('settings') || {}
    const hotkey = settings[definition.storeKey]

    if (!hotkey) {
        console.log(`[Main] No hotkey configured for ${shortcutId}`)
        // Unregister if no hotkey is set
        if (shortcutManager && shortcutManager.isRegistered(definition.id)) {
            shortcutManager.unregister(definition.id)
        }
        return { success: true, message: 'No hotkey configured' }
    }

    // Determine the action based on the shortcut type
    let action
    switch (definition.id) {
        case 'screenshot':
            action = () => {
                if (screenshotService && windowManager) {
                    const mainWindow = windowManager.getWindow('main')
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('trigger-screenshot')
                    }
                }
            }
            break
        case 'recording':
            action = () => {
                if (videoRecordingService && windowManager) {
                    const mainWindow = windowManager.getWindow('main')
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('trigger-video-recording')
                    }
                }
            }
            break
        case 'startStopRecording':
            action = () => {
                if (!windowManager) return

                // Find all recording windows (they have keys like 'recording-1', 'recording-2', etc.)
                let foundRecordingWindow = false

                for (const [type, win] of windowManager.windows.entries()) {
                    if (type.startsWith('recording-') && !win.isDestroyed()) {
                        foundRecordingWindow = true
                        try {
                            win.webContents.send('trigger-start-stop-recording')
                            console.log(`[Main] Sent start/stop trigger to recording window: ${type}`)
                        } catch (error) {
                            console.error(`[Main] Error sending start/stop trigger to ${type}:`, error)
                        }
                    }
                }

                if (!foundRecordingWindow) {
                    console.log('[Main] No active recording windows found for start/stop shortcut')
                }
            }
            break
        case 'toggleMicrophone':
            action = () => {
                if (!windowManager) return

                let foundRecordingWindow = false

                for (const [type, win] of windowManager.windows.entries()) {
                    if (type.startsWith('recording-') && !win.isDestroyed()) {
                        foundRecordingWindow = true
                        try {
                            win.webContents.send('trigger-toggle-microphone')
                            console.log(`[Main] Sent toggle microphone trigger to recording window: ${type}`)
                        } catch (error) {
                            console.error(`[Main] Error sending toggle microphone trigger to ${type}:`, error)
                        }
                    }
                }

                if (!foundRecordingWindow) {
                    console.log('[Main] No active recording windows found for microphone toggle shortcut')
                }
            }
            break
        case 'toggleWebcam':
            action = () => {
                if (!windowManager) return

                let foundRecordingWindow = false

                for (const [type, win] of windowManager.windows.entries()) {
                    if (type.startsWith('recording-') && !win.isDestroyed()) {
                        foundRecordingWindow = true
                        try {
                            win.webContents.send('trigger-toggle-webcam')
                            console.log(`[Main] Sent toggle webcam trigger to recording window: ${type}`)
                        } catch (error) {
                            console.error(`[Main] Error sending toggle webcam trigger to ${type}:`, error)
                        }
                    }
                }

                if (!foundRecordingWindow) {
                    console.log('[Main] No active recording windows found for webcam toggle shortcut')
                }
            }
            break
        case 'quickMenu':
            action = () => {
                if (windowManager) {
                    const mainWindow = windowManager.getWindow('main')
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('trigger-quick-menu')
                    }
                }
            }
            break
        case 'upload':
            action = () => {
                const screenshotWindow = windowManager?.getWindow('screenshot')
                if (screenshotWindow && screenshotWindow.webContents) {
                    screenshotWindow.webContents.send('trigger-upload')
                    console.log('[Main] Triggered upload action')
                }
            }
            break
        case 'copy':
            action = () => {
                const screenshotWindow = windowManager?.getWindow('screenshot')
                if (screenshotWindow && screenshotWindow.webContents) {
                    screenshotWindow.webContents.send('trigger-copy')
                    console.log('[Main] Triggered copy action')
                }
            }
            break
        case 'save':
            action = () => {
                const screenshotWindow = windowManager?.getWindow('screenshot')
                if (screenshotWindow && screenshotWindow.webContents) {
                    screenshotWindow.webContents.send('trigger-save')
                    console.log('[Main] Triggered save action')
                }
            }
            break
        default:
            console.error(`[Main] Unknown shortcut action for: ${definition.id}`)
            return { success: false, error: 'Unknown shortcut action' }
    }

    // Register the shortcut
    const result = shortcutManager.register({
        id: definition.id,
        hotkey,
        action,
        type: definition.type,
        windowId: definition.windowId,
        description: definition.description
    })

    return result
}

/**
 * Register all shortcuts from store
 */
const registerAllShortcuts = () => {
    if (!shortcutManager) {
        console.error('[Main] ShortcutManager not initialized')
        return
    }

    // Register all defined shortcuts, checking availability for global ones
    Object.keys(SHORTCUT_DEFINITIONS).forEach((key) => {
        const definition = SHORTCUT_DEFINITIONS[key]
        const result = registerShortcutFromStore(key)

        // If a global shortcut failed to register (taken by another app),
        // clear it from the store so the UI shows it as unset
        if (definition.type === 'global' && result && !result.success && result.error) {
            console.warn(`[Main] Global shortcut "${definition.id}" unavailable: ${result.error}. Clearing from store.`)
            const settings = store.get('settings') || {}
            settings[definition.storeKey] = ''
            store.set('settings', settings)
        }
    })
}

/**
 * Unregister all shortcuts
 */
const unregisterAllShortcuts = () => {
    if (shortcutManager) {
        shortcutManager.unregisterAll()
    }
    console.log('[Main] Unregistered all shortcuts')
}

// ==================== AUTO UPDATER ====================
// Setup auto-updater using native autoUpdater module
const setupAutoUpdater = () => {
    updateElectronApp({
        updateSource: {
            type: UpdateSourceType.StaticStorage,
            baseUrl: `https://snaplark.com/api/v1/updates/${process.platform}/${process.arch}`
        }
    })
}
// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
    setupAutoUpdater()
    setupProtocolHandlers()
    setupIPCHandlers()

    // Set launch at startup based on stored settings (only works in packaged app)
    if (app.isPackaged) {
        try {
            app.setLoginItemSettings({
                openAtLogin: store.get('settings.launchAtStartup'),
                openAsHidden: true
            })
        } catch (error) {
            console.error('[Main] Failed to set login item settings:', error)
        }
    }

    if (process.platform === 'darwin') {
        app.dock.hide()
    }

    // Initialize ShortcutManager before creating windows
    shortcutManager = new ShortcutManager(store)

    createWindow()

    // Register all global shortcuts after window is created
    registerAllShortcuts()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', () => {
    // Unregister all shortcuts when app is about to quit
    unregisterAllShortcuts()
})

// ==================== PROTOCOL HANDLERS ====================

function setupProtocolHandlers() {
    protocol.handle('screenshot-image', (request) => {
        try {
            const url = request.url.replace(/^screenshot-image:\/\//, '')
            const decodedPath = decodeURIComponent(url)
            const filePath = path.normalize(decodedPath)
            return net.fetch(`file://${filePath}`)
        } catch (error) {
            console.error('Failed to handle screenshot-image protocol request', error)
            return new Response('File not found', { status: 404 })
        }
    })

    // Register protocol to serve local video files
    protocol.registerFileProtocol('local-video', (request, callback) => {
        const url = request.url.replace('local-video://', '')
        const decodedPath = decodeURIComponent(url)
        callback({ path: decodedPath })
    })
}

// ==================== IPC HANDLERS ====================

function setupIPCHandlers() {
    // System handlers
    ipcMain.on('quit-app', () => {
        app.quit()
    })

    ipcMain.handle('get-device-name', () => {
        return os.hostname()
    })

    ipcMain.handle('get-app-version', () => {
        return app.getVersion()
    })

    ipcMain.handle('open-external', (event, url) => {
        shell.openExternal(url)
    })

    ipcMain.handle('show-item-in-folder', (event, filePath) => {
        shell.showItemInFolder(filePath)
    })

    ipcMain.handle('write-to-clipboard', (event, text) => {
        clipboard.writeText(text)
        return { success: true }
    })

    // File system handlers
    ipcMain.handle('read-file-as-buffer', async (event, filePath) => {
        try {
            const allowedDir = os.homedir()
            if (!path.resolve(filePath).startsWith(path.resolve(allowedDir))) {
                throw new Error('File access is restricted to the user home directory.')
            }

            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath)
            }
            throw new Error(`File not found at path: ${filePath}`)
        } catch (error) {
            console.error('Error reading file in main process:', error)
            throw error
        }
    })

    // Dialog handlers
    ipcMain.handle('dialog:openDirectory', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        })
        return result
    })

    // Permission handlers
    app.on('web-contents-created', (event, webContents) => {
        webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
            console.log(`Permission requested: ${permission}`)
            // Allow camera and microphone permissions
            if (permission === 'media' || permission === 'camera' || permission === 'microphone') {
                console.log(`Granting ${permission} permission`)
                callback(true)
            } else {
                callback(false)
            }
        })
    })

    // Shortcut handlers
    // Validate a shortcut before assignment
    ipcMain.handle('validate-shortcut', async (event, storeKey, hotkeyValue) => {
        if (!shortcutManager) {
            return { valid: false, error: 'Shortcut manager not initialized' }
        }

        // Find the shortcut definition
        const shortcutEntry = Object.entries(SHORTCUT_DEFINITIONS).find(([, def]) => def.storeKey === storeKey)
        if (!shortcutEntry) {
            return { valid: false, error: 'Shortcut not found' }
        }

        const [, definition] = shortcutEntry

        // Validate the hotkey
        const validation = shortcutManager.validateHotkey(hotkeyValue, definition.type, definition.id)

        return validation
    })

    // Check all shortcuts for conflicts
    ipcMain.handle('check-all-shortcuts', async () => {
        if (!shortcutManager) {
            return { success: false, error: 'Shortcut manager not initialized' }
        }

        const settings = store.get('settings') || {}
        const shortcuts = {}

        // Check each defined shortcut
        for (const [key, definition] of Object.entries(SHORTCUT_DEFINITIONS)) {
            const hotkey = settings[definition.storeKey]
            if (!hotkey) continue

            const electronKey = shortcutManager.convertHotkeyToElectron(hotkey)
            shortcuts[definition.storeKey] = {
                hotkey,
                electronKey,
                description: definition.description,
                isValid: true,
                error: null
            }

            // Check if it's registered and working
            if (definition.type === 'global') {
                const registered = shortcutManager.isRegistered(definition.id)
                if (!registered) {
                    shortcuts[definition.storeKey].isValid = false
                    shortcuts[definition.storeKey].error = 'Not registered'
                }
            }
        }

        return { success: true, shortcuts }
    })

    // Generic shortcut update handler
    ipcMain.handle('update-shortcut', async (event, storeKey, hotkeyValue) => {
        console.log(`[Main] Updating shortcut: ${storeKey} = ${hotkeyValue}`)

        if (!shortcutManager) {
            return { success: false, error: 'Shortcut manager not initialized' }
        }

        // Find the corresponding shortcut definition
        const shortcutEntry = Object.entries(SHORTCUT_DEFINITIONS).find(([, def]) => def.storeKey === storeKey)

        if (!shortcutEntry) {
            console.error(`[Main] No shortcut definition found for store key: ${storeKey}`)
            return { success: false, error: 'Shortcut not found' }
        }

        const [shortcutKey, definition] = shortcutEntry

        // Validate the hotkey first
        const validation = shortcutManager.validateHotkey(hotkeyValue, definition.type, definition.id)
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                duplicate: validation.duplicate
            }
        }

        // Update store
        if (hotkeyValue !== undefined) {
            const settings = store.get('settings') || {}
            settings[storeKey] = hotkeyValue
            store.set('settings', settings)
        }

        // Register the shortcut
        const result = registerShortcutFromStore(shortcutKey)

        if (!result || !result.success) {
            // Rollback the store change if registration failed
            const settings = store.get('settings') || {}
            const previousValue = settings[storeKey]
            if (previousValue !== hotkeyValue) {
                settings[storeKey] = previousValue
                store.set('settings', settings)
            }
        }

        return result || { success: true }
    })

    // Tray handlers
    ipcMain.handle('show-main-at-tray', (event, options = {}) => {
        try {
            if (tray && typeof tray.showMainAtTray === 'function') {
                tray.showMainAtTray(null, options)
                return { success: true }
            }
            return { success: false, error: 'Tray not initialized' }
        } catch (error) {
            console.error('Error showing main at tray:', error)
            return { success: false, error: error.message }
        }
    })

    // Connectivity handlers
    ipcMain.on('connectivity-status', (event, data) => {
        console.log(`[Main] Connectivity status received: ${data.status} (${data.isOnline ? 'Online' : 'Offline'})`)

        if (data.status === 'online') {
            console.log('[Main] App is online - can perform network operations')
        } else if (data.status === 'offline') {
            console.log('[Main] App is offline - pausing network operations')
        }

        windowManager.broadcastToAllWindows('connectivity-event', {
            type: 'status-update',
            ...data
        })
    })
    // Permission Management Handlers
    ipcMain.handle('check-system-permissions', async () => {
        // Add a small delay to ensure macOS has updated its permission state
        await new Promise(resolve => setTimeout(resolve, 100))
        const permissions = checkAppPermissions().statuses
        console.log('[Main] Current permissions status:', permissions)

        // Check if we recently granted permissions and force an optimistic update
        const now = Date.now()
        for (const [permId, timestamp] of Object.entries(permissionGrantTimestamps)) {
            // If permission was granted in the last 10 seconds, consider it granted even if API says otherwise
            if (now - timestamp < 10000 && !permissions[permId]) {
                console.log(`[Main] Permission ${permId} was recently granted (${now - timestamp}ms ago), forcing granted status`)
                permissions[permId] = true
            }
        }

        return permissions
    })

    ipcMain.handle('focus-permissions-window', async () => {
        try {
            const permissionsWindow = windowManager?.getWindow('permissions')
            if (permissionsWindow) {
                if (permissionsWindow.isMinimized()) {
                    permissionsWindow.restore()
                }
                permissionsWindow.show()
                permissionsWindow.focus()

                // On macOS, ensure the app is brought to front
                if (process.platform === 'darwin') {
                    app.focus({ steal: true })
                }

                console.log('[Main] Permissions window focused')
                return true
            }
            return false
        } catch (error) {
            console.error('[Main] Error focusing permissions window:', error)
            return false
        }
    })

    ipcMain.handle('request-system-permission', async (event, permissionId) => {
        if (process.platform !== 'darwin') return true

        console.log(`[Main] Requesting permission for: ${permissionId}`)

        // Store reference to permissions window for refocusing
        const permissionsWindow = windowManager?.getWindow('permissions')

        const focusPermissionsWindow = async () => {
            if (permissionsWindow && !permissionsWindow.isDestroyed()) {
                // Wait a bit for the system dialog to close
                await new Promise(resolve => setTimeout(resolve, 500))

                if (permissionsWindow.isMinimized()) {
                    permissionsWindow.restore()
                }
                permissionsWindow.show()
                permissionsWindow.focus()

                // On macOS, ensure the app is brought to front
                if (process.platform === 'darwin') {
                    app.focus({ steal: true })
                }

                console.log('[Main] Refocused permissions window')
            }
        }

        const markPermissionGranted = (permId) => {
            permissionGrantTimestamps[permId] = Date.now()
            console.log(`[Main] Marked ${permId} as recently granted`)
        }

        if (permissionId === 'camera' || permissionId === 'microphone') {
            const mediaType = permissionId
            const status = systemPreferences.getMediaAccessStatus(mediaType)
            console.log(`[Main] ${mediaType} status before request: ${status}`)

            if (status === 'not-determined') {
                try {
                    const granted = await systemPreferences.askForMediaAccess(mediaType)
                    console.log(`[Main] ${mediaType} permission granted: ${granted}`)

                    if (granted) {
                        markPermissionGranted(permissionId)
                    }

                    // Refocus the permissions window
                    await focusPermissionsWindow()

                    // Wait for the system to register the permission
                    await new Promise(resolve => setTimeout(resolve, 800))

                    const newStatus = systemPreferences.getMediaAccessStatus(mediaType)
                    console.log(`[Main] ${mediaType} status after request: ${newStatus}`)

                    return granted
                } catch (error) {
                    console.error(`[Main] Error requesting ${mediaType} permission:`, error)
                    await focusPermissionsWindow()
                    return false
                }
            } else if (status === 'granted') {
                console.log(`[Main] ${mediaType} already granted`)
                markPermissionGranted(permissionId)
                return true
            } else if (status === 'denied' || status === 'restricted') {
                console.log(`[Main] ${mediaType} denied/restricted, opening System Settings`)
                const privacyType = permissionId === 'camera' ? 'Privacy_Camera' : 'Privacy_Microphone'
                await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${privacyType}`)
                await focusPermissionsWindow()
                return false
            }
        } else if (permissionId === 'screen') {
            const status = systemPreferences.getMediaAccessStatus('screen')
            console.log(`[Main] Screen recording status before request: ${status}`)

            if (status === 'granted') {
                console.log('[Main] Screen recording already granted')
                markPermissionGranted(permissionId)
                return true
            }

            // Always try to trigger the permission dialog first
            try {
                console.log('[Main] Attempting to trigger screen recording permission dialog...')
                const { desktopCapturer } = require('electron')

                // Create a hidden browser window to trigger the permission
                const permissionWindow = new BrowserWindow({
                    show: false,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                })

                // This will trigger the screen recording permission dialog
                const sources = await desktopCapturer.getSources({
                    types: ['screen', 'window'],
                    thumbnailSize: { width: 150, height: 150 }
                })

                permissionWindow.destroy()

                console.log(`[Main] Desktop capturer returned ${sources.length} sources`)

                // Refocus the permissions window
                await focusPermissionsWindow()

                // Wait for the system to register the permission
                await new Promise(resolve => setTimeout(resolve, 1000))

                const newStatus = systemPreferences.getMediaAccessStatus('screen')
                console.log(`[Main] Screen recording status after request: ${newStatus}`)

                if (newStatus === 'granted') {
                    markPermissionGranted(permissionId)
                    return true
                }

                // If still not granted, open System Settings
                console.log('[Main] Screen recording not granted, opening System Settings')
            } catch (error) {
                console.error('[Main] Error triggering screen capture permission:', error)
            }

            // Open System Settings for manual permission grant
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            await focusPermissionsWindow()
            return false
        } else if (permissionId === 'accessibility') {
            const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
            console.log(`[Main] Accessibility trusted: ${isTrusted}`)

            if (isTrusted) {
                markPermissionGranted(permissionId)
                return true
            }

            // Prompt for accessibility access
            systemPreferences.isTrustedAccessibilityClient(true)

            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
            await focusPermissionsWindow()
            return false
        }

        return false
    })

    ipcMain.handle('relaunch-app', () => {
        app.relaunch()
        app.quit()
    })
}

// ==================== DEEP LINK HANDLERS ====================

const handleProtocolUrl = (url) => {
    console.log('Protocol URL received:', url)

    if (url.startsWith('snaplark://auth')) {
        try {
            const urlObj = new URL(url)
            const params = new URLSearchParams(urlObj.search)

            const authData = {
                access_token: params.get('access_token')
            }

            const mainWindow = windowManager.getWindow('main')
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('auth-response', authData)
            }
        } catch (error) {
            console.error('Error parsing auth URL:', error)
            const mainWindow = windowManager.getWindow('main')
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('auth-response', {
                    error: 'Invalid auth response'
                })

                if (mainWindow.isMinimized()) {
                    mainWindow.restore()
                }
                mainWindow.show()
                mainWindow.focus()
            }
        }
    }
}

app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
})

if (process.argv.length >= 2) {
    const url = process.argv.find((arg) => arg.startsWith('snaplark://'))
    if (url) {
        app.whenReady().then(() => {
            setTimeout(() => handleProtocolUrl(url), 1000)
        })
    }
}
