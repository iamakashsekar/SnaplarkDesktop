import windowService from "@/services/window.js";

export function useWindows() {
  const createWindow = async (type, options = {}) => {
    try {
      if (window.electronWindows?.createWindow) {
        const result = await window.electronWindows.createWindow(type, options);
        if (result.success) {
          return true;
        } else {
          console.error("Error creating window:", result.error);
          return false;
        }
      }
    } catch (error) {
      console.error("Error creating window:", error);
    }
    return false;
  };

  const resizeWindow = async (type, selector, options) => {
    return await windowService.resizeToContent(type, selector, options);
  };

  const resizeWindowTo = async (type, width, height) => {
    return await windowService.resize(type, width, height);
  };

  const closeWindow = async (type) => {
    try {
      if (window.electronWindows?.closeWindow) {
        const result = await window.electronWindows.closeWindow(type);
        if (result.success) {
          return true;
        } else {
          console.error("Error closing window:", result.error);
          return false;
        }
      }
    } catch (error) {
      console.error("Error closing window:", error);
    }
    return false;
  };

  const showWindow = async (type) => {
    try {
      if (window.electronWindows?.showWindow) {
        const result = await window.electronWindows.showWindow(type);
        if (result.success) {
          return true;
        } else {
          console.error("Error showing window:", result.error);
          return false;
        }
      }
    } catch (error) {
      console.error("Error showing window:", error);
    }
    return false;
  };

  const hideWindow = async (type) => {
    try {
      if (window.electronWindows?.hideWindow) {
        const result = await window.electronWindows.hideWindow(type);
        if (result.success) {
          return true;
        } else {
          console.error("Error hiding window:", result.error);
          return false;
        }
      }
    } catch (error) {
      console.error("Error hiding window:", error);
    }
    return false;
  };

  const centerWindow = async (type) => {
    try {
      if (window.electronWindows?.centerWindow) {
        const result = await window.electronWindows.centerWindow(type);
        if (result.success) {
          return true;
        } else {
          console.error("Error centering window:", result.error);
          return false;
        }
      }
    } catch (error) {
      console.error("Error centering window:", error);
    }
    return false;
  };

  return {
    createWindow,
    resizeWindow,
    resizeWindowTo,
    closeWindow,
    centerWindow,
    showWindow,
    hideWindow,
  };
}
