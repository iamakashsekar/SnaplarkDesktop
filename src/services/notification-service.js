import { ipcMain, screen } from 'electron'

class NotificationService {
    constructor(windowManager) {
        this.windowManager = windowManager
        this.lastDisplayId = null
        this.setupHandlers()
    }

    positionNotificationsWindow(win) {
        if (!win || win.isDestroyed()) return

        const referencePoint = screen.getCursorScreenPoint()
        const display = screen.getDisplayNearestPoint(referencePoint)
        this.lastDisplayId = display.id

        const margin = 16
        const { width, height } = win.getBounds()
        const workArea = display.workArea

        const x = workArea.x + workArea.width - width - margin
        let y

        if (process.platform === 'darwin') {
            y = workArea.y + margin
        } else {
            y = workArea.y + workArea.height - height - margin
        }

        win.setBounds({ x, y, width, height })
    }

    setupHandlers() {
        ipcMain.handle('notify', (event, notification) => {
            try {
                const win =
                    this.windowManager.getWindow('notifications') || this.windowManager.createWindow('notifications')

                if (process.platform === 'darwin') {
                    win.setAlwaysOnTop(true, 'screen-saver')
                    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
                }

                if (process.platform === 'win32') {
                    win.setMenu(null)
                    win.setAlwaysOnTop(true, 'screen-saver')
                }

                this.positionNotificationsWindow(win)

                if (typeof win.showInactive === 'function') {
                    win.showInactive()
                } else {
                    win.show()
                }

                // After a brief moment, allow the notification to go behind other windows
                // This keeps it on top initially but lets it go underneath when user focuses elsewhere
                setTimeout(() => {
                    if (!win.isDestroyed()) {
                        win.setAlwaysOnTop(false)
                    }
                }, 500)

                if (win.webContents.isLoadingMainFrame()) {
                    win.webContents.once('did-finish-load', () => {
                        setTimeout(() => {
                            win.webContents.send('notifications:add', notification)
                        }, 100)
                    })
                } else {
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

        ipcMain.on('notifications:resize', (event, height) => {
            const win = this.windowManager.getWindow('notifications')
            if (!win || win.isDestroyed()) return

            const { width } = win.getBounds()
            const minHeight = 10
            const nextHeight = Math.max(minHeight, Math.ceil(height))
            win.setSize(width, nextHeight, true)
            this.positionNotificationsWindow(win)
        })

        ipcMain.on('notifications:reposition', () => {
            const win = this.windowManager.getWindow('notifications')
            if (!win || win.isDestroyed()) return
            this.positionNotificationsWindow(win)
        })

        ipcMain.on('notifications:close', () => {
            const win = this.windowManager.getWindow('notifications')
            if (win) {
                win.hide()
                win.close()
            }
        })

        ipcMain.on('notifications:hide', () => {
            const win = this.windowManager.getWindow('notifications')
            if (win) {
                win.hide()
            }
        })

        ipcMain.on('notifications:show', () => {
            const win = this.windowManager.getWindow('notifications')
            if (win) {
                win.showInactive()
            }
        })
    }
}

export default NotificationService
