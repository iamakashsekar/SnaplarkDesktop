import { ipcMain, screen, desktopCapturer } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

class VideoRecordingService {
    constructor(windowManager, store) {
        this.windowManager = windowManager
        this.store = store
        this.mouseTrackingInterval = null

        // Cache for pre-captured screen sources (optimization)
        this.cachedSources = null
        this.cachedSourcesTimestamp = 0
        this.cacheValidityMs = 2000 // Cache valid for 2 seconds
        this.isPreCapturing = false

        this.setupHandlers()

        // Pre-warm the capture pipeline on initialization
        this.preWarmCapture()
    }

    /**
     * Pre-warm the desktopCapturer pipeline
     * First call to getSources is often slower, so we warm it up at startup
     */
    async preWarmCapture() {
        try {
            // Use small thumbnails for warm-up (just to initialize the pipeline)
            await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1, height: 1 },
                fetchWindowIcons: false
            })
        } catch (error) {
            // Ignore errors during warm-up
        }
    }

    /**
     * Pre-capture screens in background for faster recording mode activation
     * Call this when main window is shown/focused
     */
    async preCaptureScreens() {
        if (this.isPreCapturing) return // Avoid concurrent pre-captures

        this.isPreCapturing = true
        try {
            const allDisplays = screen.getAllDisplays()
            const sources = await this.getAllScreenSources(allDisplays)

            if (sources && sources.length > 0) {
                this.cachedSources = sources
                this.cachedSourcesTimestamp = Date.now()
            }
        } catch (error) {
            // Ignore errors during pre-capture
        } finally {
            this.isPreCapturing = false
        }
    }

    /**
     * Get cached sources if still valid, otherwise fetch fresh
     */
    async getScreenSourcesWithCache(displays) {
        const now = Date.now()

        // Check if cache is valid
        if (this.cachedSources &&
            this.cachedSources.length > 0 &&
            (now - this.cachedSourcesTimestamp) < this.cacheValidityMs) {
            return this.cachedSources
        }

        // Cache expired or doesn't exist, fetch fresh
        const sources = await this.getAllScreenSources(displays)

        // Update cache
        this.cachedSources = sources
        this.cachedSourcesTimestamp = now

        return sources
    }

    /**
     * Clear the cached sources (call when recording mode is cancelled/completed)
     */
    clearCache() {
        this.cachedSources = null
        this.cachedSourcesTimestamp = 0
    }

    /**
     * Get full resolution thumbnail size for screen capture
     * Uses native resolution for crisp preview quality
     */
    getFullResolutionThumbnailSize(displays) {
        // Find the largest display dimensions at native resolution
        let maxWidth = 0
        let maxHeight = 0
        for (const display of displays) {
            const scaleFactor = display.scaleFactor || 1
            maxWidth = Math.max(maxWidth, Math.round(display.size.width * scaleFactor))
            maxHeight = Math.max(maxHeight, Math.round(display.size.height * scaleFactor))
        }

        return { width: maxWidth, height: maxHeight }
    }

    /**
     * Fetch all screen sources in a single call (much faster than per-display calls)
     * Uses full resolution for crisp preview
     */
    async getAllScreenSources(displays) {
        const thumbnailSize = this.getFullResolutionThumbnailSize(displays)

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize,
            fetchWindowIcons: false
        })

        return sources
    }

    /**
     * Find the source matching a specific display from pre-fetched sources
     */
    findSourceForDisplayFromSources(sources, display) {
        if (!display || !sources || sources.length === 0) return null
        const displayIdStr = display.id.toString()
        return sources.find((s) => s.display_id === displayIdStr) || sources[0] || null
    }

    /**
     * Legacy method for backward compatibility with other handlers
     */
    async findSourceForDisplay(display) {
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

        return sources.find((s) => s.display_id === displayIdStr) || sources[0] || null
    }

    async takeScreenshotForDisplay(source, type, bounds, display) {
        const scaleFactor = display.scaleFactor || 1
        const image = source.thumbnail

        let screenshot = image
        if (type === 'area' && bounds) {
            screenshot = image.crop({
                x: Math.round(bounds.x * scaleFactor),
                y: Math.round(bounds.y * scaleFactor),
                width: Math.round(bounds.width * scaleFactor),
                height: Math.round(bounds.height * scaleFactor)
            })
        }

        // Check if cursor should be included
        const settings = this.store.get('settings') || {}
        const shouldShowCursor = settings.showCursor !== false

        if (shouldShowCursor) {
            // Note: Electron's desktopCapturer API doesn't capture cursors by default
            // To implement cursor capture, you would need to:
            // 1. Get cursor position using screen.getCursorScreenPoint()
            // 2. Get cursor image using platform-specific native APIs (requires native modules)
            // 3. Overlay the cursor image on the screenshot at the cursor position
            // This is a future enhancement that would require native module integration
        }

        return screenshot
    }

    ensureScreenshotsDirectory() {
        const settings = this.store.get('settings') || {}
        let defaultSaveFolder = settings.defaultSaveFolder || '~/Pictures/Snaplark'

        if (defaultSaveFolder.startsWith('~')) {
            defaultSaveFolder = defaultSaveFolder.replace('~', os.homedir())
        }

        fs.mkdirSync(defaultSaveFolder, { recursive: true })
        return defaultSaveFolder
    }

    setupHandlers() {
        ipcMain.handle('start-video-recording-mode', async () => {
            try {
                const mainWindow = this.windowManager.getWindow('main')
                const wasMainWindowVisible = mainWindow && mainWindow.isVisible()

                if (mainWindow) {
                    mainWindow.hide()
                }

                // If main window was visible, clear the cache to avoid capturing it in the preview
                // The cached screenshot would include the main window if it was visible during pre-capture
                if (wasMainWindowVisible) {
                    this.clearCache()
                }

                // Close any existing recording windows first (non-blocking)
                this.windowManager.closeWindowsByType('recording')

                // Delay to ensure window is hidden before capture
                // Needed when main window was visible (menu-initiated)
                if (wasMainWindowVisible || process.platform === 'darwin') {
                    await new Promise((resolve) => setTimeout(resolve, 150))
                }

                const allDisplays = screen.getAllDisplays()

                // OPTIMIZATION: Use cached sources if available (from pre-capture)
                // Falls back to fresh capture if cache is expired or was cleared
                const allSources = await this.getScreenSourcesWithCache(allDisplays)

                if (!allSources || allSources.length === 0) {
                    console.error('No screen sources found')
                    return { success: false, error: 'No screen sources available' }
                }

                // Get cursor position once before processing
                const cursorPos = screen.getCursorScreenPoint()

                // Process all displays using the pre-fetched sources
                const screenshotResults = allDisplays.map((display) => {
                    try {
                        const source = this.findSourceForDisplayFromSources(allSources, display)
                        if (!source) {
                            console.error(`Could not find screen source for displayId: ${display.id}`)
                            return null
                        }

                        const image = source.thumbnail
                        const dataURL = image.toDataURL()

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

                const validResults = screenshotResults.filter((result) => result !== null)

                if (validResults.length === 0) {
                    console.error('No valid displays found for recording')
                    return { success: false, error: 'No displays available' }
                }

                const initialCursorPos = screen.getCursorScreenPoint()
                const initialActiveDisplay = screen.getDisplayNearestPoint(initialCursorPos)

                const windows = validResults.map(({ display, dataURL, mouseX, mouseY }) => {
                    const windowType = `recording-${display.id}`

                    const win = this.windowManager.createWindow(windowType, {
                        ...display.bounds,
                        x: display.bounds.x,
                        y: display.bounds.y,
                        width: display.bounds.width,
                        height: display.bounds.height,
                        params: {
                            displayId: display.id,
                            initialMouseX: mouseX,
                            initialMouseY: mouseY,
                            activeDisplayId: initialActiveDisplay.id
                        }
                    })

                    win.screenshotData = dataURL
                    win.displayInfo = display

                    win.setBounds({
                        x: display.bounds.x,
                        y: display.bounds.y,
                        width: display.bounds.width,
                        height: display.bounds.height
                    })

                    const handlerKey = `get-initial-magnifier-data-${display.id}`
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
                            win.setFullScreen(false)
                            win.setBounds({
                                x: display.bounds.x,
                                y: display.bounds.y,
                                width: display.bounds.width,
                                height: display.bounds.height
                            })
                            win.setResizable(false)
                            win.setMovable(false)
                        }
                    }

                    const isInitiallyActive = display.id === initialActiveDisplay.id

                    // Send activation data immediately when window is ready
                    const sendActivationData = () => {
                        const activationData = {
                            isActive: isInitiallyActive,
                            activeDisplayId: initialActiveDisplay.id,
                            mouseX: initialCursorPos.x - display.bounds.x,
                            mouseY: initialCursorPos.y - display.bounds.y
                        }
                        win.webContents.send('display-activation-changed', activationData)
                    }

                    // Store activeDisplayId on window for reference
                    win.activeDisplayId = initialActiveDisplay.id

                    // Try to send immediately if window is already loaded
                    if (win.webContents.isLoading()) {
                        win.webContents.once('did-finish-load', () => {
                            // Small delay to ensure Vue component is mounted
                            setTimeout(sendActivationData, 50)
                        })
                    } else {
                        // Window already loaded, send immediately
                        setTimeout(sendActivationData, 50)
                    }

                    win.show()

                    if (process.platform === 'win32') {
                        win.focus()
                        win.moveTop()
                        win.setAlwaysOnTop(true, 'screen-saver')

                        // Reduced delay - use setImmediate for first retry
                        setImmediate(() => {
                            if (!win.isDestroyed() && !win.isFocused()) {
                                win.focus()
                                win.moveTop()
                            }
                        })
                    }

                    win.on('closed', () => {
                        ipcMain.removeHandler(handlerKey)
                    })

                    return win
                })

                let currentActiveDisplayId = initialActiveDisplay.id

                const updateActiveWindow = (force = false) => {
                    const cursorPos = screen.getCursorScreenPoint()
                    const activeDisplay = screen.getDisplayNearestPoint(cursorPos)

                    if (force || currentActiveDisplayId !== activeDisplay.id) {
                        currentActiveDisplayId = activeDisplay.id

                        windows.forEach((win) => {
                            if (!win.isDestroyed() && win.webContents) {
                                const isActive = win.displayInfo.id === activeDisplay.id
                                const activationData = {
                                    isActive,
                                    activeDisplayId: activeDisplay.id,
                                    mouseX: cursorPos.x - win.displayInfo.bounds.x,
                                    mouseY: cursorPos.y - win.displayInfo.bounds.y
                                }

                                // Send activation data immediately, regardless of loading state
                                // The Vue component will handle it when ready
                                if (win.webContents.isLoading()) {
                                    win.webContents.once('did-finish-load', () => {
                                        setTimeout(() => {
                                            win.webContents.send('display-activation-changed', activationData)
                                        }, 50)
                                    })
                                } else {
                                    setTimeout(() => {
                                        win.webContents.send('display-activation-changed', activationData)
                                    }, 50)
                                }
                            }
                        })
                    }
                }

                this.mouseTrackingInterval = setInterval(updateActiveWindow, 100)

                const cleanup = () => {
                    if (this.mouseTrackingInterval) {
                        clearInterval(this.mouseTrackingInterval)
                        this.mouseTrackingInterval = null
                    }
                }

                windows.forEach((win) => {
                    win.on('closed', cleanup)
                })

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

        ipcMain.on('cancel-video-recording-mode', () => {
            // this.windowManager.closeWindowsByType('webcam')
            this.windowManager.closeWindowsByType('recording')
        })

        ipcMain.handle('close-other-video-recording-windows', async (event, currentDisplayId) => {
            try {
                const currentDisplayIdStr = currentDisplayId?.toString()

                this.windowManager.windows.forEach((window, key) => {
                    if (key.startsWith('recording-') && !window.isDestroyed()) {
                        const windowDisplayIdStr = window.displayInfo?.id?.toString()

                        if (window.displayInfo && windowDisplayIdStr !== currentDisplayIdStr) {
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

        // Handle getting screen sources
        ipcMain.handle('get-sources', async () => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ['window', 'screen'],
                    thumbnailSize: { width: 150, height: 150 }
                })
                return sources
            } catch (error) {
                console.error('Error getting sources:', error)
                return []
            }
        })

        // Handle saving video file to Snaplark folder (fallback when disk streaming not available)
        ipcMain.handle('save-video', async (event, buffer, filename) => {
            try {
                // Get Snaplark folder path from settings
                const snaplarkDir = this.ensureScreenshotsDirectory()

                // Ensure filename doesn't already have .webm extension
                const baseName = filename || 'recording'
                const finalName = baseName.endsWith('.webm') ? baseName : `${baseName}.webm`
                const filepath = path.join(snaplarkDir, finalName)

                fs.writeFileSync(filepath, Buffer.from(buffer))

                const fileSize = buffer.byteLength
                console.log(
                    `💾 Video saved to Snaplark folder: ${filepath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
                )

                return { success: true, path: filepath, size: fileSize }
            } catch (error) {
                console.error('Error saving video:', error)
                return { success: false, error: error.message }
            }
        })

        // Real-time recording to disk - prevents memory overflow
        // Store active write stream and file path
        let activeWriteStream = null
        let activeTempPath = null

        // Initialize recording stream - creates single file and starts writing immediately
        ipcMain.handle('init-recording-stream', async (event, timestamp) => {
            try {
                // Clean up any existing stream
                if (activeWriteStream) {
                    activeWriteStream.end()
                    activeWriteStream = null
                }

                // Create single file in Snaplark folder (from settings)
                const snaplarkDir = this.ensureScreenshotsDirectory()
                activeTempPath = path.join(snaplarkDir, `recording_${timestamp}.webm`)

                // Create write stream with high water mark for better performance
                activeWriteStream = fs.createWriteStream(activeTempPath, {
                    highWaterMark: 64 * 1024 * 1024 // 64MB buffer for smooth writing
                })

                // Increase max listeners to prevent warning (chunks write every 1 second)
                // For 24-hour recording: 86400 chunks, but we only need listeners for concurrent writes
                activeWriteStream.setMaxListeners(0) // 0 = unlimited

                // Add error handler to catch write errors
                activeWriteStream.on('error', (err) => {
                    console.error('❌ CRITICAL: Write stream error:', err)
                })

                console.log(`🎬 Started recording to disk: ${activeTempPath}`)

                return { success: true, tempPath: activeTempPath }
            } catch (error) {
                console.error('Error initializing recording stream:', error)
                return { success: false, error: error.message }
            }
        })

        // Append chunk during recording (called every 1 second automatically)
        ipcMain.handle('append-recording-chunk', async (event, chunk) => {
            try {
                if (!activeWriteStream) {
                    // Stream already closed - this is normal when stopping, just ignore
                    console.log('⚠️ Stream already closed, skipping chunk write')
                    return { success: true, skipped: true }
                }

                // Write chunk to disk immediately with proper backpressure handling
                await new Promise((resolve, reject) => {
                    const buffer = Buffer.from(chunk)
                    const canContinue = activeWriteStream.write(buffer)

                    if (canContinue) {
                        // Buffer not full, can continue immediately
                        resolve()
                    } else {
                        // Buffer full, wait for drain event
                        const onDrain = () => {
                            activeWriteStream.removeListener('error', onError)
                            resolve()
                        }
                        const onError = (err) => {
                            activeWriteStream.removeListener('drain', onDrain)
                            reject(err)
                        }
                        activeWriteStream.once('drain', onDrain)
                        activeWriteStream.once('error', onError)
                    }
                })

                return { success: true }
            } catch (error) {
                console.error('❌ CRITICAL: Error appending recording chunk:', error)
                return { success: false, error: error.message }
            }
        })

        // Stop recording and close stream
        ipcMain.handle('stop-recording-stream', async (event) => {
            try {
                if (!activeWriteStream) {
                    return { success: true, tempPath: activeTempPath }
                }

                // Ensure all data is flushed before closing
                await new Promise((resolve, reject) => {
                    const onFinish = () => {
                        activeWriteStream.removeListener('error', onError)
                        console.log('✅ Stream finished writing')
                        resolve()
                    }
                    const onError = (err) => {
                        activeWriteStream.removeListener('finish', onFinish)
                        reject(err)
                    }

                    // Wait for any pending writes to complete
                    if (activeWriteStream.writableNeedDrain) {
                        activeWriteStream.once('drain', () => {
                            activeWriteStream.end()
                        })
                    } else {
                        activeWriteStream.end()
                    }

                    activeWriteStream.once('finish', onFinish)
                    activeWriteStream.once('error', onError)
                })

                console.log(`⏹️ Recording stopped: ${activeTempPath}`)

                const tempPath = activeTempPath

                // Keep temp path but clear stream
                activeWriteStream = null

                return { success: true, tempPath }
            } catch (error) {
                console.error('❌ Error stopping recording stream:', error)
                return { success: false, error: error.message }
            }
        })
    }

    cleanup() {
        if (this.mouseTrackingInterval) {
            clearInterval(this.mouseTrackingInterval)
            this.mouseTrackingInterval = null
        }
    }
}

export default VideoRecordingService
