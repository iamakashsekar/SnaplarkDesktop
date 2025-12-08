import { app, ipcMain, screen, desktopCapturer, dialog, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

class VideoRecordingService {
    constructor(windowManager, store) {
        this.windowManager = windowManager
        this.store = store
        this.mouseTrackingInterval = null
        this.setupHandlers()
    }

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
                if (mainWindow) {
                    mainWindow.hide()
                }

                if (process.platform === 'darwin') {
                    // Reduced delay - 200ms should be enough for window to hide
                    await new Promise((resolve) => setTimeout(resolve, 200))
                }

                this.windowManager.closeWindowsByType('recording')

                const allDisplays = screen.getAllDisplays()

                const screenshotPromises = allDisplays.map(async (display) => {
                    try {
                        const source = await this.findSourceForDisplay(display)
                        if (!source) {
                            console.error(`Could not find screen source for displayId: ${display.id}`)
                            return null
                        }

                        const image = await this.takeScreenshotForDisplay(source, 'fullscreen', null, display)
                        const dataURL = image.toDataURL()

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

                const screenshotResults = await Promise.all(screenshotPromises)
                const validResults = screenshotResults.filter((result) => result !== null)

                if (validResults.length === 0) {
                    console.error('No valid displays found for screenshot')
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

                        setTimeout(() => {
                            if (!win.isDestroyed()) {
                                win.focus()
                                win.moveTop()
                            }
                        }, 200)
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
                console.log(`💾 Video saved to Snaplark folder: ${filepath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`)

                return { success: true, path: filepath, size: fileSize }
            } catch (error) {
                console.error('Error saving video:', error)
                return { success: false, error: error.message }
            }
        })

        // Real-time recording to disk - prevents memory overflow
        // Store active write stream and file path
        let activeWriteStream = null
        let activeFilePath = null
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

        // Create a remuxed copy that is more broadly playable (rewrites container metadata)
        ipcMain.handle('make-recording-playable', async (event, inputPath) => {
            try {
                if (!inputPath || !fs.existsSync(inputPath)) {
                    throw new Error('Input file not found.')
                }

                let ffmpegPath
                try {
                    ffmpegPath = require('ffmpeg-static')
                } catch (e) {
                    ffmpegPath = 'ffmpeg'
                }

                const dir = path.dirname(inputPath)
                const base = path.basename(inputPath, path.extname(inputPath))
                const stagingPath = path.join(dir, `${base}_staging.webm`)

                if (fs.existsSync(stagingPath)) {
                    fs.unlinkSync(stagingPath)
                }

                await new Promise((resolve, reject) => {
                    const args = ['-y', '-i', inputPath, '-c', 'copy', '-fflags', '+genpts', '-map', '0', stagingPath]
                    const proc = spawn(ffmpegPath, args, { stdio: 'ignore' })
                    proc.once('error', reject)
                    proc.once('close', (code) => {
                        if (code === 0) resolve()
                        else reject(new Error(`ffmpeg exited with code ${code}`))
                    })
                })

                // Replace original file atomically
                try {
                    fs.unlinkSync(inputPath)
                } catch (e) {
                    // ignore if already removed
                }
                fs.renameSync(stagingPath, inputPath)

                activeTempPath = inputPath
                return { success: true, path: inputPath }
            } catch (error) {
                console.error('Error making recording playable:', error)
                return { success: false, error: error.message }
            }
        })

        // Save WebM file to Snaplark folder (called when user clicks download)
        ipcMain.handle('finalize-recording', async (event, finalFilename) => {
            try {
                if (!activeTempPath || !fs.existsSync(activeTempPath)) {
                    throw new Error('No temp file found to finalize.')
                }

                // Get Snaplark folder path from settings
                const snaplarkDir = this.ensureScreenshotsDirectory()
                const mp4Path = path.join(snaplarkDir, `${finalFilename}.mp4`)

                // Get ffmpeg path
                let ffmpegPath
                try {
                    ffmpegPath = require('ffmpeg-static')
                } catch (e) {
                    ffmpegPath = 'ffmpeg'
                }

                console.log('🔄 Converting WebM to MP4 and saving to Snaplark folder...')

                // Convert WebM to MP4 using ffmpeg
                await new Promise((resolve, reject) => {
                    const args = [
                        '-y', // Overwrite output file
                        '-i',
                        activeTempPath, // Input file
                        '-c:v',
                        'libx264', // Video codec
                        '-preset',
                        'ultrafast', // Fastest encoding (2-5 min for 1hr @ 1080p)
                        '-crf',
                        '23', // Quality (lower = better, 23 is default)
                        '-c:a',
                        'aac', // Audio codec
                        '-b:a',
                        '128k', // Audio bitrate
                        '-movflags',
                        '+faststart', // Enable fast start for web playback
                        mp4Path // Output file
                    ]

                    const proc = spawn(ffmpegPath, args, { stdio: 'ignore' })
                    proc.once('error', reject)
                    proc.once('close', (code) => {
                        if (code === 0) resolve()
                        else reject(new Error(`ffmpeg conversion failed with code ${code}`))
                    })
                })

                // Keep the temp WebM file for now (user might want to download again)
                // It will be cleaned up on app close or new recording

                activeFilePath = mp4Path
                const fileSize = fs.statSync(activeFilePath).size
                console.log(
                    `💾 Video converted and saved as MP4: ${activeFilePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
                )

                const filepath = activeFilePath

                // Clean up
                activeTempPath = null
                activeFilePath = null

                return { success: true, path: filepath, size: fileSize }
            } catch (error) {
                console.error('Error finalizing recording:', error)
                return { success: false, error: error.message }
            }
        })

        // Show file in folder (file explorer)
        ipcMain.handle('show-item-in-folder', async (event, filePath) => {
            try {
                if (!filePath || !fs.existsSync(filePath)) {
                    throw new Error('File not found')
                }
                shell.showItemInFolder(filePath)
                return { success: true }
            } catch (error) {
                console.error('Error showing file in folder:', error)
                return { success: false, error: error.message }
            }
        })


        // Legacy: Initialize video save - create file and write stream (for download feature)
        ipcMain.handle('init-video-save', async (event, filename, fileSize) => {
            try {
                // Clean up any existing stream
                if (activeWriteStream) {
                    activeWriteStream.end()
                    activeWriteStream = null
                }

                // Get Snaplark folder path from settings
                const snaplarkDir = this.ensureScreenshotsDirectory()
                activeFilePath = path.join(snaplarkDir, `${filename || 'recording'}.webm`)

                // Create write stream
                activeWriteStream = fs.createWriteStream(activeFilePath)

                console.log(`Initializing video save: ${activeFilePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`)

                return { success: true }
            } catch (error) {
                console.error('Error initializing video save:', error)
                return { success: false, error: error.message }
            }
        })

        // Append a single chunk to the video file
        ipcMain.handle('append-video-chunk', async (event, chunk, chunkIndex, totalChunks) => {
            try {
                if (!activeWriteStream) {
                    throw new Error('No active write stream. Call init-video-save first.')
                }

                // Write chunk to stream
                await new Promise((resolve, reject) => {
                    const buffer = Buffer.from(chunk)
                    const canContinue = activeWriteStream.write(buffer)

                    if (canContinue) {
                        resolve()
                    } else {
                        // Wait for drain event if buffer is full
                        activeWriteStream.once('drain', resolve)
                        activeWriteStream.once('error', reject)
                    }
                })

                // Log progress
                const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100)
                console.log(`Writing chunk ${chunkIndex + 1}/${totalChunks} (${progress}%)`)

                return { success: true }
            } catch (error) {
                console.error('Error appending video chunk:', error)
                return { success: false, error: error.message }
            }
        })

        // Finalize video save - close the stream
        ipcMain.handle('finalize-video-save', async (event) => {
            try {
                if (!activeWriteStream) {
                    throw new Error('No active write stream to finalize.')
                }

                // Close the stream
                await new Promise((resolve, reject) => {
                    activeWriteStream.end(() => resolve())
                    activeWriteStream.once('error', reject)
                })

                console.log(`Video saved successfully: ${activeFilePath}`)

                const filepath = activeFilePath

                // Clean up
                activeWriteStream = null
                activeFilePath = null

                return { success: true, path: filepath }
            } catch (error) {
                console.error('Error finalizing video save:', error)
                return { success: false, error: error.message }
            }
        })

        // Get file stats
        ipcMain.handle('get-file-stats', async (event, filePath) => {
            try {
                if (!fs.existsSync(filePath)) {
                    throw new Error('File not found')
                }
                const stats = fs.statSync(filePath)
                return { success: true, size: stats.size, modified: stats.mtime }
            } catch (error) {
                console.error('Error getting file stats:', error)
                return { success: false, error: error.message }
            }
        })

        // Handle opening save dialog
        ipcMain.handle('show-save-dialog', async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
                defaultPath: `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
                filters: [{ name: 'Videos', extensions: ['webm', 'mp4'] }]
            })
            return result
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
