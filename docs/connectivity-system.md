# Global Connectivity Monitoring System

This document explains how to use the global connectivity monitoring system that works across the entire Snaplark app, including the Electron main process.

## Overview

The connectivity system provides:

- **Global state management** for internet connectivity
- **Event-driven architecture** with custom events
- **Electron main process integration** via IPC
- **Vue composable** for easy component integration
- **Store integration** for global access

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Components    │    │   Main Store     │    │ Connectivity    │
│                 │◄──►│                  │◄──►│ Service         │
│ (useConnectivity)│    │ (global state)   │    │ (events)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                  │                       │
                                  ▼                       ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Preload.js     │    │ Browser Events  │
                       │   (IPC Bridge)   │    │ (online/offline)│
                       └──────────────────┘    └─────────────────┘
                                  │
                                  ▼
                       ┌──────────────────┐
                       │   Main Process   │
                       │ (Electron main)  │
                       └──────────────────┘
```

## Basic Usage

### In Vue Components

```vue
<script setup>
import { useConnectivity } from "@/services/connectivity.js";

const { isOnline, onRestored, onLost } = useConnectivity();

// Listen for connectivity events
onRestored(() => {
  console.log("Connection restored!");
  // Retry failed requests
});

onLost(() => {
  console.log("Connection lost!");
  // Show offline message
});
</script>

<template>
  <div>
    <div v-if="isOnline">🌐 Online</div>
    <div v-else>📵 Offline</div>
  </div>
</template>
```

### In Store (Global Access)

```javascript
import { useStore } from "@/store.js";

const store = useStore();

// Check connectivity status
if (store.isOnline) {
  // Make API calls
}

// Get detailed status
const status = store.connectivityStatus;
console.log(status); // { isOnline: true, wasOnline: false, timestamp: 1234567890 }

// Access connectivity service directly
const connectivityService = store.getConnectivityService();
```

### Direct Service Access

```javascript
import connectivityService from "@/services/connectivity.js";

// Get current status
console.log(connectivityService.isOnline);

// Listen for events
const unsubscribe = connectivityService.on("restored", () => {
  console.log("Back online!");
});

// Clean up
unsubscribe();
```

## Available Events

The connectivity system emits the following events:

### `online`

Triggered when internet connection is detected.

```javascript
connectivityService.on("online", () => {
  console.log("Internet connection detected");
});
```

### `offline`

Triggered when internet connection is lost.

```javascript
connectivityService.on("offline", () => {
  console.log("Internet connection lost");
});
```

### `restored`

Triggered when connection comes back after being offline.

```javascript
connectivityService.on("restored", () => {
  console.log("Connection restored - retry operations");
  // Perfect for retrying failed API calls
});
```

### `lost`

Triggered when connection is lost after being online.

```javascript
connectivityService.on("lost", () => {
  console.log("Connection lost - pause operations");
  // Perfect for pausing uploads, etc.
});
```

### `changed`

Triggered on any connectivity change with detailed data.

```javascript
connectivityService.on("changed", (data) => {
  console.log("Connectivity changed:", data);
  // data = { isOnline: true, wasOffline: true }
});
```

## Vue Composable API

The `useConnectivity()` composable provides reactive access:

```javascript
const {
  isOnline, // Reactive boolean
  status, // Reactive status object

  // Event listeners (return unsubscribe functions)
  onOnline, // Listen for online events
  onOffline, // Listen for offline events
  onRestored, // Listen for restored events
  onLost, // Listen for lost events
  onChange, // Listen for any change

  // Utility methods
  checkRealConnectivity, // Test actual network access
  getStatus, // Get current status object
} = useConnectivity();
```

## Main Process Integration

The connectivity system communicates with Electron's main process:

### In Main Process (main.js)

```javascript
// Already set up - connectivity events are automatically received
ipcMain.on("connectivity-status", (event, data) => {
  console.log(`Main process received: ${data.status}`);

  if (data.status === "online") {
    // Resume background tasks
  } else if (data.status === "offline") {
    // Pause background tasks
  }
});
```

### Custom Main Process Actions

You can add custom logic in `src/main.js`:

```javascript
ipcMain.on("connectivity-status", (event, data) => {
  if (data.status === "restored") {
    // Trigger background sync
    startBackgroundSync();
  } else if (data.status === "lost") {
    // Save pending operations
    savePendingOperations();
  }
});
```

## Practical Examples

### Blog Post Fetching (Login Page)

```javascript
const { isOnline, onRestored } = useConnectivity();

