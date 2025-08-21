# Multi-Window System Documentation

## Overview

Snaplark now supports multiple windows with a unified Vue 3 application. The system allows you to create different types of windows (main, settings, welcome, tour) while maintaining a single Vue app instance across all windows.

## Architecture

### WindowManager (Main Process)

- **Location**: `src/services/window-manager.js`
- **Purpose**: Manages the creation, configuration, and lifecycle of different window types
- **Features**:
  - Pre-configured window types with specific dimensions and behaviors
  - Window lifecycle management (create, show, hide, close)
  - URL parameter-based window type detection
  - Broadcasting capabilities for inter-window communication

### Vue Router Integration

- **Location**: `src/router/index.js`
- **Purpose**: Routes different window types to appropriate Vue components
- **Features**:
  - Automatic route detection based on window type
  - Navigation guards for window-specific routing
  - URL parameter handling

### Window Management Composable

- **Location**: `src/composables/useWindows.js`
- **Purpose**: Provides Vue components with window management capabilities
- **Features**:
  - Reactive window state
  - Window creation/management methods
  - Window type utilities

## Window Types

### Main Window

- **Dimensions**: 400×300 (non-resizable)
- **Features**: Transparent, frameless, always on top
- **Content**: Primary application interface (LoginView)
- **Usage**: Primary interaction window

### Settings Window

- **Dimensions**: 800×600 (resizable)
- **Features**: Standard window frame, modal behavior
- **Content**: Application settings and preferences
- **Usage**: Configuration and customization

### Welcome Window

- **Dimensions**: 1000×700 (non-resizable)
- **Features**: Standard window frame, modal behavior
- **Content**: Multi-slide welcome experience
- **Usage**: First-time user onboarding

### Tour Window

- **Dimensions**: 600×500 (non-resizable)
- **Features**: Standard window frame, modal behavior, always on top
- **Content**: Interactive application tour
- **Usage**: Feature introduction and guidance

## Usage Examples

### Creating Windows from Vue Components

```javascript
import { useWindows } from "@/composables/useWindows";

export default {
  setup() {
    const { createWindow, closeWindow } = useWindows();

    const openSettings = async () => {
      await createWindow("settings");
    };

    const openWelcome = async () => {
      await createWindow("welcome");
    };

    return { openSettings, openWelcome };
  },
};
```

### Creating Windows from Main Process (IPC)

```javascript
// In main process
const windowManager = new WindowManager();
const settingsWindow = windowManager.createWindow("settings");

// With options
const customWindow = windowManager.createWindow("settings", {
  width: 1000,
  height: 800,
  resizable: true,
});
```

### Detecting Window Type in Vue Components

```javascript
import { useWindows } from "@/composables/useWindows";

export default {
  setup() {
    const { currentWindowType, isMainWindow, isSettingsWindow } = useWindows();

    // Reactive window type
    console.log(currentWindowType.value); // 'main', 'settings', etc.

    // Utility methods
    if (isMainWindow()) {
      // Main window specific logic
    }

    return { currentWindowType, isMainWindow };
  },
};
```

## IPC Communication

### Available IPC Handlers

- `create-window`: Create a new window of specified type
- `close-window`: Close a window by type
- `show-window`: Show a hidden window
- `hide-window`: Hide a window
- `get-window-type`: Get the current window's type

### Example IPC Usage

```javascript
// From renderer process
const windowType = await window.electronWindows.getWindowType();
await window.electronWindows.createWindow("settings");
await window.electronWindows.closeWindow("tour");
```

## Adding New Window Types

### 1. Add Window Configuration

```javascript
// In src/services/window-manager.js
windowConfigs: {
  // ... existing configs
  newWindow: {
    width: 500,
    height: 400,
    resizable: true,
    frame: true,
    title: "New Window",
    show: false,
  }
}
```

### 2. Create Vue Component

```javascript
// src/views/NewWindowView.vue
<template>
  <div class="new-window">
    <h1>New Window Content</h1>
    <button @click="closeWindow">Close</button>
  </div>
</template>

<script setup>
import { useWindows } from '@/composables/useWindows';

const { closeCurrentWindow } = useWindows();

const closeWindow = () => {
  closeCurrentWindow();
};
</script>
```

### 3. Add Route

```javascript
// In src/router/index.js
import NewWindowView from "@/views/NewWindowView.vue";

const routes = [
  // ... existing routes
  {
    path: "/new-window",
    name: "newWindow",
    component: NewWindowView,
    meta: { windowType: "newWindow" },
  },
];
```

### 4. Update Composable (Optional)

```javascript
// In src/composables/useWindows.js
const isNewWindow = () => currentWindowType.value === "newWindow";

return {
  // ... existing returns
  isNewWindow,
};
```

## Best Practices

1. **Window Lifecycle**: Always handle window closed events properly
2. **Modal Windows**: Use parent-child relationships for modal behavior
3. **State Management**: Use Pinia store for shared state across windows
4. **Performance**: Avoid creating multiple instances of the same window type
5. **User Experience**: Provide clear visual feedback for window operations

## Debugging

### Development Controls

In development mode, the main window includes debug controls:

- Settings button: Opens settings window
- Welcome button: Opens welcome window
- Tour button: Opens tour window

### Console Logging

Window operations are logged to the console for debugging:

```javascript
console.log("Window created:", windowType);
console.log("Window closed:", windowType);
```

### Error Handling

All window operations include try-catch blocks with error logging:

```javascript
try {
  await createWindow("settings");
} catch (error) {
  console.error("Error creating window:", error);
}
```

## Future Enhancements

- Dynamic window configuration
- Window state persistence
- Inter-window messaging system
- Custom window templates
- Window animation effects
