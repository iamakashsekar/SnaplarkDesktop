import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'node:path'

class WindowManager {
    constructor(viteDevServerUrl, viteName) {
        this.windows = new Map()
        this.viteDevServerUrl = viteDevServerUrl
        this.viteName = viteName
        this.windowConfigs = this.getWindowConfigs()
        this.setupHandlers()
    }

    // ==================== CONFIGURATION ====================

    getCommonConfig() {
        return {
            frame: false,
            hasShadow: true,
            transparent: true,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            },
            ...(process.platform === 'win32' && {
                backgroundColor: '#00000000',
                titleBarStyle: 'hidden',
                titleBarOverlay: false,
                type: 'toolbar'
            })
        }
    }

    getWindowConfigs() {
        const common = this.getCommonConfig()

        return {
            main: {
                ...common,
                width: 232,
                height: 300,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                roundedCorners: true,
                show: false,
                focusable: true,
                acceptFirstMouse: true,
                fullscreenable: false
            },

            settings: {
                ...common,
                width: 600,
                height: 700,
                resizable: true,
                alwaysOnTop: false,
                skipTaskbar: true,
                title: 'Snaplark Settings',
                show: false,
                modal: false
            },

            welcome: {
                ...common,
                width: 450,
                height: 455,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: false,
                title: 'Welcome to Snaplark',
                show: false,
                modal: false
            },

            tour: {
                width: 600,
                height: 500,
                resizable: false,
                frame: true,
                transparent: false,
                alwaysOnTop: true,
                skipTaskbar: false,
                title: 'Snaplark Tour',
                show: false,
                modal: true
            },

            screenshot: {
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                movable: false,
                resizable: false,
                hasShadow: false,
                show: false,
                enableLargerThanScreen: true,
                fullscreenable: false,
                fullscreen: false,
                kiosk: true,
                focusable: true,
                acceptFirstMouse: true,
                disableAutoHideCursor: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                },
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false
                })
            },


            design: {
                ...common,
                width: 384,
                height: 210,
                resizable: true,
                alwaysOnTop: false,
                skipTaskbar: false,
                title: 'Snaplark Design Workspace',
                show: false,
                modal: false
            },

            notifications: {
                ...common,
                width: 420,
                height: 10,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                show: false,
                focusable: false,
                fullscreenable: false,
                hasShadow: false,
                roundedCorners: true
            }
        }
    }

    // ==================== WINDOW CREATION & LIFECYCLE ====================

    createWindow(type, options = {}) {
        const isScreenshotWindow = type.startsWith('screenshot')

        if (!isScreenshotWindow && this.windows.has(type)) {
            const existingWindow = this.windows.get(type)
            if (!existingWindow.isDestroyed()) {
                existingWindow.show()
                existingWindow.focus()
                return existingWindow
            }
            this.windows.delete(type)
        }

        const baseType = isScreenshotWindow ? 'screenshot' : type
        const config = { ...this.windowConfigs[baseType], ...options }
        const parentWindow = this.windows.get('main') || null

        const window = new BrowserWindow({
            ...config,
            parent: config.modal && parentWindow ? parentWindow : null,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                ...config.webPreferences
            }
        })

        this.applyPlatformSpecificSettings(window, type, isScreenshotWindow, config)
        this.loadWindowContent(window, type, options.params)

        window.on('closed', () => {
            this.windows.delete(type)
        })

        this.windows.set(type, window)

        if (type !== 'main' && !isScreenshotWindow) {
            window.show()
            window.focus()
        }

        return window
    }

    applyPlatformSpecificSettings(window, type, isScreenshotWindow, config) {
        if (process.platform === 'darwin' && config.alwaysOnTop) {
            if (isScreenshotWindow) {
                window.setAlwaysOnTop(true, 'screen-saver')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setFullScreenable(false)
                window.setFocusable(true)
            } else if (type === 'main') {
                window.setAlwaysOnTop(true, 'screen-saver')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setFullScreenable(false)
            } else {
                window.setAlwaysOnTop(true, 'screen-saver')
            }
        }
    }

    loadWindowContent(window, type, params = {}) {
        let windowType = type
        if (type.startsWith('screenshot')) {
            windowType = 'screenshot'
        }
        const urlParams = new URLSearchParams({ window: windowType, ...params })

        if (this.viteDevServerUrl) {
            window.loadURL(`${this.viteDevServerUrl}?${urlParams.toString()}`)
        } else {
            const indexPath = path.join(__dirname, `../renderer/${this.viteName}/index.html`)
            window.loadFile(indexPath, { query: Object.fromEntries(urlParams) })
        }
    }

    closeWindow(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            window.close()
        }
    }

    closeWindowsByType(type) {
        this.windows.forEach((window, key) => {
            if (key.startsWith(type) && !window.isDestroyed()) {
                window.close()
            }
        })
    }

    closeAllWindows() {
        this.windows.forEach((window) => {
            if (!window.isDestroyed()) {
                window.close()
            }
        })
        this.windows.clear()
    }

    // ==================== WINDOW OPERATIONS ====================

    getWindow(type) {
        return this.windows.get(type)
    }

    getAllWindows() {
        return Array.from(this.windows.values()).filter((win) => !win.isDestroyed())
    }

    showWindow(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            window.show()
            window.focus()
        }
        return window
    }

    hideWindow(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            window.hide()
        }
    }

    makeWindowNonBlocking(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            try {
                // Exit kiosk mode if active (check if method exists)
                if (typeof window.isKioskMode === 'function' && window.isKioskMode()) {
                    window.setKioskMode(false)
                }
                // Make window non-focusable so it doesn't steal focus
                window.setFocusable(false)
                console.log(`Made window ${type} non-blocking (non-focusable)`)
            } catch (error) {
                console.error(`Error making window ${type} non-blocking:`, error)
            }
        }
    }

    makeWindowBlocking(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            window.setIgnoreMouseEvents(false)
            window.setFocusable(true)
            console.log(`Made window ${type} blocking`)
        }
    }

    center(type) {
        const window = this.windows.get(type)
        if (window) {
            window.center()
            return { success: true }
        }
        return { success: false, error: `Window ${type} not found` }
    }

    broadcastToAllWindows(channel, data) {
        this.windows.forEach((window, type) => {
            if (!window.isDestroyed()) {
                window.webContents.send(channel, { ...data, windowType: type })
            }
        })
    }

    // ==================== IPC HANDLERS ====================

    setupHandlers() {
        ipcMain.handle('create-window', (event, type, options) => {
            try {
                this.createWindow(type, options)
                return { success: true }
            } catch (error) {
                console.error('Error creating window:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('close-window', (event, type) => {
            try {
                this.closeWindow(type)
                return { success: true }
            } catch (error) {
                console.error('Error closing window:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('close-windows-by-type', (event, type) => {
            try {
                this.closeWindowsByType(type)
                return { success: true }
            } catch (error) {
                console.error('Error closing windows by type:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('show-window', (event, type) => {
            try {
                this.showWindow(type)
                return { success: true }
            } catch (error) {
                console.error('Error showing window:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('hide-window', (event, type) => {
            try {
                this.hideWindow(type)
                return { success: true }
            } catch (error) {
                console.error('Error hiding window:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('make-window-non-blocking', (event, type) => {
            try {
                this.makeWindowNonBlocking(type)
                return { success: true }
            } catch (error) {
                console.error('Error making window non-blocking:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('make-window-blocking', (event, type) => {
            try {
                this.makeWindowBlocking(type)
                return { success: true }
            } catch (error) {
                console.error('Error making window blocking:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('center-window', (event, type) => {
            return this.center(type)
        })

        ipcMain.handle('resize-window', (event, type, width, height) => {
            const window = this.getWindow(type)
            if (window) {
                window.setSize(width, height)
                return { success: true }
            }
            return { success: false, error: `Window ${type} not found` }
        })

        ipcMain.handle('get-window-type', (event) => {
            const webContents = event.sender
            const url = webContents.getURL()
            const urlParams = new URLSearchParams(url.split('?')[1] || '')
            return urlParams.get('window')?.split('#/')[0] || 'main'
        })
    }
}

export default WindowManager
