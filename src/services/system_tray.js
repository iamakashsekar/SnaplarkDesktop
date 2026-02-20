import { app, Tray, Menu, screen } from 'electron'
import path from 'node:path'

class SystemTray {
    constructor(windowManager) {
        const iconName = process.platform === 'win32' ? 'win-tray.ico' : 'tray.png'
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'icons', iconName)
            : path.join(__dirname, `../../resources/icons/${iconName}`)
        this.tray = new Tray(iconPath)
        this.windowManager = windowManager
        this.tray.setToolTip('Snaplark')
        this.tray.on('click', this.onTrayClick.bind(this))
        this.tray.on('right-click', this.onTrayRightClick.bind(this))
    }

    /**
     * Check if tray bounds are valid (non-zero and reasonable)
     * On first launch, tray.getBounds() may return {x:0, y:0, width:0, height:0}
     */
    _areTrayBoundsValid(bounds) {
        if (!bounds) return false
        // Check for zero dimensions (tray not yet positioned)
        if (bounds.width === 0 || bounds.height === 0) return false
        // Check for both x and y being 0 (likely uninitialized on macOS)
        if (bounds.x === 0 && bounds.y === 0) return false
        return true
    }

    /**
     * Get fallback tray position based on platform and screen geometry
     * macOS: Menu bar is at top, tray icons are on the right
     * Windows: Taskbar is typically at bottom, tray icons are on the right
     */
    _getFallbackTrayBounds(windowWidth) {
        const primaryDisplay = screen.getPrimaryDisplay()
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
        const { x: workAreaX, y: workAreaY } = primaryDisplay.workArea

        // Typical tray icon size
        const trayIconSize = 22

        if (process.platform === 'darwin') {
            // macOS: Position near top-right of screen (menu bar area)
            // Account for window width to center it properly
            return {
                x: workAreaX + screenWidth - windowWidth / 2 - 100, // 100px from right edge
                y: workAreaY - trayIconSize, // At the menu bar level
                width: trayIconSize,
                height: trayIconSize
            }
        } else {
            // Windows/Linux: Position near bottom-right (taskbar area)
            return {
                x: workAreaX + screenWidth - windowWidth / 2 - 100, // 100px from right edge
                y: workAreaY + screenHeight, // At the taskbar level
                width: trayIconSize,
                height: trayIconSize
            }
        }
    }

    // Reusable: position and show the main window at the tray icon location
    showMainAtTray(bounds = null, { force = false, gap } = {}) {
        let mainWindow = this.windowManager.getWindow('main')

        if (!mainWindow || mainWindow.isDestroyed()) {
            mainWindow = this.windowManager.createWindow('main')
        }

        if (!force && mainWindow.isVisible()) {
            mainWindow.hide()
            return
        }

        const { width, height } = mainWindow.getBounds()

        // Try to get tray bounds, validate them, and use fallback if invalid
        let trayBounds = bounds || this.tray.getBounds()
        if (!this._areTrayBoundsValid(trayBounds)) {
            trayBounds = this._getFallbackTrayBounds(width)
        }

        const { x, y } = trayBounds
        const margin = typeof gap === 'number' ? gap : 0
        const trayCenter = {
            x: x + trayBounds.width / 2,
            y: y + trayBounds.height / 2
        }

        // Calculate window position centered under/above the tray icon
        let windowX = Math.round(x + trayBounds.width / 2 - width / 2)
        let windowY

        if (process.platform === 'darwin') {
            // macOS: Window appears below the menu bar
            windowY = y + trayBounds.height + margin
        } else {
            // Windows/Linux: Window appears above the taskbar
            windowY = y - height - margin
        }

        // Ensure window stays within screen bounds
        const nearestDisplay = screen.getDisplayNearestPoint(trayCenter)
        const { width: screenWidth, height: screenHeight } = nearestDisplay.workAreaSize
        const { x: workAreaX, y: workAreaY } = nearestDisplay.workArea

        // Clamp horizontal position
        if (windowX < workAreaX) {
            windowX = workAreaX
        } else if (windowX + width > workAreaX + screenWidth) {
            windowX = workAreaX + screenWidth - width
        }

        // Clamp vertical position
        if (windowY < workAreaY) {
            windowY = workAreaY
        } else if (windowY + height > workAreaY + screenHeight) {
            windowY = workAreaY + screenHeight - height
        }

        mainWindow.setBounds({
            x: windowX,
            y: windowY,
            width,
            height
        })

        mainWindow.trayPosition = trayCenter

        // Set platform-specific properties BEFORE showing the window to prevent flashing
        if (process.platform === 'darwin') {
            mainWindow.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true
            })
            mainWindow.setAlwaysOnTop(true, 'screen-saver')
        } else if (process.platform === 'win32') {
            mainWindow.setMenu(null)
            mainWindow.setAlwaysOnTop(true, 'screen-saver')
        }

        // Now show the window after all properties are set
        mainWindow.show()
    }

    onTrayClick(event, bounds) {
        this.showMainAtTray(bounds, { gap: 5 })
    }

    onTrayRightClick() {
        // Hide main window if visible
        const mainWindow = this.windowManager.getWindow('main')
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            mainWindow.hide()
        }

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Open Snaplark',
                click: () => {
                    this.showMainAtTray(null, { gap: 5 })
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    app.quit()
                }
            }
        ])
        this.tray.popUpContextMenu(contextMenu)
    }
}

export default SystemTray
