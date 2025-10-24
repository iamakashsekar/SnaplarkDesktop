import { ipcMain } from 'electron'

class StoreService {
    constructor(windowManager, store) {
        this.windowManager = windowManager
        this.store = store
        this.setupHandlers()
    }

    setupHandlers() {
        ipcMain.on('store:sync', (event, { key, value }) => {
            this.windowManager.getAllWindows().forEach((window) => {
                if (window.webContents !== event.sender) {
                    window.webContents.send('store:update', { key, value })
                }
            })
        })

        ipcMain.on('store-send', (event, params) => {
            const { action, key, value } = params

            switch (action) {
                case 'get':
                    event.returnValue = this.store.get(key)
                    break

                case 'set':
                    event.returnValue = this.store.set(key, value)
                    break
            }
        })
    }
}

export default StoreService
