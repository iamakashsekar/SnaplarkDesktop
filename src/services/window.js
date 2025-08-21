import { nextTick } from "vue";

/**
 * Global Window Utilities Service
 * Provides window management functionality for Electron app
 */

class WindowService {
  constructor() {}

  /**
   * Resize window to fit content automatically
   * @param {string} selector - CSS selector for content element
   * @param {Object} options - Resize options
   */
  async resizeToContent(type, selector, options = {}) {
    await nextTick();

    try {
      const content = document.querySelector(selector);
      if (!content) {
        console.warn(
          `Element with selector "${selector}" not found for window resize`
        );
        return;
      }

      const rect = content.getBoundingClientRect();
      let width = Math.ceil(rect.width);
      let height = Math.ceil(rect.height);

      await window.electronWindows.resizeWindow(type, width, height);
      return { width, height };
    } catch (error) {
      console.error("Error resizing window to content:", error);
      throw error;
    }
  }

  /**
   * Resize window to specific dimensions
   * @param {number} width - Target width
   * @param {number} height - Target height
   */
  async resize(type, width, height) {
    try {
      await window.electronWindows.resizeWindow(type, width, height);
      return { width, height };
    } catch (error) {
      console.error("Error resizing window:", error);
      throw error;
    }
  }

  /**
   * Get current window dimensions (if available)
   */
  getDimensions() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    };
  }

  /**
   * Center window on screen (if Electron provides this functionality)
   */
  async center() {
    // This would need to be implemented in main.js if needed
    console.log("Window center requested");
  }
}

// Create global instance
const windowService = new WindowService();

// Vue composable for easy use in components
export function useWindow() {
  return {
    // Core methods
    resizeToContent: windowService.resizeToContent.bind(windowService),
    resize: windowService.resize.bind(windowService),
    getDimensions: windowService.getDimensions.bind(windowService),
    center: windowService.center.bind(windowService),
  };
}

// Export service and utilities
export { windowService };
export default windowService;
