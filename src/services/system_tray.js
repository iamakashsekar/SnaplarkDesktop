import { app, Tray } from 'electron'
import path from 'node:path'

class SystemTray {
    constructor(mainWindow) {
        const iconName = process.platform === 'win32' ? 'win-tray.ico' : 'tray.png'
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'icons', iconName)
            : path.join(__dirname, `../../resources/icons/${iconName}`)
        this.tray = new Tray(iconPath)
        this.mainWindow = mainWindow
        this.tray.setToolTip('Snaplark')
        this.tray.on('click', this.onTrayClick.bind(this))
        this.tray.on('right-click', this.onTrayRightClick.bind(this))
    }

    // Reusable: position and show the main window at the tray icon location
    showMainAtTray(bounds = null, { force = false, gap } = {}) {
        if (!force && this.mainWindow.isVisible()) {
            this.mainWindow.hide()
            return
        }

        const trayBounds = bounds || this.tray.getBounds()
        const { x, y } = trayBounds
        const { width, height } = this.mainWindow.getBounds()

        const margin = typeof gap === 'number' ? gap : 0
        const trayCenter = {
            x: x + trayBounds.width / 2,
            y: y + trayBounds.height / 2
        }

        this.mainWindow.setBounds({
            x: x - width / 2,
            y: process.platform === 'darwin' ? y + trayBounds.height + margin : y - height - margin,
            width,
            height
        })

        this.mainWindow.trayPosition = trayCenter

        if (typeof this.mainWindow.showInactive === 'function') {
            this.mainWindow.showInactive()
        } else {
            this.mainWindow.show()
        }

        if (process.platform === 'darwin') {
            this.mainWindow.setVisibleOnAllWorkspaces(true, {
                visibleOnFullScreen: true
            })
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver')
        }
    }

    onTrayClick(event, bounds) {
        this.showMainAtTray(bounds, { gap: 0 })
    }

    onTrayRightClick(event, bounds) {
        this.showMainAtTray(bounds, { gap: 0 })
    }
}

export default SystemTray
