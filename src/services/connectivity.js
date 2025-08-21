import { ref, readonly, onUnmounted } from "vue";

/**
 * Global Connectivity Monitoring Service
 * Provides real-time internet connectivity status with events
 */

class ConnectivityService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = {
      online: [],
      offline: [],
      restored: [],
      lost: [],
      changed: [],
    };

    this.wasOnline = this.isOnline;
    this.setupEventListeners();

    console.log(
      `Connectivity Service initialized - Status: ${
        this.isOnline ? "Online" : "Offline"
      }`
    );
  }

  // Setup browser connectivity event listeners
  setupEventListeners() {
    window.addEventListener("online", this.handleOnline.bind(this));
    window.addEventListener("offline", this.handleOffline.bind(this));
  }

  // Handle online event
  handleOnline() {
    const wasOffline = !this.isOnline;
    this.isOnline = true;

    console.log("🌐 Internet connection detected");

    // Emit events
    this.emit("online");
    this.emit("changed", { isOnline: true, wasOffline });

    // If was offline before, this is a restoration
    if (wasOffline) {
      console.log("🔄 Internet connection restored");
      this.emit("restored");
    }

    // Notify main process
    this.notifyMainProcess("online");

    this.wasOnline = true;
  }

  // Handle offline event
  handleOffline() {
    const wasOnline = this.isOnline;
    this.isOnline = false;

    console.log("📵 Internet connection lost");

    // Emit events
    this.emit("offline");
    this.emit("changed", { isOnline: false, wasOnline });

    if (wasOnline) {
      this.emit("lost");
    }

    // Notify main process
    this.notifyMainProcess("offline");

    this.wasOnline = false;
  }

  // Subscribe to connectivity events
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  // Unsubscribe from events
  off(event, callback) {
    if (!this.listeners[event]) return;

    const index = this.listeners[event].indexOf(callback);
    if (index > -1) {
      this.listeners[event].splice(index, 1);
    }
  }

  // Emit events to all listeners
  emit(event, data = null) {
    if (!this.listeners[event]) return;

    this.listeners[event].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `Error in connectivity event listener for "${event}":`,
          error
        );
      }
    });
  }

  // Notify Electron main process
  notifyMainProcess(status) {
    if (window.electronConnectivity?.notifyStatus) {
      window.electronConnectivity.notifyStatus(status, this.isOnline);
    }
  }

  // Get current status
  getStatus() {
    return {
      isOnline: this.isOnline,
      wasOnline: this.wasOnline,
      timestamp: Date.now(),
    };
  }

  // Check connectivity with actual network request (optional)
  async checkRealConnectivity(url = "https://www.google.com/favicon.ico") {
    if (!this.isOnline) return false;

    try {
      const response = await fetch(url, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-cache",
        timeout: 5000,
      });
      return true;
    } catch (error) {
      console.warn("Real connectivity check failed:", error);
      return false;
    }
  }

  // Cleanup event listeners
  destroy() {
    window.removeEventListener("online", this.handleOnline.bind(this));
    window.removeEventListener("offline", this.handleOffline.bind(this));

    // Clear all listeners
    Object.keys(this.listeners).forEach((event) => {
      this.listeners[event] = [];
    });

    console.log("Connectivity Service destroyed");
  }
}

// Create global instance
const connectivityService = new ConnectivityService();

// Export service and utilities
export { connectivityService };

// Vue composable for easy use in components
export function useConnectivity() {
  const isOnline = ref(connectivityService.isOnline);
  const status = ref(connectivityService.getStatus());

  // Update reactive refs when connectivity changes
  const unsubscribe = connectivityService.on("changed", (data) => {
    isOnline.value = data.isOnline;
    status.value = connectivityService.getStatus();
  });

  // Cleanup on component unmount
  onUnmounted(() => {
    unsubscribe();
  });

  return {
    isOnline: readonly(isOnline),
    status: readonly(status),

    // Event subscription methods
    onOnline: (callback) => connectivityService.on("online", callback),
    onOffline: (callback) => connectivityService.on("offline", callback),
    onRestored: (callback) => connectivityService.on("restored", callback),
    onLost: (callback) => connectivityService.on("lost", callback),
    onChange: (callback) => connectivityService.on("changed", callback),

    // Utility methods
    checkRealConnectivity:
      connectivityService.checkRealConnectivity.bind(connectivityService),
    getStatus: connectivityService.getStatus.bind(connectivityService),
  };
}

// Global access (can be imported anywhere)
export default connectivityService;