const fetchBlogPost = async () => {
  if (!isOnline.value) {
    console.log("Skipping blog fetch - offline");
    return;
  }

  try {
    await blogService.getPosts();
  } catch (error) {
    console.error("Blog fetch failed:", error);
  }
};

// Retry when connection is restored
onRestored(() => {
  fetchBlogPost();
});
```

### Media Upload Queue

```javascript
const { isOnline, onRestored, onLost } = useConnectivity();
const uploadQueue = ref([]);

onLost(() => {
  // Pause all uploads
  console.log("Connection lost - pausing uploads");
});

onRestored(() => {
  // Resume uploads
  console.log("Connection restored - resuming uploads");
  processUploadQueue();
});

const uploadFile = (file) => {
  if (!isOnline.value) {
    // Add to queue for later
    uploadQueue.value.push(file);
    return;
  }

  // Upload immediately
  mediaService.uploadScreenshot(file);
};
```

### API Client Integration

```javascript
// In API client interceptor
import connectivityService from "@/services/connectivity.js";

axios.interceptors.request.use((config) => {
  if (!connectivityService.isOnline) {
    throw new Error("No internet connection");
  }
  return config;
});
```

### Real Connectivity Check

```javascript
const { checkRealConnectivity } = useConnectivity();

// Test actual network access (not just browser status)
const hasRealConnection = await checkRealConnectivity();
if (hasRealConnection) {
  // Proceed with network operations
}
```

## Advanced Usage

### Custom Event Handling

```javascript
import connectivityService from "@/services/connectivity.js";

// Create custom connectivity-based logic
class UploadManager {
  constructor() {
    this.queue = [];
    this.setupConnectivityHandling();
  }

  setupConnectivityHandling() {
    connectivityService.on("restored", () => {
      this.processQueue();
    });

    connectivityService.on("lost", () => {
      this.pauseUploads();
    });
  }

  addToQueue(file) {
    this.queue.push(file);
    if (connectivityService.isOnline) {
      this.processQueue();
    }
  }
}
```

### Store Extensions

```javascript
// Add custom connectivity actions to store
actions: {
  // Retry failed operations when back online
  retryFailedOperations() {
    if (this.isOnline) {
      this.retryApiCalls();
      this.resumeUploads();
      this.syncPendingData();
    }
  },

  // Handle going offline
  handleOffline() {
    this.pauseBackgroundTasks();
    this.saveLocalState();
  }
}
```

## Best Practices

1. **Use Events for Actions**: Listen for `restored`/`lost` events rather than polling
2. **Cache Offline Data**: Store data locally when offline for later sync
3. **User Feedback**: Always show connectivity status to users
4. **Graceful Degradation**: App should work offline where possible
5. **Cleanup Listeners**: Always unsubscribe from events in `onUnmounted`

## Debugging

Enable connectivity debugging:

```javascript
// All connectivity events are logged to console
connectivityService.on("changed", (data) => {
  console.log("Connectivity Debug:", data);
});
```

Main process logs:

```
[Main] Connectivity status received: online (Online)
[Main] App is online - can perform network operations
```

## Performance

- **Lightweight**: Uses browser native events
- **Efficient**: No polling, event-driven only
- **Memory Safe**: Automatic cleanup on component unmount
- **Global**: Single instance shared across entire app

The connectivity system is production-ready and handles all edge cases for robust offline/online functionality! 🌐
