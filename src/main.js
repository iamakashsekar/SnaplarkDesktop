import { app, BrowserWindow, shell, ipcMain, screen, desktopCapturer, protocol, clipboard } from 'electron'
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
let screenPollInterval = null
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
        // Hide the main window before starting screenshot mode (but don't focus it)
        const mainWindow = windowManager.getWindow('main')
        if (mainWindow) {
            mainWindow.hide()
        }

        // Close any existing windows and clear a previous interval
        windowManager.closeWindowsByType('screenshot')
        if (screenPollInterval) clearInterval(screenPollInterval)

        // Use tray position if available, otherwise fall back to the cursor position
        let referencePoint = screen.getCursorScreenPoint()
        // if (mainWindow && mainWindow.trayPosition) {
        //     referencePoint = mainWindow.trayPosition;
        //     // Clear the tray position after using it
        //     delete mainWindow.trayPosition;
        // }

        const currentDisplay = screen.getDisplayNearestPoint(referencePoint)

        // Get a screenshot of the current display to use for the magnifier
        const source = await findSourceForDisplay(currentDisplay)
        if (!source) {
            console.error(`Could not find screen source for initial displayId: ${currentDisplay.id}`)
            return
        }

        const image = await takeScreenshotForDisplay(source, 'fullscreen', null, currentDisplay)
        const dataURL = image.toDataURL()

        const win = windowManager.createWindow('screenshot', {
            ...currentDisplay.bounds,
            params: {
                displayId: currentDisplay.id,
                initialMouseX: screen.getCursorScreenPoint().x - currentDisplay.bounds.x,
                initialMouseY: screen.getCursorScreenPoint().y - currentDisplay.bounds.y
            }
        })

        // Use handleOnce to securely provide the initial screenshot data to the renderer
        // only once, when it's ready to ask for it. This avoids the race condition.
        ipcMain.handleOnce('get-initial-magnifier-data', (event) => {
            // Ensure the request is coming from the correct window.
            if (event.sender === win.webContents) {
                return dataURL
            }
            return null
        })

        // Additional macOS specific settings for better workspace behavior
        if (process.platform === 'darwin') {
            win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            win.setAlwaysOnTop(true, 'screen-saver', 1)
        }

        win.currentDisplayId = currentDisplay.id // Store for polling check

        screenPollInterval = setInterval(async () => {
            try {
                if (win.isDestroyed()) {
                    clearInterval(screenPollInterval)
                    return
                }

                const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
                if (win.currentDisplayId !== display.id) {
                    win.setBounds(display.bounds)
                    win.currentDisplayId = display.id

                    // Additional macOS specific settings for the new display
                    if (process.platform === 'darwin') {
                        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                        win.setAlwaysOnTop(true, 'screen-saver', 1)
                    }

                    // Get and send new data for the new display
                    const newSource = await findSourceForDisplay(display)
                    if (newSource) {
                        const newImage = await takeScreenshotForDisplay(newSource, 'fullscreen', null, display)
                        win.webContents.send('magnifier-data', newImage.toDataURL())
                    } else {
                        console.error(`Could not find screen source for new displayId: ${display.id}`)
                    }

                    // Notify the renderer process of the display change with updated mouse coordinates
                    const currentMouse = screen.getCursorScreenPoint()
                    win.webContents.send('display-changed', {
                        displayId: display.id,
                        mouseX: currentMouse.x - display.bounds.x,
                        mouseY: currentMouse.y - display.bounds.y
                    })
                }
            } catch (error) {
                // Stop polling if there's an error (e.g., window closed)
                clearInterval(screenPollInterval)
            }
        }, 100)

        // Clean up the IPC handler if the window is closed before the data is requested.
        win.on('closed', () => {
            ipcMain.removeHandler('get-initial-magnifier-data')
        })
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
            if (screenPollInterval) clearInterval(screenPollInterval)
            windowManager.closeWindowsByType('screenshot')

            return { success: true, message: 'Screenshot copied to clipboard' }
        } catch (error) {
            console.error('Copy screenshot error:', error)
            return { success: false, error: error.message }
        }
    })

    // Handle print screenshot
    ipcMain.handle('print-screenshot', async (event, type, bounds, displayId) => {
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

            // Create temporary directory for print file
            const homeDir = os.homedir()
            const tempDir = path.join(homeDir, 'tmp', 'snaplark')

            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true })
            }

            // Generate temporary filename
            const timestamp = new Date().getTime()
            const tempFilename = `screenshot_print_${timestamp}.png`
            const tempFilepath = path.join(tempDir, tempFilename)

            // Save temporary file
            fs.writeFileSync(tempFilepath, image.toPNG())

            // Create a new window for printing
            const printWindow = new BrowserWindow({
                width: 800,
                height: 600,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            })

            // Load the image in the print window
            const imageDataURL = `data:image/png;base64,${image.toPNG().toString('base64')}`
            const printHTML = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Screenshot</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100vh;
                object-fit: contain;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
              }
              @media print {
                body { padding: 0; }
                img { 
                  max-width: 100%; 
                  max-height: 100vh; 
                  box-shadow: none;
                }
              }
            </style>
          </head>
          <body>
            <img src="${imageDataURL}" alt="Screenshot" />
          </body>
        </html>
      `

            printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHTML)}`)

            // Wait for the window to load, then print
            printWindow.webContents.once('did-finish-load', () => {
                printWindow.webContents.print(
                    {
                        silent: false,
                        printBackground: true,
                        deviceName: ''
                    },
                    (success, failureReason) => {
                        // Clean up temp file
                        try {
                            fs.unlinkSync(tempFilepath)
                        } catch (cleanupError) {
                            console.warn('Could not clean up temp file:', cleanupError)
                        }

                        // Close print window
                        printWindow.close()

                        if (!success) {
                            console.error('Print failed:', failureReason)
                        }
                    }
                )
            })

            // Cleanup screenshot mode
            if (screenPollInterval) clearInterval(screenPollInterval)
            windowManager.closeWindowsByType('screenshot')

            return { success: true, message: 'Print dialog opened' }
        } catch (error) {
            console.error('Print screenshot error:', error)
            return { success: false, error: error.message }
        }
    })

    // Handle Google Image Search
    ipcMain.handle('search-image-google', async (event, type, bounds, displayId) => {
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

            // Copy image to clipboard for easy paste into Google Images
            clipboard.writeImage(image)

            // Open Google Images in default browser
            await shell.openExternal('https://images.google.com/')

            // Cleanup screenshot mode
            if (screenPollInterval) clearInterval(screenPollInterval)
            windowManager.closeWindowsByType('screenshot')

            return {
                success: true,
                message: 'Google Image Search opened automatically'
            }
        } catch (error) {
            console.error('Google Image Search error:', error)
            return { success: false, error: error.message }
        }
    })

    ipcMain.on('cancel-screenshot-mode', () => {
        if (screenPollInterval) clearInterval(screenPollInterval)
        windowManager.closeWindowsByType('screenshot')
    })

    // Handle screenshot capture
    ipcMain.handle('take-screenshot', async (event, type, bounds, displayId) => {
        try {
            // const screenWin = windowManager.getWindow('screenshot')
            // screenWin.webContents.openDevTools()

            const senderWindow = BrowserWindow.fromWebContents(event.sender)
            if (senderWindow) {
                senderWindow.hide()
            }

            // await new Promise((resolve) => setTimeout(resolve, 200))

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

            if (screenPollInterval) clearInterval(screenPollInterval)
            windowManager.closeWindowsByType('screenshot')

            return { 
                success: true, 
                path: filepath, 
                dataUrl: image.toDataURL(), 
                filename: filename,
                size: size // in bytes
            }
        } catch (error) {
            console.error('Screenshot error:', error)
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

            win.openDevTools()

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

            setTimeout(() => {
                win.webContents.send('notifications:add', notification)
            }, 300)

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
            // Also clear the interval if we're closing screenshot windows this way
            if (type === 'screenshot' && screenPollInterval) {
                clearInterval(screenPollInterval)
            }
            return { success: true }
        } catch (error) {
            console.error(`Error closing windows of type ${type}:`, error)
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
