import { contextBridge, ipcRenderer } from "electron";

const storeSend = (action, key, value) =>
  ipcRenderer.sendSync("store-send", { action, key, value });

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getDeviceName: () => ipcRenderer.invoke("get-device-name"),
  quitApp: () => ipcRenderer.send("quit-app"),
  takeScreenshot: (type, bounds, displayId) =>
    ipcRenderer.invoke("take-screenshot", type, bounds, displayId),
  captureScreenshot: (type, bounds, displayId) =>
    ipcRenderer.invoke("capture-screenshot", type, bounds, displayId),
  copyScreenshot: (type, bounds, displayId) =>
    ipcRenderer.invoke("copy-screenshot", type, bounds, displayId),
  printScreenshot: (type, bounds, displayId) =>
    ipcRenderer.invoke("print-screenshot", type, bounds, displayId),
  searchImageGoogle: (type, bounds, displayId) =>
    ipcRenderer.invoke("search-image-google", type, bounds, displayId),
  startScreenshotMode: () => ipcRenderer.invoke("start-screenshot-mode"),
  cancelScreenshotMode: () => ipcRenderer.send("cancel-screenshot-mode"),
});

// Window management APIs
contextBridge.exposeInMainWorld("electronWindows", {
  createWindow: (type, options) =>
    ipcRenderer.invoke("create-window", type, options),
  closeWindow: (type) => ipcRenderer.invoke("close-window", type),
  centerWindow: (type) => ipcRenderer.invoke("center-window", type),
  showWindow: (type) => ipcRenderer.invoke("show-window", type),
  hideWindow: (type) => ipcRenderer.invoke("hide-window", type),
  resizeWindow: (type, width, height) =>
    ipcRenderer.invoke("resize-window", type, width, height),
  getWindowType: () => ipcRenderer.invoke("get-window-type"),
  closeWindowsByType: (type) =>
    ipcRenderer.invoke("close-windows-by-type", type),
  onDisplayChanged: (callback) => {
    ipcRenderer.on("display-changed", (event, displayId) =>
      callback(displayId)
    );
  },
  removeDisplayChangedListener: () => {
    ipcRenderer.removeAllListeners("display-changed");
  },
  // Used to fetch the initial screen capture to avoid race conditions.
  getInitialMagnifierData: () => ipcRenderer.invoke('get-initial-magnifier-data'),
  onMagnifierData: (callback) => {
    ipcRenderer.on("magnifier-data", (event, dataURL) => callback(dataURL));
  },
  removeMagnifierDataListener: () => {
    ipcRenderer.removeAllListeners("magnifier-data");
  },
});

contextBridge.exposeInMainWorld("electronStore", {
  get: (key) => storeSend("get", key),
  set: (key, value) => storeSend("set", key, value),
});

// Handle authentication responses from the main process
contextBridge.exposeInMainWorld("electronAuth", {
  onAuthResponse: (callback) => {
    ipcRenderer.on("auth-response", (event, authData) => {
      callback(authData);
    });
  }
});

// Handle system tray screenshot trigger
contextBridge.exposeInMainWorld("electronTray", {
  // Listen for tray screenshot trigger
  onScreenshotFromTray: (callback) => {
    ipcRenderer.on("start-screenshot-from-tray", () => {
      callback();
    });
  },

  // Remove tray listeners
  removeTrayListeners: () => {
    ipcRenderer.removeAllListeners("start-screenshot-from-tray");
  },
});

// Handle connectivity communication with main process
contextBridge.exposeInMainWorld("electronConnectivity", {
  // Notify main process of connectivity status
  notifyStatus: (status, isOnline) => {
    ipcRenderer.send("connectivity-status", {
      status,
      isOnline,
      timestamp: Date.now(),
    });
  },

  // Listen for connectivity events from main process
  onConnectivityEvent: (callback) => {
    ipcRenderer.on("connectivity-event", (event, data) => {
      callback(data);
    });
  },

  // Remove connectivity event listeners
  removeConnectivityListeners: () => {
    ipcRenderer.removeAllListeners("connectivity-event");
  },
});
