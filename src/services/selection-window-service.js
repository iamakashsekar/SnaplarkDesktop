import { screen } from 'electron'

export function openSelectionWindows(windowManager, windowTypePrefix) {
    const allDisplays = screen.getAllDisplays()

    if (allDisplays.length === 0) {
        return { success: false, error: 'No displays available' }
    }

    const initialCursorPos = screen.getCursorScreenPoint()
    const initialActiveDisplay = screen.getDisplayNearestPoint(initialCursorPos)

    const windows = allDisplays.map((display) => {
        const windowType = `${windowTypePrefix}-${display.id}`
        const mouseX = initialCursorPos.x - display.bounds.x
        const mouseY = initialCursorPos.y - display.bounds.y

        const win = windowManager.createWindow(windowType, {
            ...display.bounds,
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            params: {
                displayId: display.id,
                initialMouseX: Math.max(0, Math.min(mouseX, display.bounds.width)),
                initialMouseY: Math.max(0, Math.min(mouseY, display.bounds.height)),
                activeDisplayId: initialActiveDisplay.id
            }
        })

        win.displayInfo = display

        win.setBounds({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height
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
        const sendActivationData = () => {
            const activationData = {
                isActive: isInitiallyActive,
                activeDisplayId: initialActiveDisplay.id,
                mouseX: initialCursorPos.x - display.bounds.x,
                mouseY: initialCursorPos.y - display.bounds.y
            }
            win.webContents.send('display-activation-changed', activationData)
        }

        win.activeDisplayId = initialActiveDisplay.id

        if (win.webContents.isLoading()) {
            win.webContents.once('did-finish-load', () => {
                setTimeout(sendActivationData, 50)
            })
        } else {
            setTimeout(sendActivationData, 50)
        }

        win.show()

        if (process.platform === 'win32') {
            win.focus()
            win.moveTop()
            win.setAlwaysOnTop(true, 'screen-saver')

            setImmediate(() => {
                if (!win.isDestroyed() && !win.isFocused()) {
                    win.focus()
                    win.moveTop()
                }
            })
        }

        return win
    })

    let currentActiveDisplayId = initialActiveDisplay.id

    const focusActiveWindow = (activeDisplayId) => {
        if (process.platform !== 'darwin') return

        const activeWindow = windows.find(
            (win) => !win.isDestroyed() && win.displayInfo && win.displayInfo.id === activeDisplayId
        )

        if (!activeWindow) return

        setTimeout(() => {
            if (!activeWindow.isDestroyed()) {
                activeWindow.focus()
                activeWindow.moveTop()
            }
        }, 0)
    }

    focusActiveWindow(initialActiveDisplay.id)

    const updateActiveWindow = (force = false) => {
        const cursorPos = screen.getCursorScreenPoint()
        const activeDisplay = screen.getDisplayNearestPoint(cursorPos)

        if (force || currentActiveDisplayId !== activeDisplay.id) {
            currentActiveDisplayId = activeDisplay.id
            focusActiveWindow(activeDisplay.id)

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

    const mouseTrackingInterval = setInterval(updateActiveWindow, 100)

    const cleanup = () => {
        clearInterval(mouseTrackingInterval)
    }

    windows.forEach((win) => {
        win.on('closed', cleanup)
    })

    return {
        success: true,
        displayCount: allDisplays.length,
        windowCount: windows.length
    }
}
