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
    clipboard
} from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import started from 'electron-squirrel-startup'
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
    defaults: getPersistableDefaults()
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
    windowManager = new WindowManager(MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME)

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
        setTimeout(() => {
            tray.showMainAtTray(null, { force: true, gap: 5 })
        }, 200)
    }

    // const welcomeCompleted = store.get('welcomeCompleted')
    // if (!welcomeCompleted) {
    //     windowManager.createWindow('welcome')
    // }

    screenshotService = new ScreenshotService(windowManager, store)
    videoRecordingService = new VideoRecordingService(windowManager, store)
    notificationService = new NotificationService(windowManager)
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

    // Register all defined shortcuts
    Object.keys(SHORTCUT_DEFINITIONS).forEach((key) => {
        registerShortcutFromStore(key)
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
    // Only enable auto-updater in production
    if (!app.isPackaged) {
        console.log('Development mode - auto-updater disabled')
        return
    }

    updateElectronApp({
        updateSource: {
            type: UpdateSourceType.StaticStorage,
            baseUrl: `https://usc1.contabostorage.com/main-storage/releases/${process.platform}/${process.arch}`
        }
    })
}
// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
    setupProtocolHandlers()
    setupIPCHandlers()

    // Set launch at startup based on stored settings
    try {
        app.setLoginItemSettings({
            openAtLogin: store.get('settings.launchAtStartup'),
            openAsHidden: true
        })
    } catch (error) {
        console.error('Failed to set login item settings:', error)
    }

    if (process.platform === 'darwin') {
        app.dock.hide()
    }

    createWindow()

    // Initialize ShortcutManager
    shortcutManager = new ShortcutManager(store)

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
    // Generic shortcut update handler
    ipcMain.handle('update-shortcut', async (event, storeKey, hotkeyValue) => {
        console.log(`[Main] Updating shortcut: ${storeKey} = ${hotkeyValue}`)

        // Update store
        if (hotkeyValue !== undefined) {
            const settings = store.get('settings') || {}
            settings[storeKey] = hotkeyValue
            store.set('settings', settings)
        }

        // Find the corresponding shortcut definition
        const shortcutEntry = Object.entries(SHORTCUT_DEFINITIONS).find(([, def]) => def.storeKey === storeKey)

        if (!shortcutEntry) {
            console.error(`[Main] No shortcut definition found for store key: ${storeKey}`)
            return { success: false, error: 'Shortcut not found' }
        }

        const [shortcutKey] = shortcutEntry
        const result = registerShortcutFromStore(shortcutKey)
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
    ipcMain.handle('check-system-permissions', () => {
        return checkAppPermissions().statuses
    })

    ipcMain.handle('request-system-permission', async (event, permissionId) => {
        if (process.platform !== 'darwin') return true

        console.log(`[Main] Requesting permission for: ${permissionId}`)

        if (permissionId === 'camera' || permissionId === 'microphone') {
            const mediaType = permissionId
            const status = systemPreferences.getMediaAccessStatus(mediaType)
            console.log(`[Main] ${mediaType} status: ${status}`)
            
            if (status === 'not-determined') {
                const granted = await systemPreferences.askForMediaAccess(mediaType)
                console.log(`[Main] ${mediaType} permission granted: ${granted}`)
                return granted
            } else if (status === 'granted') {
                return true
            } else if (status === 'denied' || status === 'restricted') {
                const privacyType = permissionId === 'camera' ? 'Privacy_Camera' : 'Privacy_Microphone'
                await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${privacyType}`)
                return false
            }
        } else if (permissionId === 'screen') {
            const status = systemPreferences.getMediaAccessStatus('screen')
            console.log(`[Main] Screen recording status: ${status}`)
            
            if (status === 'granted') {
                return true
            }
            
            if (status === 'not-determined') {
                try {
                    const { desktopCapturer } = require('electron')
                    await desktopCapturer.getSources({ 
                        types: ['screen'], 
                        thumbnailSize: { width: 1, height: 1 } 
                    })
                    
                    await new Promise(resolve => setTimeout(resolve, 500))
                    const newStatus = systemPreferences.getMediaAccessStatus('screen')
                    console.log(`[Main] Screen recording new status: ${newStatus}`)
                    
                    if (newStatus === 'granted') {
                        return true
                    }
                } catch (error) {
                    console.error('[Main] Error triggering screen capture:', error)
                }
            }
            
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            return false
        } else if (permissionId === 'accessibility') {
            const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
            console.log(`[Main] Accessibility trusted: ${isTrusted}`)
            
            if (isTrusted) {
                return true
            }
            
            systemPreferences.isTrustedAccessibilityClient(true)
            
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
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
