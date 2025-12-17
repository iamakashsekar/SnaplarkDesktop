import { app, Tray, Menu } from 'electron'
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

        const trayBounds = bounds || this.tray.getBounds()
        const { x, y } = trayBounds
        const { width, height } = mainWindow.getBounds()

        const margin = typeof gap === 'number' ? gap : 0
        const trayCenter = {
            x: x + trayBounds.width / 2,
            y: y + trayBounds.height / 2
        }

        mainWindow.setBounds({
            x: x - width / 2,
            y: process.platform === 'darwin' ? y + trayBounds.height + margin : y - height - margin,
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
                label: 'Open Widget',
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
