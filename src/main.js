import { app, BrowserWindow, shell, ipcMain, screen, desktopCapturer, protocol, clipboard, dialog } from 'electron'
import path from 'node:path'
import os from 'node:os'
import started from 'electron-squirrel-startup'
import SystemTray from './services/system_tray.js'
import Store from 'electron-store'
import WindowManager from './services/window-manager.js'
import fs from 'node:fs'

const store = new Store({
    // encryptionKey: "snaplark-encryption-key",
})

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
    app.quit()
}

// Ensure a single instance on Windows and Linux
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead and handle the protocol URL
        const mainWindow = windowManager?.getWindow('main')
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
        }

        // Handle protocol URL from the command line
        const url = commandLine.find((arg) => arg.startsWith('snaplark://'))
        if (url) {
            handleProtocolUrl(url)
        }
    })
}

// Set the app as the default protocol handler for 'snaplark://' links
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('snaplark', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('snaplark')
}

let windowManager
let tray
// Removed screenPollInterval - now using event-driven display tracking
let lastNotificationsDisplayId = null

async function takeScreenshotForDisplay(source, type, bounds, display) {
    const scaleFactor = display.scaleFactor || 1
    const image = source.thumbnail

    if (type === 'area' && bounds) {
        return image.crop({
            x: Math.round(bounds.x * scaleFactor),
            y: Math.round(bounds.y * scaleFactor),
            width: Math.round(bounds.width * scaleFactor),
            height: Math.round(bounds.height * scaleFactor)
        })
    }

    return image
}

/**
 * Finds the correct desktopCapturer source for a given Electron screen display object.
 * This is necessary because the `display_id` from desktopCapturer can be inconsistent
 * across different platforms and versions, especially on macOS and Linux.
 * @param {Electron.Display} display The display object from `screen.getDisplayNearestPoint()`.
 * @returns {Promise<Electron.DesktopCapturerSource | null>} The matching source or null.
 */
async function findSourceForDisplay(display) {
    if (!display) return null

    const displayIdStr = display.id.toString()
    const scaleFactor = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
            width: Math.round(display.size.width * scaleFactor),
            height: Math.round(display.size.height * scaleFactor)
        },
        fetchWindowIcons: false
    })

    if (sources.length === 0) return null

    // Method 1: Exact display ID match (most reliable when it works).
    let source = sources.find((s) => s.display_id === displayIdStr)
    if (source) return source

    // Method 2: If exact match fails, try position-based matching.
    const displays = screen.getAllDisplays()
    if (sources.length === displays.length) {
        const sortedDisplays = [...displays].sort((a, b) => {
            if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y
            return a.bounds.x - b.bounds.x
        })
        const sortedSources = [...sources].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

        const targetIndex = sortedDisplays.findIndex((d) => d.id === display.id)
        if (targetIndex !== -1 && sortedSources[targetIndex]) {
            return sortedSources[targetIndex]
        }
    }

    // Method 3: As a last resort, fallback to the first available source.
    console.error(`Could not reliably find screen source for displayId: ${display.id}. Falling back to first source.`)
    return sources[0]
}

