# Global Window Service

This document explains how to use the global window utilities service for window management operations in the Snaplark Electron app.

## Overview

The window service provides:

- **Automatic content-based resizing**
- **Manual window resizing** with constraints
- **Size presets** for common window sizes
- **Auto-resize observers** with debouncing
- **Global access** through store or composable

## Basic Usage

### In Vue Components (Composable)

```vue
<script setup>
import { useWindow } from "@/services/window.js";

const { resizeToContent, resize, setupAutoResize } = useWindow();

// Resize to fit specific content
const resizeToMyContent = () => {
  resizeToContent(".my-content");
};

// Resize to specific dimensions
const resizeToSmall = () => {
  resize(400, 300);
};

// Setup automatic resizing
onMounted(() => {
  const cleanup = setupAutoResize(".my-content");

  onUnmounted(() => {
    cleanup(); // Clean up observer
  });
});
</script>
```

### Through Store (Global Access)

```javascript
import { useStore } from "@/store.js";

const store = useStore();

// Quick resize methods
await store.resizeToLogin(); // Resize to fit .login-container
await store.resizeToMain(); // Resize to fit .main-container

// Manual dimensions
await store.resizeWindowTo(600, 500);

// Size presets
await store.resizeWindowSmall(); // 400x300
await store.resizeWindowMedium(); // 600x500
await store.resizeWindowLarge(); // 800x700

// Custom content selector
await store.resizeWindow(".my-custom-content", {
  padding: 20,
  minWidth: 350,
  maxHeight: 600,
});
```

### Direct Service Access

```javascript
import windowService from "@/services/window.js";

// All methods available directly
await windowService.resizeToContent(".content");
await windowService.resize(500, 400);
await windowService.setPreset("medium");

// Get current dimensions
const dims = windowService.getDimensions();
console.log(dims); // { width: 800, height: 600, screenWidth: 1920, screenHeight: 1080 }
```

## Available Methods

### `resizeToContent(selector, options)`

Automatically resize window to fit content.

```javascript
await resizeToContent(".my-content", {
  minWidth: 300, // Minimum width
  minHeight: 200, // Minimum height
  maxWidth: 1200, // Maximum width
  maxHeight: 800, // Maximum height
  padding: 10, // Extra padding around content
});
```

### `resize(width, height)`

Resize to specific dimensions.

```javascript
await resize(600, 500);
```

### `setPreset(preset)`

Use predefined size presets.

```javascript
await setPreset("small"); // 400x300
await setPreset("medium"); // 600x500
await setPreset("large"); // 800x700
await setPreset("compact"); // 350x250
```

### `setupAutoResize(selector, debounceMs, options)`

Automatically resize when content changes.

```javascript
const cleanup = setupAutoResize(".content", 100, {
  padding: 20,
  maxWidth: 1000,
});

// Call cleanup when component unmounts
cleanup();
```

### `getDimensions()`

Get current window and screen dimensions.

```javascript
const dims = getDimensions();
// Returns: { width, height, screenWidth, screenHeight }
```

## Quick Access Methods

The composable provides convenient shortcuts:

```javascript
const {
  resizeToLogin, // Resize to .login-container
  resizeToMain, // Resize to .main-container
  resizeSmall, // Set to small preset
  resizeMedium, // Set to medium preset
  resizeLarge, // Set to large preset
} = useWindow();

// Usage
await resizeToLogin();
await resizeSmall();
```

## Store Integration

All window methods are available through the global store:

```javascript
const store = useStore();

// Content-based resizing
await store.resizeToLogin();
await store.resizeToMain();
await store.resizeWindow(".custom-selector");

// Dimension-based resizing
await store.resizeWindowTo(width, height);

// Presets
await store.resizeWindowSmall();
await store.resizeWindowMedium();
await store.resizeWindowLarge();

// Direct service access
const windowService = store.getWindowService();
```

## Practical Examples

### Login Page Auto-Resize

```javascript
// In LoginView.vue
onMounted(async () => {
  // Initial resize
  await store.resizeToLogin();

  // Auto-resize when content changes
  const cleanup = setupAutoResize(".login-container");

  onUnmounted(() => {
    cleanup();
  });
});
```

### Dynamic Content Resizing

```javascript
// When content changes
const updateContent = async (newContent) => {
  content.value = newContent;

  // Wait for DOM update, then resize
  await nextTick();
  await resizeToContent(".dynamic-content");
};
```

### Multi-View Application

```javascript
// Different views, different sizes
const switchToView = async (viewName) => {
  switch (viewName) {
    case "login":
      await store.resizeToLogin();
      break;
    case "main":
      await store.resizeToMain();
      break;
    case "compact":
      await store.resizeWindowSmall();
      break;
  }
};
```

### Responsive Window Behavior

```javascript
// Resize based on content complexity
const adaptWindowSize = async () => {
  const items = getDisplayItems();

  if (items.length > 10) {
    await store.resizeWindowLarge();
  } else if (items.length > 5) {
    await store.resizeWindowMedium();
  } else {
    await store.resizeWindowSmall();
  }
};
```

## Auto-Resize with Cleanup

```javascript
// Setup auto-resize with proper cleanup
const useAutoResize = (selector = ".content") => {
  let cleanup = null;

  onMounted(() => {
    cleanup = setupAutoResize(selector, 150, {
      padding: 10,
      minWidth: 350,
    });
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return { cleanup };
};
```

## Error Handling

```javascript
// All methods handle errors gracefully
try {
  await resizeToContent(".non-existent");
} catch (error) {
  console.error("Resize failed:", error);
  // Fallback to default size
  await resize(400, 300);
}
```

## Best Practices

1. **Use Store Methods**: Prefer `store.resizeToLogin()` over direct calls
2. **Cleanup Observers**: Always clean up auto-resize observers
3. **Wait for DOM**: Use `nextTick()` before resizing after content changes
4. **Handle Errors**: Window operations can fail, handle gracefully
5. **Debounce Changes**: Use auto-resize for frequently changing content

## Performance

- **Debounced**: Auto-resize uses debouncing to prevent excessive calls
- **Cached Elements**: Efficiently finds and measures content
- **Error Recovery**: Gracefully handles missing elements or methods
- **Memory Safe**: Proper cleanup prevents memory leaks

The window service is production-ready and provides a clean API for all window management needs! 🪟
