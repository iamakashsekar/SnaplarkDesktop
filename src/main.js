import { app, BrowserWindow, shell, ipcMain, protocol, screen, net, dialog, globalShortcut } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import started from 'electron-squirrel-startup'
import Store from 'electron-store'
import SystemTray from './services/system_tray.js'
import WindowManager from './services/window-manager.js'
import ScreenshotService from './services/screenshot-service.js'
import NotificationService from './services/notification-service.js'
import StoreService from './services/store-service.js'
import { getPersistableDefaults } from './store-defaults.js'

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
let notificationService
let storeService
let currentScreenshotShortcut = null

const createWindow = () => {
    windowManager = new WindowManager(MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME)

    const mainWindow = windowManager.createWindow('main')

    tray = new SystemTray(mainWindow)

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    const welcomeCompleted = store.get('welcomeCompleted')
    if (!welcomeCompleted) {
        windowManager.createWindow('welcome')
    }

    screenshotService = new ScreenshotService(windowManager, store)
    notificationService = new NotificationService(windowManager)
    storeService = new StoreService(windowManager, store)
}

// ==================== GLOBAL SHORTCUTS ====================

const convertHotkeyToElectron = (hotkey) => {
    if (!hotkey || typeof hotkey !== 'string') return null

    // Trim whitespace
    hotkey = hotkey.trim()
    if (!hotkey) return null

    // Convert from our format (Shift + Cmd + S) to Electron format (Shift+Command+S)
    let electronKey = hotkey
        .replace(/\s*\+\s*/g, '+') // Remove spaces around +
        .replace(/Cmd/gi, 'Command') // Convert Cmd to Command (case insensitive)
        .replace(/Ctrl/gi, 'Control') // Convert Ctrl to Control (case insensitive)

    // Handle special key names that Electron expects
    const keyMappings = {
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Enter': 'Return',
        ' ': 'Space'
    }

    // Replace any mapped keys (handle both start and middle of string)
    Object.keys(keyMappings).forEach(key => {
        // Escape special regex characters in the key name
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        // Match key at start, after +, or at end
        const regex = new RegExp(`(^|\\+)${escapedKey}(\\+|$)`, 'gi')
        electronKey = electronKey.replace(regex, `$1${keyMappings[key]}$2`)
    })

    return electronKey
}

const registerScreenshotShortcut = () => {
    const settings = store.get('settings') || {}
    const hotkey = settings.hotkeyScreenshot

    if (!hotkey) {
        console.log('No screenshot hotkey configured')
        // Clear current shortcut if no hotkey is set
        if (currentScreenshotShortcut) {
            globalShortcut.unregister(currentScreenshotShortcut)
            currentScreenshotShortcut = null
        }
        return
    }

    // Unregister previous shortcut if it exists
    if (currentScreenshotShortcut) {
        try {
            globalShortcut.unregister(currentScreenshotShortcut)
            console.log(`Unregistered previous screenshot shortcut: ${currentScreenshotShortcut}`)
        } catch (error) {
            console.error(`Error unregistering previous shortcut:`, error)
        }
        currentScreenshotShortcut = null
    }

    const electronKey = convertHotkeyToElectron(hotkey)
    if (!electronKey) {
        console.error(`Invalid hotkey format: ${hotkey}`)
        return
    }

    // Check if shortcut is already registered
    if (globalShortcut.isRegistered(electronKey)) {
        console.log(`Shortcut ${electronKey} is already registered by another application`)
        // Try to unregister it first (might not work if registered by another app)
        try {
            globalShortcut.unregister(electronKey)
        } catch (error) {
            console.error(`Cannot unregister existing shortcut:`, error)
        }
    }

    try {
        const registered = globalShortcut.register(electronKey, () => {
            console.log(`Screenshot shortcut triggered: ${electronKey}`)
            // Trigger screenshot mode
            if (screenshotService && windowManager) {
                const mainWindow = windowManager.getWindow('main')
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('trigger-screenshot')
                }
            }
        })

        if (registered) {
            currentScreenshotShortcut = electronKey
            console.log(`Successfully registered screenshot shortcut: ${electronKey}`)
            return { success: true, shortcut: electronKey }
        } else {
            console.error(`Failed to register screenshot shortcut: ${electronKey}`)
            return { success: false, error: 'Failed to register shortcut. It may be in use by another application.' }
        }
    } catch (error) {
        console.error(`Error registering screenshot shortcut:`, error)
        return { success: false, error: error.message }
    }
}

const unregisterAllShortcuts = () => {
    globalShortcut.unregisterAll()
    currentScreenshotShortcut = null
    console.log('Unregistered all shortcuts')
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

    // Register global shortcuts after window is created
    registerScreenshotShortcut()

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

    ipcMain.handle('open-external', (event, url) => {
        shell.openExternal(url)
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

    // Shortcut handlers
    ipcMain.handle('update-screenshot-shortcut', async (event, hotkeyValue) => {
        // If hotkeyValue is provided, temporarily update store to ensure consistency
        if (hotkeyValue !== undefined) {
            const settings = store.get('settings') || {}
            settings.hotkeyScreenshot = hotkeyValue
            store.set('settings', settings)
        }
        const result = registerScreenshotShortcut()
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
