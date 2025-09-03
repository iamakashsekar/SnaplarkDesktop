import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

class WindowManager {
    constructor(viteDevServerUrl, viteName) {
        this.windows = new Map()
        this.viteDevServerUrl = viteDevServerUrl
        this.viteName = viteName
        this.windowConfigs = {
            main: {
                width: 264,
                height: 800,
                resizable: false,
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                roundedCorners: true,
                show: false,
                focusable: true,
                acceptFirstMouse: true,
                fullscreenable: false
            },
            settings: {
                width: 800,
                height: 600,
                resizable: true,
                frame: true,
                transparent: false,
                alwaysOnTop: false,
                skipTaskbar: false,
                title: 'Snaplark Settings',
                show: false,
                modal: true
            },
            welcome: {
                width: 450,
                height: 455,
                resizable: false,
                frame: false,
                transparent: true,
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
                kiosk: false,
                focusable: true,
                acceptFirstMouse: true,
                disableAutoHideCursor: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            },
            design: {
                width: 1200,
                height: 800,
                resizable: true,
                frame: false,
                transparent: true,
                alwaysOnTop: false,
                skipTaskbar: false,
                title: 'Snaplark Design Workspace',
                show: false,
                modal: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            },
            notifications: {
                width: 420,
                height: 10,
                resizable: false,
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                show: false,
                focusable: false,
                fullscreenable: false,
                hasShadow: false,
                roundedCorners: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            }
        }
    }

    createWindow(type, options = {}) {
        if (this.windows.has(type)) {
            // If window already exists, focus it
            const existingWindow = this.windows.get(type)
            if (!existingWindow.isDestroyed()) {
                existingWindow.show()
                existingWindow.focus()
                return existingWindow
            } else {
                this.windows.delete(type)
            }
        }

        const config = { ...this.windowConfigs[type], ...options }
        const parentWindow = this.windows.get('main') || null

        // Create the browser window
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

        // Set macOS specific properties
        if (process.platform === 'darwin' && config.alwaysOnTop) {
            if (type === 'screenshot') {
                // For screenshot windows, use highest level to appear above fullscreen apps
                window.setAlwaysOnTop(true, 'screen-saver')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setFullScreenable(false)
                // Prevent window from stealing focus when shown
                window.setFocusable(true)
            } else if (type === 'main') {
                // For main window, allow it to appear above fullscreen apps but don't auto-focus
                window.setAlwaysOnTop(true, 'screen-saver')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setFullScreenable(false)
            } else {
                window.setAlwaysOnTop(true, 'screen-saver')
            }
        }

        // Load the app with window type parameter
        this.loadWindowContent(window, type, options.params)

        // Handle window closed
        window.on('closed', () => {
            this.windows.delete(type)
        })

        // Store the window
        this.windows.set(type, window)

        if (type !== 'main') {
            // Show the window immediately after creation
            window.show()
            window.focus()
        }

        return window
    }

    loadWindowContent(window, type, params = {}) {
        const urlParams = new URLSearchParams({ window: type, ...params })

        if (this.viteDevServerUrl) {
            window.loadURL(`${this.viteDevServerUrl}?${urlParams.toString()}`)
        } else {
            const indexPath = path.join(__dirname, `../renderer/${this.viteName}/index.html`)
            window.loadFile(indexPath, { query: Object.fromEntries(urlParams) })
        }
    }

    getWindow(type) {
        return this.windows.get(type)
    }

    closeWindow(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            window.close()
        }
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

    getAllWindows() {
        return Array.from(this.windows.values()).filter((win) => !win.isDestroyed())
    }

    closeAllWindows() {
        this.windows.forEach((window, type) => {
            if (!window.isDestroyed()) {
                window.close()
            }
        })
        this.windows.clear()
    }

    broadcastToAllWindows(channel, data) {
        this.windows.forEach((window, type) => {
            if (!window.isDestroyed()) {
                window.webContents.send(channel, { ...data, windowType: type })
            }
        })
    }

    center(type) {
        const window = this.windows.get(type)
        if (window) {
            window.center()
            return { success: true }
        }
        return { success: false, error: `Window ${type} not found` }
    }

    closeWindowsByType(type) {
        this.windows.forEach((window, key) => {
            if (key.startsWith(type) && !window.isDestroyed()) {
                window.close()
            }
        })
    }
}

export default WindowManager
