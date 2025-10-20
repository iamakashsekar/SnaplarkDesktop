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
                height: 300,
                resizable: false,
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                roundedCorners: true,
                show: false,
                focusable: true,
                acceptFirstMouse: true,
                fullscreenable: false,
                autoHideMenuBar: true,
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false,
                    type: 'toolbar'
                })
            },
            settings: {
                width: 600,
                height: 700,
                resizable: true,
                frame: false,
                transparent: true,
                alwaysOnTop: false,
                skipTaskbar: true,
                title: 'Snaplark Settings',
                show: false,
                modal: false,
                autoHideMenuBar: true,
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false,
                    type: 'toolbar'
                })
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
                modal: false,
                autoHideMenuBar: true,
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false,
                    type: 'toolbar'
                })
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
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false
                }),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            },
            design: {
                width: 384,
                height: 210,
                resizable: true,
                frame: false,
                transparent: true,
                alwaysOnTop: false,
                skipTaskbar: false,
                title: 'Snaplark Design Workspace',
                show: false,
                modal: false,
                autoHideMenuBar: true,
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false,
                    type: 'toolbar'
                }),
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
                autoHideMenuBar: true,
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false,
                    type: 'toolbar'
                }),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            },
            recording: {
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
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false
                }),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            },
            'recording-preview': {
                width: 1200,
                height: 800,
                resizable: true,
                frame: false,
                transparent: true,
                alwaysOnTop: false,
                skipTaskbar: false,
                title: 'Video Preview',
                show: false,
                modal: false,
                autoHideMenuBar: true,
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false,
                    type: 'toolbar'
                }),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            }
        }
    }

    createWindow(type, options = {}) {
        // For screenshot and recording windows, allow multiple instances
        const isScreenshotWindow = type.startsWith('screenshot')
        const isRecordingWindow = type.startsWith('recording') && !type.includes('preview')

        if (!isScreenshotWindow && !isRecordingWindow && this.windows.has(type)) {
            // If window already exists and it's not a screenshot window, focus it
            const existingWindow = this.windows.get(type)
            if (!existingWindow.isDestroyed()) {
                existingWindow.show()
                existingWindow.focus()
                return existingWindow
            } else {
                this.windows.delete(type)
            }
        }

        // Get base config for screenshot and recording windows
        let baseType = type
        if (isScreenshotWindow) baseType = 'screenshot'
        if (isRecordingWindow) baseType = 'recording'

        const config = { ...this.windowConfigs[baseType], ...options }
        const parentWindow = this.windows.get('main') || null

        // Create the browser window
        console.log(`Creating window of type "${type}" with config:`, {
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height,
            isScreenshot: isScreenshotWindow,
            isRecording: isRecordingWindow
        })

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
            if (isScreenshotWindow || isRecordingWindow) {
                // For screenshot and recording windows, use highest level to appear above fullscreen apps
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

        if (type !== 'main' && !isScreenshotWindow && !isRecordingWindow) {
            // Show the window immediately after creation (except for screenshot and recording windows)
            window.show()
            window.focus()
        }

        return window
    }

    loadWindowContent(window, type, params = {}) {
        // For screenshot and recording windows, use appropriate window type for routing
        let windowType = type
        if (type.startsWith('screenshot')) windowType = 'screenshot'
        if (type.startsWith('recording') && !type.includes('preview')) windowType = 'recording'

        const urlParams = new URLSearchParams({ window: windowType, ...params })

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
