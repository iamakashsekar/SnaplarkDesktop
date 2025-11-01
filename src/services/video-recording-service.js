import { ipcMain, screen, desktopCapturer, dialog, BrowserWindow, globalShortcut } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

class VideoRecordingService {
    constructor(windowManager, store) {
        this.windowManager = windowManager
        this.store = store
        this.mouseTrackingInterval = null
        this.activeRecordings = new Map() // Track active recordings per display
        this.stopRecordingShortcut = null
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

    ensureRecordingsDirectory() {
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
                    await new Promise((resolve) => setTimeout(resolve, 500))
                }

                this.windowManager.closeWindowsByType('video-recording')

                const allDisplays = screen.getAllDisplays()

                const screenshotPromises = allDisplays.map(async (display) => {
                    try {
                        const source = await this.findSourceForDisplay(display)
                        if (!source) {
                            console.error(`Could not find screen source for displayId: ${display.id}`)
                            return null
                        }

                        const scaleFactor = display.scaleFactor || 1
                        const image = source.thumbnail
                        const dataURL = image.toDataURL()

                        const cursorPos = screen.getCursorScreenPoint()
                        const mouseX = cursorPos.x - display.bounds.x
                        const mouseY = cursorPos.y - display.bounds.y

                        return {
                            display,
                            dataURL,
                            mouseX: Math.max(0, Math.min(mouseX, display.bounds.width)),
                            mouseY: Math.max(0, Math.min(mouseY, display.bounds.height)),
                            source
                        }
                    } catch (error) {
                        console.error(`Error processing display ${display.id}:`, error)
                        return null
                    }
                })

                const screenshotResults = await Promise.all(screenshotPromises)
                const validResults = screenshotResults.filter((result) => result !== null)

                if (validResults.length === 0) {
                    console.error('No valid displays found for video recording')
                    return { success: false, error: 'No displays available' }
                }

                const initialCursorPos = screen.getCursorScreenPoint()
                const initialActiveDisplay = screen.getDisplayNearestPoint(initialCursorPos)

                const windows = validResults.map(({ display, dataURL, mouseX, mouseY, source }) => {
                    const windowType = `video-recording-${display.id}`

                    const win = this.windowManager.createWindow(windowType, {
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

                    win.videoRecordingData = dataURL
                    win.displayInfo = display
                    win.source = source

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

                    win.webContents.once('did-finish-load', () => {
                        const activationData = {
                            isActive: isInitiallyActive,
                            activeDisplayId: initialActiveDisplay.id,
                            mouseX: initialCursorPos.x - display.bounds.x,
                            mouseY: initialCursorPos.y - display.bounds.y
                        }
                        win.webContents.send('display-activation-changed', activationData)
                    })

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
                        this.activeRecordings.delete(display.id)
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
                console.error('Error starting video recording mode:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('start-video-recording', async (event, options) => {
            try {
                const { type, bounds, displayId, isFullScreen } = options
                const senderWindow = BrowserWindow.fromWebContents(event.sender)
                
                await new Promise((resolve) => setTimeout(resolve, 100))

                const displays = screen.getAllDisplays()
                const primaryDisplay = screen.getPrimaryDisplay()
                const displayIdStr = (displayId ?? primaryDisplay.id).toString()
                const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

                const source = await this.findSourceForDisplay(targetDisplay)
                if (!source) {
                    throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
                }

                if (!source.id) {
                    throw new Error(`Screen source has no ID for displayId: ${displayIdStr}`)
                }

                const recordingId = `${displayIdStr}-${Date.now()}`
                const recordingInfo = {
                    displayId: displayIdStr,
                    source: source,
                    display: targetDisplay,
                    type,
                    bounds,
                    isFullScreen,
                    startTime: Date.now()
                }

                this.activeRecordings.set(recordingId, recordingInfo)

                // Register global Space shortcut to stop recording if not already registered
                if (!this.stopRecordingShortcut) {
                    const registered = globalShortcut.register('Space', () => {
                        console.log('Space key pressed - stopping all active recordings')
                        // Send stop signal to all active recording windows
                        this.windowManager.windows.forEach((window, key) => {
                            if (key.startsWith('video-recording') && !window.isDestroyed()) {
                                window.webContents.send('stop-recording-shortcut')
                            }
                        })
                    })
                    
                    if (registered) {
                        this.stopRecordingShortcut = 'Space'
                        console.log('Registered Space key shortcut for stopping recording')
                    } else {
                        console.warn('Failed to register Space key shortcut for stopping recording')
                    }
                }

                // Hide ALL video recording windows immediately after recording starts
                setTimeout(() => {
                    console.log('Hiding all video recording windows')
                    this.windowManager.windows.forEach((window, key) => {
                        if (key.startsWith('video-recording') && !window.isDestroyed()) {
                            try {
                                // Exit kiosk mode if active (check if method exists)
                                if (typeof window.isKioskMode === 'function' && window.isKioskMode()) {
                                    window.setKioskMode(false)
                                }
                                // Make non-focusable
                                window.setFocusable(false)
                                // Hide the window completely
                                window.hide()
                                console.log(`Hidden window: ${key}`)
                            } catch (error) {
                                console.error(`Error hiding window ${key}:`, error)
                                // Still try to hide even if other operations fail
                                try {
                                    window.hide()
                                } catch (hideError) {
                                    console.error(`Failed to hide window ${key}:`, hideError)
                                }
                            }
                        }
                    })
                }, 200)

                const response = {
                    success: true,
                    recordingId,
                    sourceId: source.id,
                    displayId: displayIdStr,
                    bounds: isFullScreen ? {
                        x: 0,
                        y: 0,
                        width: targetDisplay.bounds.width,
                        height: targetDisplay.bounds.height
                    } : bounds
                }

                console.log('Video recording started:', response)
                return response
            } catch (error) {
                console.error('Start video recording error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('stop-video-recording', async (event, recordingId) => {
            try {
                const recordingInfo = this.activeRecordings.get(recordingId)
                if (!recordingInfo) {
                    throw new Error('Recording not found')
                }

                this.activeRecordings.delete(recordingId)

                // Unregister Space shortcut if no more active recordings
                if (this.activeRecordings.size === 0 && this.stopRecordingShortcut) {
                    globalShortcut.unregister(this.stopRecordingShortcut)
                    this.stopRecordingShortcut = null
                    console.log('Unregistered Space key shortcut for stopping recording')
                }

                return {
                    success: true,
                    recordingId,
                    duration: Date.now() - recordingInfo.startTime
                }
            } catch (error) {
                console.error('Stop video recording error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('is-video-recording-active', () => {
            return {
                isActive: this.activeRecordings.size > 0,
                count: this.activeRecordings.size,
                recordingIds: Array.from(this.activeRecordings.keys())
            }
        })

        ipcMain.handle('stop-all-video-recordings', async () => {
            try {
                const recordingIds = Array.from(this.activeRecordings.keys())
                
                // Show all video recording windows first (so they can receive IPC messages)
                // Then send stop signal to all active recording windows
                this.windowManager.windows.forEach((window, key) => {
                    if (key.startsWith('video-recording') && !window.isDestroyed()) {
                        try {
                            // Make window blocking and show it first
                            if (typeof window.isKioskMode === 'function' && window.isKioskMode()) {
                                window.setKioskMode(false)
                            }
                            window.setIgnoreMouseEvents(false)
                            window.setFocusable(true)
                            window.show()
                            // Send stop signal
                            window.webContents.send('stop-recording-shortcut')
                        } catch (error) {
                            console.error(`Error stopping window ${key}:`, error)
                            // Still try to send stop signal
                            try {
                                window.webContents.send('stop-recording-shortcut')
                            } catch (sendError) {
                                console.error(`Failed to send stop signal to ${key}:`, sendError)
                            }
                        }
                    }
                })

                // Unregister Space shortcut
                if (this.stopRecordingShortcut) {
                    globalShortcut.unregister(this.stopRecordingShortcut)
                    this.stopRecordingShortcut = null
                }

                return {
                    success: true,
                    stoppedCount: recordingIds.length
                }
            } catch (error) {
                console.error('Stop all video recordings error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.on('cancel-video-recording-mode', () => {
            this.windowManager.closeWindowsByType('video-recording')
            this.activeRecordings.clear()
            
            // Unregister Space shortcut
            if (this.stopRecordingShortcut) {
                globalShortcut.unregister(this.stopRecordingShortcut)
                this.stopRecordingShortcut = null
                console.log('Unregistered Space key shortcut for stopping recording')
            }
        })

        ipcMain.handle('close-other-video-recording-windows', async (event, currentDisplayId) => {
            try {
                const currentDisplayIdStr = currentDisplayId?.toString()

                this.windowManager.windows.forEach((window, key) => {
                    if (key.startsWith('video-recording-') && !window.isDestroyed()) {
                        const windowDisplayIdStr = window.displayInfo?.id?.toString()

                        if (window.displayInfo && windowDisplayIdStr !== currentDisplayIdStr) {
                            window.close()
                        }
                    }
                })
                return { success: true }
            } catch (error) {
                console.error('Error closing other video recording windows:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('save-video-recording', async (event, options) => {
            try {
                const { buffer, filename } = options

                const recordingsDir = this.ensureRecordingsDirectory()
                const filepath = path.join(recordingsDir, filename)

                const bufferData = Buffer.from(buffer)
                fs.writeFileSync(filepath, bufferData)

                const { size } = fs.statSync(filepath)

                return {
                    success: true,
                    path: filepath,
                    filename: filename,
                    size: size
                }
            } catch (error) {
                console.error('Save video recording error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('ensure-recordings-directory', () => {
            return this.ensureRecordingsDirectory()
        })
    }

    cleanup() {
        if (this.mouseTrackingInterval) {
            clearInterval(this.mouseTrackingInterval)
            this.mouseTrackingInterval = null
        }
        this.activeRecordings.clear()
    }
}

export default VideoRecordingService

