import { contextBridge, ipcRenderer } from 'electron'

// ==================== UTILITIES ====================

const storeSend = (action, key, value) => ipcRenderer.sendSync('store-send', { action, key, value })

// ==================== CORE ELECTRON APIs ====================

contextBridge.exposeInMainWorld('electron', {
    // System
    platform: process.platform,
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    getDeviceName: () => ipcRenderer.invoke('get-device-name'),
    quitApp: () => ipcRenderer.send('quit-app'),
    showMainAtTray: (options) => ipcRenderer.invoke('show-main-at-tray', options),
    readFileAsBuffer: (filePath) => ipcRenderer.invoke('read-file-as-buffer', filePath),

    // Screenshot functionality
    startScreenshotMode: () => ipcRenderer.invoke('start-screenshot-mode'),
    cancelScreenshotMode: () => ipcRenderer.send('cancel-screenshot-mode'),
    takeScreenshot: (type, bounds, displayId, closeWindow) =>
        ipcRenderer.invoke('take-screenshot', type, bounds, displayId, closeWindow),
    copyScreenshot: (type, bounds, displayId) => ipcRenderer.invoke('copy-screenshot', type, bounds, displayId),

    // Video recording functionality
    startVideoRecordingMode: () => ipcRenderer.invoke('start-video-recording-mode'),
    cancelVideoRecordingMode: () => ipcRenderer.send('cancel-video-recording-mode'),
    startVideoRecording: (options) => ipcRenderer.invoke('start-video-recording', options),
    stopVideoRecording: (recordingId) => ipcRenderer.invoke('stop-video-recording', recordingId),
    isVideoRecordingActive: () => ipcRenderer.invoke('is-video-recording-active'),
    stopAllVideoRecordings: () => ipcRenderer.invoke('stop-all-video-recordings'),

    // Generic IPC
    send: (channel, data) => ipcRenderer.send(channel, data),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    ipcRenderer: {
        on: (channel, callback) => ipcRenderer.on(channel, callback),
        removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback)
    }
})

// ==================== WINDOW MANAGEMENT APIs ====================

contextBridge.exposeInMainWorld('electronWindows', {
    // Window lifecycle
    createWindow: (type, options) => ipcRenderer.invoke('create-window', type, options),
    closeWindow: (type) => ipcRenderer.invoke('close-window', type),
    closeWindowsByType: (type) => ipcRenderer.invoke('close-windows-by-type', type),
    closeOtherScreenshotWindows: (currentDisplayId) =>
        ipcRenderer.invoke('close-other-screenshot-windows', currentDisplayId),
    closeOtherVideoRecordingWindows: (currentDisplayId) =>
        ipcRenderer.invoke('close-other-video-recording-windows', currentDisplayId),

    // Window operations
    centerWindow: (type) => ipcRenderer.invoke('center-window', type),
    showWindow: (type) => ipcRenderer.invoke('show-window', type),
    hideWindow: (type) => ipcRenderer.invoke('hide-window', type),
    makeWindowNonBlocking: (type) => ipcRenderer.invoke('make-window-non-blocking', type),
    makeWindowBlocking: (type) => ipcRenderer.invoke('make-window-blocking', type),
    resizeWindow: (type, width, height) => ipcRenderer.invoke('resize-window', type, width, height),
    getWindowType: () => ipcRenderer.invoke('get-window-type'),

    // Display events
    onDisplayChanged: (callback) => {
        ipcRenderer.on('display-changed', (event, displayId) => callback(displayId))
    },
    removeDisplayChangedListener: () => {
        ipcRenderer.removeAllListeners('display-changed')
    },
    onDisplayActivationChanged: (callback) => {
        ipcRenderer.on('display-activation-changed', (event, data) => callback(data))
    },
    removeDisplayActivationChangedListener: () => {
        ipcRenderer.removeAllListeners('display-activation-changed')
    },

    // Magnifier data
    getInitialMagnifierData: () => ipcRenderer.invoke('get-initial-magnifier-data'),
    onMagnifierData: (callback) => {
        ipcRenderer.on('magnifier-data', (event, dataURL) => callback(dataURL))
    },
    removeMagnifierDataListener: () => {
        ipcRenderer.removeAllListeners('magnifier-data')
    }
})

// ==================== NOTIFICATIONS APIs ====================

contextBridge.exposeInMainWorld('electronNotifications', {
    notify: (payload) => ipcRenderer.invoke('notify', payload),
    onAdd: (callback) => ipcRenderer.on('notifications:add', (e, n) => callback(n)),
    resize: (height) => ipcRenderer.send('notifications:resize', height),
    reposition: () => ipcRenderer.send('notifications:reposition'),
    close: () => ipcRenderer.send('notifications:close')
})

// ==================== STORE/PERSISTENCE APIs ====================

contextBridge.exposeInMainWorld('electronStore', {
    get: (key) => storeSend('get', key),
    getAll: () => storeSend('get'),
    set: (key, value) => storeSend('set', key, value),
    sync: (key, value) => ipcRenderer.send('store:sync', { key, value }),
    onUpdate: (callback) => ipcRenderer.on('store:update', (event, { key, value }) => callback(key, value))
})

// ==================== AUTHENTICATION APIs ====================

contextBridge.exposeInMainWorld('electronAuth', {
    onAuthResponse: (callback) => {
        ipcRenderer.on('auth-response', (event, authData) => {
            callback(authData)
        })
    }
})

// ==================== CONNECTIVITY APIs ====================

contextBridge.exposeInMainWorld('electronConnectivity', {
    notifyStatus: (status, isOnline) => {
        ipcRenderer.send('connectivity-status', {
            status,
            isOnline,
            timestamp: Date.now()
        })
    },
    onConnectivityEvent: (callback) => {
        ipcRenderer.on('connectivity-event', (event, data) => {
            callback(data)
        })
    },
    removeConnectivityListeners: () => {
        ipcRenderer.removeAllListeners('connectivity-event')
    }
})
