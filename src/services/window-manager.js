import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'node:path'
import { WINDOW_TITLES, WINDOW_DIMENSIONS } from '../config/window-config.js'

class WindowManager {
    constructor(viteDevServerUrl, viteName, store = null, shortcutManager = null) {
        this.windows = new Map()
        this.viteDevServerUrl = viteDevServerUrl
        this.viteName = viteName
        this.store = store
        this.shortcutManager = shortcutManager
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

        // Check if user is logged in by checking for auth token
        const isLoggedIn = this.store ? !!this.store.get('auth_token') : false
        const mainDimensions = isLoggedIn ? WINDOW_DIMENSIONS.main : WINDOW_DIMENSIONS.login

        return {
            main: {
                ...common,
                width: mainDimensions.width,
                height: mainDimensions.height,
                minWidth: WINDOW_DIMENSIONS.main.width,
                minHeight: WINDOW_DIMENSIONS.main.height,
                resizable: true,
                alwaysOnTop: false,
                skipTaskbar: true,
                roundedCorners: true,
                show: false,
                focusable: true,
                acceptFirstMouse: true,
                fullscreenable: false
            },

            settings: {
                ...common,
                width: WINDOW_DIMENSIONS.settings.width,
                height: WINDOW_DIMENSIONS.settings.height,
                resizable: false,
                alwaysOnTop: false,
                skipTaskbar: false,
                title: WINDOW_TITLES.settings,
                show: false,
                modal: false,
                frame: false,
                titleBarStyle: 'hidden',
                ...(process.platform === 'darwin' && {
                    trafficLightPosition: { x: 18, y: 18 }
                }),
                ...(process.platform === 'win32' && {
                    titleBarOverlay: {
                        color: '#ffffff',
                        symbolColor: '#334155',
                        height: 48
                    }
                }),
                transparent: false
            },

            welcome: {
                ...common,
                width: WINDOW_DIMENSIONS.welcome.width,
                height: WINDOW_DIMENSIONS.welcome.height,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: false,
                title: WINDOW_TITLES.welcome,
                show: false,
                modal: false
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

            'recording-overlay': {
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
                fullscreen: false, // will manually set bounds
                focusable: false, // Don't steal focus
                acceptFirstMouse: false,
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

            webcam: {
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                movable: true,
                resizable: false,
                hasShadow: false,
                width: WINDOW_DIMENSIONS.webcam.width,
                height: WINDOW_DIMENSIONS.webcam.height,
                show: false,
                focusable: false,
                acceptFirstMouse: false,
                fullscreenable: false,
                enableLargerThanScreen: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    experimentalFeatures: false,
                    permissions: ['camera', 'microphone']
                },
                ...(process.platform === 'win32' && {
                    backgroundColor: '#00000000',
                    titleBarStyle: 'hidden',
                    titleBarOverlay: false
                })
            },

            design: {
                ...common,
                width: WINDOW_DIMENSIONS.design.width,
                height: WINDOW_DIMENSIONS.design.height,
                resizable: true,
                alwaysOnTop: false,
                skipTaskbar: false,
                show: false,
                modal: false
            },

            notifications: {
                ...common,
                width: WINDOW_DIMENSIONS.notifications.width,
                height: WINDOW_DIMENSIONS.notifications.height,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                show: false,
                focusable: true,
                fullscreenable: false,
                hasShadow: false,
                roundedCorners: true
            },

            permissions: {
                ...common,
                width: WINDOW_DIMENSIONS.permissions.width,
                height: WINDOW_DIMENSIONS.permissions.height,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: false,
                title: WINDOW_TITLES.permissions,
                show: false,
                modal: false,
                frame: false,
                titleBarStyle: 'hidden',
                focusable: true,
                acceptFirstMouse: true,
                ...(process.platform === 'darwin' && {
                    trafficLightPosition: { x: 18, y: 18 }
                }),
                ...(process.platform === 'win32' && {
                    titleBarOverlay: {
                        color: '#ffffff',
                        symbolColor: '#334155',
                        height: 48
                    }
                }),
                transparent: false
            },

            update: {
                ...common,
                width: WINDOW_DIMENSIONS.update.width,
                height: WINDOW_DIMENSIONS.update.height,
                resizable: false,
                alwaysOnTop: true,
                skipTaskbar: false,
                title: WINDOW_TITLES.update,
                show: false,
                modal: false,
                focusable: true,
                acceptFirstMouse: true
            }
        }
    }

    // ==================== WINDOW CREATION & LIFECYCLE ====================

    createWindow(type, options = {}) {
        const isScreenshotWindow = type.startsWith('screenshot')
        const isRecordingOverlay = type.includes('recording-overlay')
        const isVideoRecordingWindow = type.startsWith('recording') && !isRecordingOverlay
        const isWebcamWindow = type === 'webcam'
        const isSelectionWindow = isScreenshotWindow || isVideoRecordingWindow

        if (!isSelectionWindow && !isWebcamWindow && this.windows.has(type)) {
            const existingWindow = this.windows.get(type)
            if (!existingWindow.isDestroyed()) {
                existingWindow.show()
                existingWindow.focus()
                return existingWindow
            }
            this.windows.delete(type)
        }

        // If it's a recording overlay, we treat it as a separate type so it doesn't get caught in the
        // "isSelectionWindow" logic (which suppresses showing) and uses the correct config.
        const baseType = isScreenshotWindow
            ? 'screenshot'
            : isVideoRecordingWindow
                ? 'recording'
                : isRecordingOverlay
                    ? 'recording-overlay'
                    : type
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

        this.applyPlatformSpecificSettings(window, type, isSelectionWindow, config)

        if (isVideoRecordingWindow) {
            window.setContentProtection(true)
        }

        this.loadWindowContent(window, type, options.params)

        if (type === 'main') {
            window.on('blur', () => {
                if (!window.webContents.isDevToolsOpened()) {
                    window.hide()
                }
            })
        }

        window.on('closed', () => {
            this.windows.delete(type)
        })

        this.windows.set(type, window)

        // Register local shortcuts for screenshot windows once they're ready
        if (isScreenshotWindow && this.shortcutManager) {
            window.webContents.once('did-finish-load', () => {
                this.shortcutManager.registerLocalShortcutsForWindow('screenshot')
            })
        }

        // Position webcam window on the specified display if provided
        if (isWebcamWindow && options.displayInfo) {
            const isFullScreen = options.isFullScreen || false
            const selectionRect = options.selectionRect || null

            const display = options.displayInfo.display || options.displayInfo
            const webcamWidth = config.width || WINDOW_DIMENSIONS.webcam.width
            const webcamHeight = config.height || WINDOW_DIMENSIONS.webcam.height
            const margin = 20

            let x, y

            if (isFullScreen) {
                x = display.bounds.x + display.bounds.width - webcamWidth - margin
                y = display.bounds.y + display.bounds.height - webcamHeight - margin
                console.log('Full x', x)
                console.log('Full y', y)
            } else {
                console.log('selectionRect', selectionRect)

                // Calculate position relative to display bounds + selectionRect offset
                x = display.bounds.x + selectionRect.left + selectionRect.width - webcamWidth - margin
                y = display.bounds.y + selectionRect.top + selectionRect.height - webcamHeight - margin

                console.log('Custom x', x)
                console.log('Custom y', y)
            }

            window.setBounds({
                x,
                y,
                width: webcamWidth,
                height: webcamHeight
            })

            if (process.platform === 'darwin') {
                window.setAlwaysOnTop(true, 'screen-saver', 2)
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setIgnoreMouseEvents(false)
            } else if (process.platform === 'win32') {
                window.setSkipTaskbar(true)
                window.setAlwaysOnTop(true, 'floating')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setIgnoreMouseEvents(false)
            }
        }

        if (type !== 'main' && !isSelectionWindow) {
            if (isWebcamWindow) {
                window.setIgnoreMouseEvents(false)
                window.show()
            } else if (isRecordingOverlay && options.displayInfo) {
                // Position overlay to cover the entire display
                const display = options.displayInfo.display || options.displayInfo
                window.setBounds({
                    x: display.bounds.x,
                    y: display.bounds.y,
                    width: display.bounds.width,
                    height: display.bounds.height
                })

                // Ensure it's on top but doesn't steal focus
                window.setAlwaysOnTop(true, 'screen-saver')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setIgnoreMouseEvents(true, { forward: true })

                // Exclude from recordings/screenshots (macOS/Windows)
                window.setContentProtection(true)

                window.showInactive() // Show without focusing
            } else {
                window.show()
                window.focus()
            }
        }

        return window
    }

    applyPlatformSpecificSettings(window, type, isSelectionWindow, config) {
        if (process.platform === 'darwin' && config.alwaysOnTop) {
            if (type === 'webcam') {
                window.setAlwaysOnTop(true, 'screen-saver', 2)
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setFullScreenable(false)
                window.setIgnoreMouseEvents(false)
            } else if (isSelectionWindow) {
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
        } else if (config.alwaysOnTop) {
            if (type === 'webcam') {
                window.setAlwaysOnTop(true, 'floating')
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            }
        }
    }

    loadWindowContent(window, type, params = {}) {
        let windowType = type
        if (type.startsWith('screenshot')) {
            windowType = 'screenshot'
        } else if (type.startsWith('recording')) {
            windowType = 'recording'
            // Map recording-overlay to its own window type in router
            if (type.includes('recording-overlay')) {
                windowType = 'recording-overlay'
            }
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

    getCurrentWindowDisplayInfo(webContents) {
        // Find the window that owns this webContents
        let currentWindow = null
        for (const [type, win] of this.windows.entries()) {
            if (!win.isDestroyed() && win.webContents === webContents) {
                currentWindow = win
                break
            }
        }

        if (!currentWindow) {
            return null
        }

        // Get window bounds
        const bounds = currentWindow.getBounds()
        const centerPoint = {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2
        }

        // Find which display this window is on
        const display = screen.getDisplayNearestPoint(centerPoint)
        return {
            display,
            bounds,
            displayId: display.id
        }
    }

    showWindow(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            if (type === 'webcam') {
                if (process.platform === 'darwin') {
                    window.setAlwaysOnTop(true, 'screen-saver', 2)
                    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                    window.setIgnoreMouseEvents(false)
                } else {
                    window.setAlwaysOnTop(true, 'floating')
                    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                    window.setIgnoreMouseEvents(false)
                }
                window.show()
            } else {
                window.show()
                window.focus()
            }
        }
        return window
    }

    hideWindow(type) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            window.hide()
        }
    }

    makeWindowNonBlocking(type, toolbarPosition = null, toolbarDimensions = null) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            try {
                // Exit kiosk and fullscreen modes
                window.setKiosk(false)
                window.setFullScreen(false)

                // Make window normal (resizable and movable)
                window.setResizable(false)
                window.setMovable(true)

                // Enable shadow for the window
                // window.setHasShadow(true)

                const bounds = window.getBounds()

                // Positioning rules:
                // - If both position (center) and dimensions are provided, place window so its center
                //   stays exactly where the toolbar was on the fullscreen selection window.
                // - Otherwise, fall back to current bounds to avoid jumps.
                let nextX = bounds.x
                let nextY = bounds.y
                let nextWidth = bounds.width
                let nextHeight = bounds.height

                if (toolbarDimensions?.width && toolbarDimensions?.height) {
                    nextWidth = Math.round(toolbarDimensions.width)
                    nextHeight = Math.round(toolbarDimensions.height)
                }

                if (toolbarPosition?.x !== undefined && toolbarPosition?.y !== undefined) {
                    if (toolbarDimensions?.width && toolbarDimensions?.height) {
                        nextX = Math.round(toolbarPosition.x - nextWidth / 2)
                        nextY = Math.round(toolbarPosition.y - nextHeight / 2)
                    } else {
                        // If we only have a position, treat it as the top-left to preserve behavior
                        nextX = Math.round(toolbarPosition.x)
                        nextY = Math.round(toolbarPosition.y)
                    }
                }

                window.setBounds({
                    x: nextX,
                    y: nextY,
                    width: nextWidth,
                    height: nextHeight
                })
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

        ipcMain.handle('make-window-non-blocking', (event, type, toolbarPosition, toolbarDimensions) => {
            try {
                this.makeWindowNonBlocking(type, toolbarPosition, toolbarDimensions)
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

        ipcMain.handle('set-ignore-mouse-events', (event, ignore, options) => {
            const window = BrowserWindow.fromWebContents(event.sender)
            if (window) {
                window.setIgnoreMouseEvents(ignore, options)
                return { success: true }
            }
            return { success: false, error: 'Window not found' }
        })

        ipcMain.handle('resize-window', (event, type, width, height) => {
            const window = this.getWindow(type)
            if (window) {
                // Temporarily set minimum size to allow shrinking
                window.setMinimumSize(width, height)
                window.setSize(width, height, true)
                return { success: true }
            }
            return { success: false, error: `Window ${type} not found` }
        })

        ipcMain.handle('move-window', (event, type, x, y) => {
            const window = this.getWindow(type)
            if (window) {
                window.setPosition(Math.round(x), Math.round(y))
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

        ipcMain.handle('get-window', (event, type) => {
            const window = this.getWindow(type)
            return window && !window.isDestroyed() ? { exists: true } : { exists: false }
        })

        ipcMain.handle('get-current-window-display-info', (event) => {
            try {
                const info = this.getCurrentWindowDisplayInfo(event.sender)
                if (!info) {
                    return { success: false, error: 'Could not determine current window display' }
                }
                return {
                    success: true,
                    displayId: info.displayId,
                    display: {
                        id: info.display.id,
                        bounds: info.display.bounds,
                        workArea: info.display.workArea,
                        scaleFactor: info.display.scaleFactor
                    },
                    windowBounds: info.bounds
                }
            } catch (error) {
                console.error('Error getting current window display info:', error)
                return { success: false, error: error.message }
            }
        })
    }
}

export default WindowManager
