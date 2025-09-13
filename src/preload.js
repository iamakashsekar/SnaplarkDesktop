import { contextBridge, ipcRenderer } from 'electron'

const storeSend = (action, key, value) => ipcRenderer.sendSync('store-send', { action, key, value })

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    getDeviceName: () => ipcRenderer.invoke('get-device-name'),
    quitApp: () => ipcRenderer.send('quit-app'),
    showMainAtTray: (options) => ipcRenderer.invoke('show-main-at-tray', options),
    takeScreenshot: (type, bounds, displayId) => ipcRenderer.invoke('take-screenshot', type, bounds, displayId),
    copyScreenshot: (type, bounds, displayId) => ipcRenderer.invoke('copy-screenshot', type, bounds, displayId),
    printScreenshot: (type, bounds, displayId) => ipcRenderer.invoke('print-screenshot', type, bounds, displayId),
    searchImageGoogle: (type, bounds, displayId) => ipcRenderer.invoke('search-image-google', type, bounds, displayId),
    readFileAsBuffer: (filePath) => ipcRenderer.invoke('read-file-as-buffer', filePath),
    startScreenshotMode: () => ipcRenderer.invoke('start-screenshot-mode'),
    cancelScreenshotMode: () => ipcRenderer.send('cancel-screenshot-mode')
})

// Window management APIs
contextBridge.exposeInMainWorld('electronWindows', {
    createWindow: (type, options) => ipcRenderer.invoke('create-window', type, options),
    closeWindow: (type) => ipcRenderer.invoke('close-window', type),
    centerWindow: (type) => ipcRenderer.invoke('center-window', type),
    showWindow: (type) => ipcRenderer.invoke('show-window', type),
    hideWindow: (type) => ipcRenderer.invoke('hide-window', type),
    resizeWindow: (type, width, height) => ipcRenderer.invoke('resize-window', type, width, height),
    getWindowType: () => ipcRenderer.invoke('get-window-type'),
    closeWindowsByType: (type) => ipcRenderer.invoke('close-windows-by-type', type),
    onDisplayChanged: (callback) => {
        ipcRenderer.on('display-changed', (event, displayId) => callback(displayId))
    },
    removeDisplayChangedListener: () => {
        ipcRenderer.removeAllListeners('display-changed')
    },
    // Used to fetch the initial screen capture to avoid race conditions.
    getInitialMagnifierData: () => ipcRenderer.invoke('get-initial-magnifier-data'),
    onMagnifierData: (callback) => {
        ipcRenderer.on('magnifier-data', (event, dataURL) => callback(dataURL))
    },
    removeMagnifierDataListener: () => {
        ipcRenderer.removeAllListeners('magnifier-data')
    }
})

// Notifications API
contextBridge.exposeInMainWorld('electronNotifications', {
    notify: (payload) => ipcRenderer.invoke('notify', payload),
    onAdd: (callback) => ipcRenderer.on('notifications:add', (e, n) => callback(n)),
    resize: (height) => ipcRenderer.send('notifications:resize', height),
    reposition: () => ipcRenderer.send('notifications:reposition'),
    close: () => ipcRenderer.send('notifications:close')
})

contextBridge.exposeInMainWorld('electronStore', {
    get: (key) => storeSend('get', key),
    set: (key, value) => storeSend('set', key, value),
    sync: (key, value) => ipcRenderer.send('store:sync', { key, value }),
    onUpdate: (callback) => ipcRenderer.on('store:update', (event, { key, value }) => callback(key, value))
})

// Handle authentication responses from the main process
contextBridge.exposeInMainWorld('electronAuth', {
    onAuthResponse: (callback) => {
        ipcRenderer.on('auth-response', (event, authData) => {
            callback(authData)
        })
    }
})

// Handle connectivity communication with the main process
contextBridge.exposeInMainWorld('electronConnectivity', {
    // Notify the main process of connectivity status
    notifyStatus: (status, isOnline) => {
        ipcRenderer.send('connectivity-status', {
            status,
            isOnline,
            timestamp: Date.now()
        })
    },

    // Listen for connectivity events from the main process
    onConnectivityEvent: (callback) => {
        ipcRenderer.on('connectivity-event', (event, data) => {
            callback(data)
        })
    },

    // Remove connectivity event listeners
    removeConnectivityListeners: () => {
        ipcRenderer.removeAllListeners('connectivity-event')
    }
})
