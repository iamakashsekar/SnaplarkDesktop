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

            webcam: {
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                skipTaskbar: true,
                movable: true,
                resizable: false,
                hasShadow: false,
                width: 208,
                height: 208,
                show: false,
                focusable: true,
                acceptFirstMouse: true,
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
                width: 800,
                height: 600,
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
        const isVideoRecordingWindow = type.startsWith('recording')
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

        const baseType = isScreenshotWindow ? 'screenshot' : isVideoRecordingWindow ? 'recording' : type
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
        this.loadWindowContent(window, type, options.params)

        window.on('closed', () => {
            // Clean up any intervals when window is closed
            if (window._keepOnTopInterval) {
                clearInterval(window._keepOnTopInterval)
                window._keepOnTopInterval = null
            }
            this.windows.delete(type)
        })

        this.windows.set(type, window)

        // Position webcam window on the specified display if provided
        if (isWebcamWindow && options.displayInfo) {
            const isFullScreen = options.isFullScreen || false
            const selectionRect = options.selectionRect || null

            const display = options.displayInfo.display || options.displayInfo
            const webcamWidth = config.width || 208
            const webcamHeight = config.height || 208
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

            // Ensure window can appear over system UI elements
            // These settings are also applied in applyPlatformSpecificSettings, but set here for immediate effect
            if (process.platform === 'darwin') {
                // On macOS, ensure window appears over menubar and use screen-saver level with higher priority
                window.setAlwaysOnTop(true, 'screen-saver', 2)
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                // Ensure webcam window can receive mouse events
                window.setIgnoreMouseEvents(false)
            } else if (process.platform === 'win32') {
                // On Windows, ensure window appears over taskbar
                window.setSkipTaskbar(true)
                window.setAlwaysOnTop(true, 'floating')
                window.setIgnoreMouseEvents(false)
            }
        }

        if (type !== 'main' && !isSelectionWindow) {
            // Ensure webcam window is brought to front when shown
            if (isWebcamWindow) {
                // Set up interval to keep webcam window on top while it's visible
                const keepOnTopInterval = setInterval(() => {
                    if (window.isDestroyed() || !window.isVisible()) {
                        clearInterval(keepOnTopInterval)
                        return
                    }
                    // Periodically bring webcam window to front and focus to ensure it stays above recording window and can receive mouse events
                    window.moveTop()
                    window.focus()
                }, 1000) // Check every second

                // Store interval reference on window for cleanup
                window._keepOnTopInterval = keepOnTopInterval

                // Ensure webcam window can receive mouse events and is focusable
                window.setIgnoreMouseEvents(false)
                window.setFocusable(true)

                window.show()
                // Bring webcam window to front after showing to ensure it's above recording window
                // Use multiple timeouts to ensure it stays on top even if recording window tries to come forward
                const bringToFront = () => {
                    if (!window.isDestroyed()) {
                        window.moveTop()
                        // Focus webcam window to ensure it can receive mouse events
                        window.focus()
                    }
                }

                // Bring to front immediately and focus to receive mouse events
                setTimeout(bringToFront, 50)
                // Bring to front again after a short delay to handle any focus changes
                setTimeout(bringToFront, 200)
                // One more time to ensure it stays on top
                setTimeout(bringToFront, 500)
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
                // Webcam window should be on top of all other windows including recording
                // Use 'screen-saver' level with a higher window level (2) to ensure it's above recording window (level 1)
                window.setAlwaysOnTop(true, 'screen-saver', 2)
                window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                window.setFullScreenable(false)
                // Ensure webcam window can receive mouse events
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
            // For Windows and Linux, ensure webcam window has higher priority
            if (type === 'webcam') {
                window.setAlwaysOnTop(true, 'floating')
            }
        }
    }

    loadWindowContent(window, type, params = {}) {
        let windowType = type
        if (type.startsWith('screenshot')) {
            windowType = 'screenshot'
        } else if (type.startsWith('recording')) {
            windowType = 'recording'
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
            // Ensure webcam window stays on top of all other windows
            if (type === 'webcam') {
                if (process.platform === 'darwin') {
                    // Use 'screen-saver' level with higher priority (2) to ensure it's above recording window
                    window.setAlwaysOnTop(true, 'screen-saver', 2)
                    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                    // Ensure webcam window can receive mouse events
                    window.setIgnoreMouseEvents(false)
                } else {
                    window.setAlwaysOnTop(true, 'floating')
                    window.setIgnoreMouseEvents(false)
                }

                // Set up interval to keep webcam window on top while it's visible (if not already set)
                if (!window._keepOnTopInterval) {
                    const keepOnTopInterval = setInterval(() => {
                        if (window.isDestroyed() || !window.isVisible()) {
                            clearInterval(keepOnTopInterval)
                            window._keepOnTopInterval = null
                            return
                        }
                        // Periodically bring webcam window to front and focus to ensure it stays above recording window and can receive mouse events
                        window.moveTop()
                        window.focus()
                    }, 1000) // Check every second

                    // Store interval reference on window for cleanup
                    window._keepOnTopInterval = keepOnTopInterval
                }

                // Ensure webcam window can receive mouse events and is focusable
                window.setIgnoreMouseEvents(false)
                window.setFocusable(true)

                window.show()
                // Bring webcam window to front after showing to ensure it's above recording window
                // Use multiple timeouts to ensure it stays on top even if recording window tries to come forward
                const bringToFront = () => {
                    if (!window.isDestroyed()) {
                        window.moveTop()
                        // Focus webcam window to ensure it can receive mouse events
                        window.focus()
                    }
                }

                // Bring to front immediately and focus to receive mouse events
                setTimeout(bringToFront, 50)
                // Bring to front again after a short delay to handle any focus changes
                setTimeout(bringToFront, 200)
                // One more time to ensure it stays on top
                setTimeout(bringToFront, 500)
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

    makeWindowNonBlocking(type, toolbarPosition = null, toolbarSize = null) {
        const window = this.windows.get(type)
        if (window && !window.isDestroyed()) {
            try {
                // Exit kiosk and fullscreen modes
                window.setKiosk(false)
                window.setFullScreen(false)

                // Make window normal (resizable and movable)
                window.setResizable(true)
                window.setMovable(true)

                // Enable shadow for the window
                window.setHasShadow(true)

                // Use toolbar size if provided, otherwise use defaults
                const padding = 10 // Padding to prevent tooltips from being cut off
                const toolbarWidth = toolbarSize ? toolbarSize.width + padding * 2 : 450
                const toolbarHeight = toolbarSize ? toolbarSize.height + padding * 2 : 80

                let x, y

                if (toolbarPosition) {
                    // Position window so that its center matches the toolbar's previous screen position
                    // Window center = window.x + window.width/2, window.y + window.height/2
                    // So: window.x = toolbarScreenX - window.width/2, window.y = toolbarScreenY - window.height/2
                    x = Math.round(toolbarPosition.x - toolbarWidth / 2)
                    y = Math.round(toolbarPosition.y - toolbarHeight / 2)

                    // Find the display that contains the toolbar position
                    const display = screen.getDisplayNearestPoint({ x: toolbarPosition.x, y: toolbarPosition.y })
                    const screenBounds = display.bounds

                    // Ensure window stays within screen bounds
                    x = Math.max(screenBounds.x, Math.min(x, screenBounds.x + screenBounds.width - toolbarWidth))
                    y = Math.max(screenBounds.y, Math.min(y, screenBounds.y + screenBounds.height - toolbarHeight))
                } else {
                    // Fallback: Center the window horizontally, position near top
                    const bounds = window.getBounds()
                    const screenBounds = screen.getDisplayMatching(bounds).bounds
                    x = Math.max(screenBounds.x, screenBounds.x + (screenBounds.width - toolbarWidth) / 2)
                    y = Math.max(screenBounds.y + 20, bounds.y) // Keep current Y or top + margin
                }

                window.setBounds({
                    x: Math.round(x),
                    y: Math.round(y),
                    width: toolbarWidth,
                    height: toolbarHeight
                })

                console.log(
                    'Made window non-blocking',
                    type,
                    toolbarPosition ? 'with toolbar position' : 'centered',
                    toolbarSize ? `size: ${toolbarWidth}x${toolbarHeight}` : ''
                )
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

        ipcMain.handle('make-window-non-blocking', (event, type, toolbarPosition, toolbarSize) => {
            try {
                this.makeWindowNonBlocking(type, toolbarPosition, toolbarSize)
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
