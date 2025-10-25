import { ipcMain, screen, desktopCapturer, clipboard, dialog, nativeImage, BrowserWindow } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

class ScreenshotService {
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

    ensureScreenshotsDirectory() {
        const settings = this.store.get('settings') || {}
        let defaultSaveFolder = settings.defaultSaveFolder || '~/Pictures/Snaplark'

        if (defaultSaveFolder.startsWith('~')) {
            defaultSaveFolder = defaultSaveFolder.replace('~', os.homedir())
        }

        fs.mkdirSync(defaultSaveFolder, { recursive: true })
        return defaultSaveFolder
    }

    applyQualitySettings(image) {
        const settings = this.store.get('settings') || {}
        const quality = settings.uploadQuality || 'high'

        switch (quality) {
            case 'low':
                return { buffer: image.toJPEG(75), extension: '.jpg' }
            case 'medium':
                return { buffer: image.toJPEG(90), extension: '.jpg' }
            case 'high':
            default:
                return { buffer: image.toPNG(), extension: '.png' }
        }
    }

    setupHandlers() {
        ipcMain.handle('start-screenshot-mode', async () => {
            try {
                const mainWindow = this.windowManager.getWindow('main')
                if (mainWindow) {
                    mainWindow.hide()
                }

                if (process.platform === 'darwin') {
                    await new Promise((resolve) => setTimeout(resolve, 500))
                }

                this.windowManager.closeWindowsByType('screenshot')

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
                    const windowType = `screenshot-${display.id}`

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
                console.error('Error starting screenshot mode:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('copy-screenshot', async (event, type, bounds, displayId) => {
            try {
                const senderWindow = BrowserWindow.fromWebContents(event.sender)
                if (senderWindow) {
                    senderWindow.hide()
                }

                await new Promise((resolve) => setTimeout(resolve, 200))

                const displays = screen.getAllDisplays()
                const primaryDisplay = screen.getPrimaryDisplay()
                const displayIdStr = (displayId ?? primaryDisplay.id).toString()
                const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

                const source = await this.findSourceForDisplay(targetDisplay)
                if (!source) {
                    throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
                }

                const image = await this.takeScreenshotForDisplay(source, type, bounds, targetDisplay)

                clipboard.writeImage(image)

                this.windowManager.closeWindowsByType('screenshot')

                return { success: true, message: 'Screenshot copied to clipboard' }
            } catch (error) {
                console.error('Copy screenshot error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.on('cancel-screenshot-mode', () => {
            this.windowManager.closeWindowsByType('screenshot')
        })

        ipcMain.handle('save-screenshot-directly', async (event, options) => {
            try {
                const { type, bounds, displayId, dataUrl, defaultFilename } = options

                const senderWindow = BrowserWindow.fromWebContents(event.sender)
                if (senderWindow) {
                    senderWindow.hide()
                }

                await new Promise((resolve) => setTimeout(resolve, 200))

                let imageBuffer
                let extension = '.png'

                if (dataUrl) {
                    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
                    const rawBuffer = Buffer.from(base64Data, 'base64')
                    const image = nativeImage.createFromBuffer(rawBuffer)
                    const qualityResult = this.applyQualitySettings(image)
                    imageBuffer = qualityResult.buffer
                    extension = qualityResult.extension
                } else {
                    const displays = screen.getAllDisplays()
                    const primaryDisplay = screen.getPrimaryDisplay()
                    const displayIdStr = (displayId ?? primaryDisplay.id).toString()
                    const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

                    const source = await this.findSourceForDisplay(targetDisplay)
                    if (!source) {
                        throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
                    }

                    const image = await this.takeScreenshotForDisplay(source, type, bounds, targetDisplay)
                    const qualityResult = this.applyQualitySettings(image)
                    imageBuffer = qualityResult.buffer
                    extension = qualityResult.extension
                }

                const screenshotsDir = this.ensureScreenshotsDirectory()

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
                let filename = defaultFilename || `Screenshot_${timestamp}.png`

                // Update extension based on quality setting
                if (defaultFilename) {
                    filename = defaultFilename.replace(/\.(png|jpg|jpeg)$/i, extension)
                } else {
                    filename = `Screenshot_${timestamp}${extension}`
                }

                const filepath = path.join(screenshotsDir, filename)

                fs.writeFileSync(filepath, imageBuffer)

                const { size } = fs.statSync(filepath)

                this.windowManager.closeWindowsByType('screenshot')

                return {
                    success: true,
                    path: filepath,
                    filename: filename,
                    size: size
                }
            } catch (error) {
                console.error('Save screenshot directly error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('take-screenshot', async (event, type, bounds, displayId, closeWindow) => {
            try {
                if (closeWindow) {
                    const senderWindow = BrowserWindow.fromWebContents(event.sender)
                    if (senderWindow) {
                        senderWindow.hide()
                    }
                    await new Promise((resolve) => setTimeout(resolve, 200))
                }

                const displays = screen.getAllDisplays()
                const primaryDisplay = screen.getPrimaryDisplay()
                const displayIdStr = (displayId ?? primaryDisplay.id).toString()
                const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

                const source = await this.findSourceForDisplay(targetDisplay)
                if (!source) {
                    throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
                }

                const image = await this.takeScreenshotForDisplay(source, type, bounds, targetDisplay)

                const screenshotsDir = this.ensureScreenshotsDirectory()

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
                const qualityResult = this.applyQualitySettings(image)
                const filename = `Screenshot_${timestamp}${qualityResult.extension}`
                const filepath = path.join(screenshotsDir, filename)

                fs.writeFileSync(filepath, qualityResult.buffer)

                const { size } = fs.statSync(filepath)

                if (closeWindow) {
                    this.windowManager.closeWindowsByType('screenshot')
                }

                return {
                    success: true,
                    path: filepath,
                    dataUrl: image.toDataURL(),
                    filename: filename,
                    size: size
                }
            } catch (error) {
                console.error('Screenshot error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('save-screenshot-with-dialog', async (event, options) => {
            try {
                const { type, bounds, displayId, defaultFilename, dataUrl } = options

                const screenshotWindows = []
                this.windowManager.windows.forEach((window, key) => {
                    if (key.startsWith('screenshot-') && !window.isDestroyed()) {
                        screenshotWindows.push(window)
                        window.hide()
                    }
                })

                await new Promise((resolve) => setTimeout(resolve, 200))

                let nativeImageObj

                if (dataUrl) {
                    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
                    const rawBuffer = Buffer.from(base64Data, 'base64')
                    nativeImageObj = nativeImage.createFromBuffer(rawBuffer)
                } else {
                    const displays = screen.getAllDisplays()
                    const primaryDisplay = screen.getPrimaryDisplay()
                    const displayIdStr = (displayId ?? primaryDisplay.id).toString()
                    const targetDisplay = displays.find((d) => d.id.toString() === displayIdStr) || primaryDisplay

                    const source = await this.findSourceForDisplay(targetDisplay)
                    if (!source) {
                        throw new Error(`Could not find any screen source for displayId: ${displayIdStr}`)
                    }

                    nativeImageObj = await this.takeScreenshotForDisplay(source, type, bounds, targetDisplay)
                }

                // Remove extension from filename to avoid double extensions
                // The dialog will add the extension based on the user's selected filter
                const filenameWithoutExt = defaultFilename.replace(/\.(png|jpg|jpeg|webp)$/i, '')

                const defaultPath = path.join(os.homedir(), 'Pictures', filenameWithoutExt)

                const result = await dialog.showSaveDialog({
                    title: 'Save Screenshot',
                    defaultPath: defaultPath,
                    filters: [
                        { name: 'PNG Image', extensions: ['png'] },
                        { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
                        { name: 'WEBP Image', extensions: ['webp'] },
                        { name: 'All Files', extensions: ['*'] }
                    ],
                    properties: ['createDirectory', 'showOverwriteConfirmation']
                })

                if (result.canceled || !result.filePath) {
                    screenshotWindows.forEach((window) => {
                        if (!window.isDestroyed()) {
                            window.show()
                        }
                    })
                    return { success: false, canceled: true }
                }

                const fileExtension = path.extname(result.filePath).toLowerCase()
                let finalImageBuffer

                // Apply format based on user's choice in dialog
                // Quality settings are applied for JPEG compression
                const settings = this.store.get('settings') || {}
                const quality = settings.uploadQuality || 'high'

                if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
                    // Use quality setting for JPEG compression level
                    const jpegQuality = quality === 'low' ? 75 : quality === 'medium' ? 90 : 95
                    finalImageBuffer = nativeImageObj.toJPEG(jpegQuality)
                } else if (fileExtension === '.webp') {
                    // WebP doesn't have direct support, save as PNG
                    finalImageBuffer = nativeImageObj.toPNG()
                } else {
                    // PNG or other formats - always use PNG (lossless)
                    finalImageBuffer = nativeImageObj.toPNG()
                }

                fs.writeFileSync(result.filePath, finalImageBuffer)

                const { size } = fs.statSync(result.filePath)

                this.windowManager.closeWindowsByType('screenshot')

                return {
                    success: true,
                    path: result.filePath,
                    filename: path.basename(result.filePath),
                    size: size
                }
            } catch (error) {
                console.error('Save screenshot with dialog error:', error)
                return { success: false, error: error.message }
            }
        })

        ipcMain.handle('close-other-screenshot-windows', async (event, currentDisplayId) => {
            try {
                const currentDisplayIdStr = currentDisplayId?.toString()

                this.windowManager.windows.forEach((window, key) => {
                    if (key.startsWith('screenshot-') && !window.isDestroyed()) {
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
    }

    cleanup() {
        if (this.mouseTrackingInterval) {
            clearInterval(this.mouseTrackingInterval)
            this.mouseTrackingInterval = null
        }
    }
}

export default ScreenshotService