const createWindow = () => {
    // Initialize window manager
    windowManager = new WindowManager(MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME)

    // Create the main window
    const mainWindow = windowManager.createWindow('main')

    // Setup system tray icon
    tray = new SystemTray(mainWindow)

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url) // Open URL in user's browser.
        return { action: 'deny' } // Prevent the app from opening the URL.
    })

    mainWindow.once('ready-to-show', () => {
        // mainWindow.show();
    })

    // Check if the welcome tour has been completed and show the welcome window if not.
    const welcomeCompleted = store.get('welcomeCompleted')
    if (!welcomeCompleted) {
        windowManager.createWindow('welcome')
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // Register a custom protocol to safely load local image files
    protocol.registerFileProtocol('screenshot-image', (request, callback) => {
        try {
            const url = request.url.replace(/^screenshot-image:\/\//, '')
            const decodedPath = decodeURIComponent(url)
            callback({ path: path.normalize(decodedPath) })
        } catch (error) {
            console.error('Failed to handle screenshot-image protocol request', error)
        }
    })

    if (process.platform === 'darwin') {
        app.dock.hide()
    }

    // Handle quit command
    ipcMain.on('quit-app', () => {
        app.quit()
    })

    // Handle getting device name/hostname
    ipcMain.handle('get-device-name', () => {
        return os.hostname()
    })

    // Handle reading a file from a given path and returning it as a Buffer
    ipcMain.handle('read-file-as-buffer', async (event, filePath) => {
        try {
            // Basic security check: ensure the path is within an expected directory
            // to prevent path traversal attacks. For this app, allowing from home is reasonable.
            const allowedDir = os.homedir()
            if (!path.resolve(filePath).startsWith(path.resolve(allowedDir))) {
                throw new Error('File access is restricted to the user home directory.')
            }

            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath) // Returns a Buffer
            }
            throw new Error(`File not found at path: ${filePath}`)
        } catch (error) {
            console.error('Error reading file in main process:', error)
            throw error // The renderer's try/catch will handle this rejection.
        }
    })

    // Handle window resize requests
    ipcMain.handle('resize-window', (event, type, width, height) => {
        const mainWindow = windowManager.getWindow(type)
        if (mainWindow) {
            mainWindow.setContentSize(width, height, true)
        }
    })

    // Show main window at tray icon position (programmatic trigger)
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

    ipcMain.handle('start-screenshot-mode', async () => {
        try {
            // Hide the main window before starting screenshot mode
            const mainWindow = windowManager.getWindow('main')
            if (mainWindow) {
                mainWindow.hide()
            }

            // A short delay to allow the window to disappear.
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Close any existing screenshot windows
            windowManager.closeWindowsByType('screenshot')

            // Get all available displays
            const allDisplays = screen.getAllDisplays()
            console.log(`Found ${allDisplays.length} display(s)`)

            // Create screenshots and windows for each display
            const screenshotPromises = allDisplays.map(async (display) => {
                try {
                    // Get screenshot source for this display
                    const source = await findSourceForDisplay(display)
                    if (!source) {
                        console.error(`Could not find screen source for displayId: ${display.id}`)
                        return null
                    }

                    // Take screenshot of this display
                    const image = await takeScreenshotForDisplay(source, 'fullscreen', null, display)
                    const dataURL = image.toDataURL()

                    // Determine initial mouse position for this display
                    const cursorPos = screen.getCursorScreenPoint()
                    const mouseX = cursorPos.x - display.bounds.x
                    const mouseY = cursorPos.y - display.bounds.y

                    return {
                        display,
                        dataURL,
                        mouseX: Math.max(0, Math.min(mouseX, display.bounds.width)),
                        mouseY: Math.max(0, Math.min(mouseY, display.bounds.height))
                    }
                } catch (error) {
                    console.error(`Error processing display ${display.id}:`, error)
                    return null
                }
            })

            // Wait for all screenshots to complete
            const screenshotResults = await Promise.all(screenshotPromises)
            const validResults = screenshotResults.filter((result) => result !== null)

            if (validResults.length === 0) {
                console.error('No valid displays found for screenshot')
                return { success: false, error: 'No displays available' }
            }

            // Determine initial active display before creating windows
            const initialCursorPos = screen.getCursorScreenPoint()
            const initialActiveDisplay = screen.getDisplayNearestPoint(initialCursorPos)

            // Create windows for each display
            const windows = validResults.map(({ display, dataURL, mouseX, mouseY }, index) => {
                // Create unique window type for each display to avoid conflicts
                const windowType = `screenshot-${display.id}`

                console.log(`Creating window ${windowType} for display ${display.id}:`, {
                    bounds: display.bounds,
                    primary: display.primary
                })

                const win = windowManager.createWindow(windowType, {
                    ...display.bounds,
                    x: display.bounds.x,
                    y: display.bounds.y,
                    width: display.bounds.width,
                    height: display.bounds.height,
                    params: {
                        displayId: display.id,
                        initialMouseX: mouseX,
                        initialMouseY: mouseY
                    }
                })

                console.log(`Window ${windowType} created successfully`)

                // Store the screenshot data for this specific window
                win.screenshotData = dataURL
                win.displayInfo = display

                // Ensure window is positioned correctly on the target display
                win.setBounds({
                    x: display.bounds.x,
                    y: display.bounds.y,
                    width: display.bounds.width,
                    height: display.bounds.height
                })

                // Set up handler for this specific window's magnifier data
                const handlerKey = `get-initial-magnifier-data-${display.id}`
                ipcMain.handleOnce(handlerKey, (event) => {
                    if (event.sender === win.webContents) {
                        return dataURL
                    }
                    return null
                })

                // Platform-specific settings
                if (process.platform === 'darwin') {
                    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                    win.setAlwaysOnTop(true, 'screen-saver', 1)
                } else if (process.platform === 'win32') {
                    // Windows-specific settings to ensure window stays above taskbar and other apps
                    win.setAlwaysOnTop(true, 'screen-saver')
                    win.setSkipTaskbar(true)

                    // For Windows secondary monitors, don't use kiosk mode - it causes issues
                    // Instead, use manual positioning and sizing
                    if (display.primary) {
                        // Primary monitor can use kiosk mode safely
                        win.setKiosk(true)
                    } else {
                        // Secondary monitors: use fullscreen window positioned correctly
                        win.setFullScreen(false) // Ensure it's not fullscreen first
                        win.setBounds({
                            x: display.bounds.x,
                            y: display.bounds.y,
                            width: display.bounds.width,
                            height: display.bounds.height
                        })
                        // Force the window to fill the entire screen area
                        win.setResizable(false)
                        win.setMovable(false)
                    }
                }

                // Determine if this window should be initially active
                const isInitiallyActive = display.id === initialActiveDisplay.id

                // Set up initial activation when window is ready
                win.webContents.once('did-finish-load', () => {
                    const activationData = {
                        isActive: isInitiallyActive,
                        activeDisplayId: initialActiveDisplay.id,
                        mouseX: initialCursorPos.x - display.bounds.x,
                        mouseY: initialCursorPos.y - display.bounds.y
                    }
                    win.webContents.send('display-activation-changed', activationData)
                    console.log(`Initial activation sent to window ${windowType}:`, activationData.isActive)
                })

                // Explicitly show the window
                win.show()

                // Additional Windows-specific fixes
                if (process.platform === 'win32') {
                    // Force window to front and ensure it stays there
                    win.focus()
                    win.moveTop()
                    // Ensure window captures all input
                    win.setAlwaysOnTop(true, 'screen-saver')

                    // Additional delay to ensure window is properly positioned on secondary monitor
                    setTimeout(() => {
                        if (!win.isDestroyed()) {
                            win.focus()
                            win.moveTop()
                        }
                    }, 200)
                }

                console.log(`Window ${windowType} shown on display ${display.id}`)

                // Clean up handler when window closes
                win.on('closed', () => {
                    ipcMain.removeHandler(handlerKey)
                })

                return win
            })

            // Set up global mouse tracking to manage which window is active
            let currentActiveDisplayId = initialActiveDisplay.id
            let mouseTrackingInterval = null

            const updateActiveWindow = (force = false) => {
                const cursorPos = screen.getCursorScreenPoint()
                const activeDisplay = screen.getDisplayNearestPoint(cursorPos)

                if (force || currentActiveDisplayId !== activeDisplay.id) {
                    currentActiveDisplayId = activeDisplay.id

                    // Notify all windows about the active display change
                    windows.forEach((win) => {
                        if (!win.isDestroyed() && win.webContents) {
                            const isActive = win.displayInfo.id === activeDisplay.id
                            const activationData = {
                                isActive,
                                activeDisplayId: activeDisplay.id,
                                mouseX: cursorPos.x - win.displayInfo.bounds.x,
                                mouseY: cursorPos.y - win.displayInfo.bounds.y
                            }

                            // Send immediately if ready, or queue for when ready
                            if (win.webContents.isLoading()) {
                                win.webContents.once('did-finish-load', () => {
                                    win.webContents.send('display-activation-changed', activationData)
                                })
                            } else {
                                win.webContents.send('display-activation-changed', activationData)
                            }
                        }
                    })
                }
            }

            // Start mouse tracking with reduced frequency (every 100ms)
            mouseTrackingInterval = setInterval(updateActiveWindow, 100)

            // Set initial active window with multiple attempts to ensure delivery
            setTimeout(() => updateActiveWindow(true), 100)
            setTimeout(() => updateActiveWindow(true), 300)
            setTimeout(() => updateActiveWindow(true), 500)

            // Clean up when any screenshot window closes
            const originalCleanup = () => {
                if (mouseTrackingInterval) {
                    clearInterval(mouseTrackingInterval)
                    mouseTrackingInterval = null
                }
            }

            windows.forEach((win) => {
                win.on('closed', originalCleanup)
            })

            console.log(`Created ${windows.length} screenshot window(s)`)
            return {
                success: true,
                displayCount: allDisplays.length,
                windowCount: windows.length
            }
        } catch (error) {
            console.error('Error starting screenshot mode:', error)
            return { success: false, error: error.message }
        }
    })

    // Handle copy screenshot to clipboard
    ipcMain.handle('copy-screenshot', async (event, type, bounds, displayId) => {
        try {
            // Hide the screenshot overlay window to exclude it from the capture
            const senderWindow = BrowserWindow.fromWebContents(event.sender)
            if (senderWindow) {
                senderWindow.hide()
            }

            // A short delay to allow the window to disappear.
            await new Promise((resolve) => setTimeout(resolve, 200))

            // Get all displays
            const displays = screen.getAllDisplays()
            const primaryDisplay = screen.getPrimaryDisplay()

            // Defensively handle null displayId by defaulting to the primary display
            const displayIdStr = (displayId ?? primaryDisplay.id).toString()

            const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

            const source = await findSourceForDisplay(targetDisplay)

            if (!source) {
                throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
            }

            // Get the image using the same logic as saving
            const image = await takeScreenshotForDisplay(source, type, bounds, targetDisplay)

            // Copy image to clipboard
            clipboard.writeImage(image)

            // Cleanup screenshot mode
            // No longer needed - using event-driven display tracking
            windowManager.closeWindowsByType('screenshot')

            return { success: true, message: 'Screenshot copied to clipboard' }
        } catch (error) {
            console.error('Copy screenshot error:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.on('cancel-screenshot-mode', () => {
        console.log('cancel-screenshot-mode called')
        // No longer needed - using event-driven display tracking
        windowManager.closeWindowsByType('screenshot')
    })

    // ==================== VIDEO RECORDING HANDLERS ====================

    ipcMain.handle('start-recording-mode', async () => {
        try {
            const mainWindow = windowManager.getWindow('main')
            if (mainWindow) {
                mainWindow.hide()
            }

            await new Promise((resolve) => setTimeout(resolve, 100))

            windowManager.closeWindowsByType('recording')

            const allDisplays = screen.getAllDisplays()
            console.log(`Found ${allDisplays.length} display(s) for recording`)

            const recordingPromises = allDisplays.map(async (display) => {
                try {
                    const source = await findSourceForDisplay(display)
                    if (!source) {
                        console.error(`Could not find screen source for displayId: ${display.id}`)
                        return null
                    }

                    const image = await takeScreenshotForDisplay(source, 'fullscreen', null, display)
                    const dataURL = image.toDataURL()

                    const cursorPos = screen.getCursorScreenPoint()
                    let mouseX = cursorPos.x - display.bounds.x
                    let mouseY = cursorPos.y - display.bounds.y
                    mouseX = Math.max(0, Math.min(mouseX, display.bounds.width))
                    mouseY = Math.max(0, Math.min(mouseY, display.bounds.height))

                    const timestamp = Date.now()
                    const windowType = `recording-${display.id}-${timestamp}`
                    const win = windowManager.createWindow(windowType, {
                        x: display.bounds.x,
                        y: display.bounds.y,
                        width: display.bounds.width,
                        height: display.bounds.height,
                        params: {
                            displayId: display.id,
                            timestamp: timestamp,
                            initialMouseX: mouseX,
                            initialMouseY: mouseY
                        }
                    })

                    console.log(`Recording window ${windowType} created successfully`)

                    win.screenshotData = dataURL
                    win.displayInfo = display

                    win.setBounds({
                        x: display.bounds.x,
                        y: display.bounds.y,
                        width: display.bounds.width,
                        height: display.bounds.height
                    })

                    const handlerKey = `get-initial-magnifier-data-${display.id}-${timestamp}`
                    ipcMain.handleOnce(handlerKey, (event) => {
                        if (event.sender === win.webContents) {
                            return dataURL
                        }
                        return null
                    })

                    if (process.platform === 'darwin') {
                        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                        win.setAlwaysOnTop(true, 'screen-saver', 1)
                    } else if (process.platform === 'win32') {
                        win.setAlwaysOnTop(true, 'screen-saver')
                        win.setSkipTaskbar(true)

                        if (display.primary) {
                            win.setKiosk(true)
                        } else {
                            win.setFullScreen(true)
                        }
                    }

                    win.once('ready-to-show', () => {
                        win.show()
                        win.focus()
                    })

                    return { success: true, displayId: display.id, windowType }
                } catch (error) {
                    console.error(`Error creating recording window for display ${display.id}:`, error)
                    return null
                }
            })

            const results = await Promise.all(recordingPromises)
            const successfulWindows = results.filter((r) => r !== null)

            if (successfulWindows.length === 0) {
                throw new Error('Failed to create any recording windows')
            }

            return { success: true, windows: successfulWindows }
        } catch (error) {
            console.error('Error starting recording mode:', error)
            windowManager.closeWindowsByType('recording')
            return { success: false, error: error.message }
        }
    })

    ipcMain.on('cancel-recording-mode', () => {
        console.log('cancel-recording-mode called')
        windowManager.closeWindowsByType('recording')
    })

    ipcMain.handle('save-recording', async (event, options) => {
        try {
            const { filename, buffer } = options

            const homeDir = os.homedir()
            const recordingsDir = path.join(
                homeDir,
                process.platform === 'darwin' ? 'Movies/Snaplark' : 'Videos/Snaplark'
            )

            if (!fs.existsSync(recordingsDir)) {
                fs.mkdirSync(recordingsDir, { recursive: true })
            }

            const filepath = path.join(recordingsDir, filename)
            const bufferData = Buffer.from(buffer)
            fs.writeFileSync(filepath, bufferData)

            const { size } = fs.statSync(filepath)

            windowManager.closeWindowsByType('recording')

            return {
                success: true,
                filepath: filepath,
                filename: filename,
                size: size
            }
        } catch (error) {
            console.error('Save recording error:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('close-other-recording-windows', async (event, currentDisplayId) => {
        try {
            windowManager.windows.forEach((window, key) => {
                if (key.startsWith('recording-') && !window.isDestroyed()) {
                    if (window.displayInfo && window.displayInfo.id !== currentDisplayId) {
                        window.close()
                    }
                }
            })
            return { success: true }
        } catch (error) {
            console.error('Error closing other recording windows:', error)
            return { success: false, error: error.message }
        }
    })

    // Handle screenshot capture (temporarily saves for processing, e.g., OCR)
    ipcMain.handle('take-screenshot', async (event, type, bounds, displayId, closeWindow) => {
        try {
            if (closeWindow) {
                const senderWindow = BrowserWindow.fromWebContents(event.sender)
                if (senderWindow) {
                    senderWindow.hide()
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 200))

            const displays = screen.getAllDisplays()
            const primaryDisplay = screen.getPrimaryDisplay()
            const displayIdStr = (displayId ?? primaryDisplay.id).toString()
            const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

            const source = await findSourceForDisplay(targetDisplay)
            if (!source) {
                throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
            }

            const image = await takeScreenshotForDisplay(source, type, bounds, targetDisplay)

            const homeDir = os.homedir()
            const screenshotsDir = path.join(
                homeDir,
                process.platform === 'darwin' ? 'Pictures/Snaplark' : 'Pictures/Snaplark'
            )

            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true })
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
            const filename = `Screenshot_${timestamp}.png`
            const filepath = path.join(screenshotsDir, filename)

            const imageBuffer = image.toPNG()
            fs.writeFileSync(filepath, imageBuffer)

            // Get file size in bytes
            const { size } = fs.statSync(filepath)

            // No longer needed - using event-driven display tracking
            if (closeWindow) {
                windowManager.closeWindowsByType('screenshot')
            }

            return {
                success: true,
                path: filepath,
                dataUrl: image.toDataURL(),
                filename: filename,
                size: size // in bytes
                // image: image
            }
        } catch (error) {
            console.error('Screenshot error:', error)
            return { success: false, error: error.message }
        }
    })

    // Handle save screenshot with dialog
    ipcMain.handle('save-screenshot-with-dialog', async (event, options) => {
        try {
            const { type, bounds, displayId, defaultFilename, dataUrl } = options

            // Hide all screenshot windows before capturing/showing dialog
            const screenshotWindows = []
            windowManager.windows.forEach((window, key) => {
                if (key.startsWith('screenshot-') && !window.isDestroyed()) {
                    screenshotWindows.push(window)
                    window.hide()
                }
            })

            // Wait for windows to disappear
            await new Promise((resolve) => setTimeout(resolve, 200))

            let imageBuffer

            // If dataUrl is provided (edited image), use it directly
            if (dataUrl) {
                const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
                imageBuffer = Buffer.from(base64Data, 'base64')
            } else {
                // Otherwise, capture a fresh screenshot (for non-edited images)
                const displays = screen.getAllDisplays()
                const primaryDisplay = screen.getPrimaryDisplay()
                const displayIdStr = (displayId ?? primaryDisplay.id).toString()
                const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

                const source = await findSourceForDisplay(targetDisplay)
                if (!source) {
                    throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
                }

                const image = await takeScreenshotForDisplay(source, type, bounds, targetDisplay)
                imageBuffer = image.toPNG()
            }

            const homeDir = os.homedir()
            const defaultPath = path.join(
                homeDir,
                process.platform === 'darwin' ? 'Pictures' : 'Pictures',
                defaultFilename
            )

            const result = await dialog.showSaveDialog({
                title: 'Save Screenshot',
                defaultPath: defaultPath,
                filters: [
                    { name: 'PNG Image', extensions: ['png'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['createDirectory', 'showOverwriteConfirmation']
            })

            if (result.canceled || !result.filePath) {
                // User canceled, show the screenshot windows again
                screenshotWindows.forEach((window) => {
                    if (!window.isDestroyed()) {
                        window.show()
                    }
                })
                return { success: false, canceled: true }
            }

            // Save the image buffer
            fs.writeFileSync(result.filePath, imageBuffer)

            // Get file size in bytes
            const { size } = fs.statSync(result.filePath)

            // Close all screenshot windows after successful save
            windowManager.closeWindowsByType('screenshot')

            return {
                success: true,
                path: result.filePath,
                filename: path.basename(result.filePath),
                size: size
            }
        } catch (error) {
            console.error('Save screenshot with dialog error:', error)
            // Show the screenshot windows again on error
            windowManager.windows.forEach((window, key) => {
                if (key.startsWith('screenshot-') && !window.isDestroyed()) {
                    window.show()
                }
            })
            return { success: false, error: error.message }
        }
    })

    // Handle opening external URLs
    ipcMain.handle('open-external', (event, url) => {
        shell.openExternal(url)
    })

    // Notifications positioning helper
    const positionNotificationsWindow = (win) => {
        if (!win || win.isDestroyed()) return
        const referencePoint = screen.getCursorScreenPoint()
        const display = screen.getDisplayNearestPoint(referencePoint)
        lastNotificationsDisplayId = display.id

        const margin = 16
        const { width, height } = win.getBounds()
        const workArea = display.workArea

        let x = workArea.x + workArea.width - width - margin
        let y

        if (process.platform === 'darwin') {
            // macOS: top-right
            y = workArea.y + margin
        } else {
            // Windows/Linux: bottom-right
            y = workArea.y + workArea.height - height - margin
        }

        win.setBounds({ x, y, width, height })
    }

    // Show/Add notification from any renderer
    ipcMain.handle('notify', (event, notification) => {
        try {
            const win = windowManager.getWindow('notifications') || windowManager.createWindow('notifications')

            // macOS: keep above full screen
            if (process.platform === 'darwin') {
                win.setAlwaysOnTop(true, 'screen-saver')
                win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            }

            // Ensure correct initial position
            positionNotificationsWindow(win)
            if (typeof win.showInactive === 'function') {
                win.showInactive()
            } else {
                win.show()
            }

            // Send notification immediately if window is ready, otherwise wait for ready event
            if (win.webContents.isLoadingMainFrame()) {
                win.webContents.once('did-finish-load', () => {
                    // Small delay to ensure Vue component is mounted
                    setTimeout(() => {
                        win.webContents.send('notifications:add', notification)
                    }, 100)
                })
            } else {
                // Window is already loaded, send immediately with small delay for component mounting
                setTimeout(() => {
                    win.webContents.send('notifications:add', notification)
                }, 100)
            }

            return { success: true }
        } catch (error) {
            console.error('Error showing notification:', error)
            return { success: false, error: error.message }
        }
    })

    // Resize notifications window based on content height
    ipcMain.on('notifications:resize', (event, height) => {
        const win = windowManager.getWindow('notifications')
        if (!win || win.isDestroyed()) return
        const { width } = win.getBounds()
        const minHeight = 10
        const nextHeight = Math.max(minHeight, Math.ceil(height))
        win.setSize(width, nextHeight, true)
        positionNotificationsWindow(win)
    })

    // Reposition when display potentially changes
    ipcMain.on('notifications:reposition', () => {
        const win = windowManager.getWindow('notifications')
        if (!win || win.isDestroyed()) return
        positionNotificationsWindow(win)
    })

    // Close notifications window
    ipcMain.on('notifications:close', () => {
        const win = windowManager.getWindow('notifications')
        if (win) {
            // First hide the window to prevent any visual artifacts
            win.hide()
            // Then close it to trigger proper cleanup
            win.close()
        }
    })

    // Store synchronization between windows
    ipcMain.on('store:sync', (event, { key, value }) => {
        // Broadcast store changes to all windows except the sender
        windowManager.getAllWindows().forEach((window) => {
            if (window.webContents !== event.sender) {
                window.webContents.send('store:update', { key, value })
            }
        })
    })

    // Window management IPC handlers
    ipcMain.handle('create-window', (event, type, options) => {
        try {
            windowManager.createWindow(type, options)
            return { success: true }
        } catch (error) {
            console.error('Error creating window:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('center-window', (event, type) => {
        return windowManager.center(type)
    })

    ipcMain.handle('close-window', (event, type) => {
        try {
            windowManager.closeWindow(type)
            return { success: true }
        } catch (error) {
            console.error('Error closing window:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('show-window', (event, type) => {
        try {
            windowManager.showWindow(type)
            return { success: true }
        } catch (error) {
            console.error('Error showing window:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('hide-window', (event, type) => {
        try {
            windowManager.hideWindow(type)
            return { success: true }
        } catch (error) {
            console.error('Error hiding window:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('get-window-type', (event) => {
        // Get the window type from the URL parameters
        const webContents = event.sender
        const url = webContents.getURL()
        const urlParams = new URLSearchParams(url.split('?')[1] || '')
        return urlParams.get('window')?.split('#/')[0] || 'main'
    })

    // Handle connectivity status from renderer process
    ipcMain.on('connectivity-status', (event, data) => {
        console.log(`[Main] Connectivity status received: ${data.status} (${data.isOnline ? 'Online' : 'Offline'})`)

        // You can perform main process specific actions here based on connectivity
        if (data.status === 'online') {
            // Handle when app comes online
            console.log('[Main] App is online - can perform network operations')
        } else if (data.status === 'offline') {
            // Handle when app goes offline
            console.log('[Main] App is offline - pausing network operations')
        }

        // Broadcast to all managed windows
        windowManager.broadcastToAllWindows('connectivity-event', {
            type: 'status-update',
            ...data
        })
    })

    ipcMain.on('store-send', (event, params) => {
        const { action, key, value } = params

        switch (action) {
            case 'get':
                event.returnValue = store.get(key)
                break

            case 'set':
                event.returnValue = store.set(key, value)
                break
        }
    })

    ipcMain.handle('close-windows-by-type', (event, type) => {
        try {
            windowManager.closeWindowsByType(type)
            // Event listeners are automatically cleaned up when windows close
            return { success: true }
        } catch (error) {
            console.error(`Error closing windows of type ${type}:`, error)
            return { success: false, error: error.message }
        }
    })

    // Close other screenshot windows except the current one
    ipcMain.handle('close-other-screenshot-windows', (event, currentDisplayId) => {
        try {
            const currentWindow = BrowserWindow.fromWebContents(event.sender)
            const currentDisplayIdStr = currentDisplayId ? currentDisplayId.toString() : null

            console.log(`closeOtherScreenshotWindows called - currentDisplayId: ${currentDisplayIdStr}`)
            console.log(`Current window exists: ${!!currentWindow}`)
            console.log(`Available windows:`, Array.from(windowManager.windows.keys()))

            windowManager.windows.forEach((window, key) => {
                if (key.startsWith('screenshot-')) {
                    console.log(`Checking window ${key}:`, {
                        isDestroyed: window.isDestroyed(),
                        isSameWindow: window === currentWindow,
                        shouldSkip: currentDisplayIdStr && key === `screenshot-${currentDisplayIdStr}`
                    })

                    if (!window.isDestroyed() && window !== currentWindow) {
                        // Extra safety check - don't close windows for the same display
                        if (currentDisplayIdStr && key === `screenshot-${currentDisplayIdStr}`) {
                            console.log(`Skipping close of current display window: ${key}`)
                            return
                        }

                        console.log(`Closing other screenshot window: ${key}`)
                        window.close()
                    }
                }
            })
            return { success: true }
        } catch (error) {
            console.error('Error closing other screenshot windows:', error)
            return { success: false, error: error.message }
        }
    })

    createWindow()

    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

// Handle protocol URLs (deep links)
const handleProtocolUrl = (url) => {
    console.log('Protocol URL received:', url)

    if (url.startsWith('snaplark://auth')) {
        // Parse the URL to extract authentication data
        try {
            const urlObj = new URL(url)
            const params = new URLSearchParams(urlObj.search)

            const authData = {
                access_token: params.get('access_token')
            }

            // Send auth data to a renderer process
            const mainWindow = windowManager.getWindow('main')
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('auth-response', authData)

                // Show and focus the window with better Windows handling
                // if (mainWindow.isMinimized()) {
                //     mainWindow.restore()
                // }
                // mainWindow.show()
                // mainWindow.focus()
            }
        } catch (error) {
            console.error('Error parsing auth URL:', error)
            const mainWindow = windowManager.getWindow('main')
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('auth-response', {
                    error: 'Invalid auth response'
                })

                // Ensure the window is still shown even on error
                if (mainWindow.isMinimized()) {
                    mainWindow.restore()
                }
                mainWindow.show()
                mainWindow.focus()
            }
        }
    }
}

// Windows & Linux - Handle protocol URLs
// This handler is now moved up to the single instance lock section above

// macOS - Handle protocol URLs
app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
})

// Handle protocol URL on app startup (Windows & Linux)
if (process.argv.length >= 2) {
    const url = process.argv.find((arg) => arg.startsWith('snaplark://'))
    if (url) {
        app.whenReady().then(() => {
            setTimeout(() => handleProtocolUrl(url), 1000) // Delay to ensure window is ready
        })
    }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
