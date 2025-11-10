# Complete Screen Recording Implementation Guide

## For Electron + Vue.js Applications

> **Reference Project**: Cap (Tauri + Rust + SolidJS)  
> **Target**: Electron + Vue.js Implementation  
> **Purpose**: This document contains all necessary information to implement screen recording with area selection, highlighting, and efficient file saving.

---

## Table of Contents

1. [Project Structure & File Organization](#project-structure--file-organization)
2. [Architecture Overview](#architecture-overview)
3. [Area Selection System](#area-selection-system)
4. [Recording Overlay/Highlighting](#recording-overlayhighlighting)
5. [Screen Capture Implementation](#screen-capture-implementation)
6. [File Saving Pipeline](#file-saving-pipeline)
7. [Complete Vue.js + Electron Implementation](#complete-vuejs--electron-implementation)
8. [Code References from Cap Project](#code-references-from-cap-project)

---

## Project Structure & File Organization

### Recommended File Structure

```
your-electron-app/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts              # Main entry point
│   │   ├── windows/
│   │   │   ├── windowManager.ts # Window creation/management
│   │   │   ├── areaSelect.ts    # Area selection window
│   │   │   └── overlay.ts       # Recording overlay window
│   │   ├── recording/
│   │   │   ├── recorder.ts      # Main recording controller
│   │   │   ├── capture.ts      # Screen capture logic
│   │   │   └── encoder.ts      # Video encoding pipeline
│   │   └── ipc/
│   │       └── handlers.ts      # IPC handlers
│   ├── renderer/                # Vue.js frontend
│   │   ├── components/
│   │   │   ├── Cropper.vue     # Area selection component
│   │   │   └── RecordingControls.vue
│   │   ├── views/
│   │   │   ├── AreaSelect.vue  # Area selection view
│   │   │   └── RecordingOverlay.vue
│   │   ├── stores/
│   │   │   └── recording.ts    # Recording state management
│   │   └── utils/
│   │       └── bounds.ts       # Bounds calculation utilities
│   └── shared/
│       └── types.ts             # Shared TypeScript types
├── native/                      # Native modules (optional)
│   ├── capture-macos/           # macOS ScreenCaptureKit wrapper
│   └── capture-windows/         # Windows Desktop Duplication wrapper
└── package.json
```

---

## Architecture Overview

### Tech Stack Comparison

| Cap Project (Reference)  | Your Electron + Vue.js App        |
| ------------------------ | --------------------------------- |
| Tauri v2 (Rust backend)  | Electron (Node.js backend)        |
| SolidJS frontend         | Vue.js frontend                   |
| ScreenCaptureKit (macOS) | Native module or desktopCapturer  |
| Direct3D11 (Windows)     | Native module or desktopCapturer  |
| AVFoundation encoding    | FFmpeg with hardware acceleration |
| MediaFoundation encoding | FFmpeg with hardware acceleration |

### Key Components Flow

```
┌─────────────────────────────────────────────────────────┐
│              Vue.js Frontend (Renderer)                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Cropper.vue (Area Selection UI)                │   │
│  │  - Occluder overlay                              │   │
│  │  - Resize handles                                │   │
│  │  - Bounds management                             │   │
│  └──────────────┬──────────────────────────────────┘   │
│                 │ IPC (ipcRenderer)                     │
┌─────────────────▼──────────────────────────────────────┐
│         Electron Main Process (Node.js)                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Recording Controller                             │   │
│  │  - State management                               │   │
│  │  - Window management                              │   │
│  └──────────────┬──────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼──────────────────────────────────┐  │
│  │  Screen Capture                                  │  │
│  │  - Native module (ScreenCaptureKit/D3D11)      │  │
│  │  - OR desktopCapturer + software cropping       │  │
│  └──────────────┬──────────────────────────────────┘  │
│                 │                                        │
│  ┌──────────────▼──────────────────────────────────┐  │
│  │  Video Encoder (FFmpeg)                          │  │
│  │  - Hardware acceleration (h264_videotoolbox)    │  │
│  │  - Streaming pipeline                            │  │
│  └──────────────┬──────────────────────────────────┘  │
│                 │                                        │
│  ┌──────────────▼──────────────────────────────────┐  │
│  │  MP4 File Writer                                 │  │
│  │  - Streaming writes                             │  │
│  │  - Fragment MP4 format                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Area Selection System

### Reference Implementation

**Cap Project Files**:

- `apps/desktop/src/components/Cropper.tsx` (1266 lines) - Main cropper component
- `apps/desktop/src/routes/capture-area.tsx` - Area selection window
- `apps/desktop/src/routes/target-select-overlay.tsx` - Overlay with cropper

### Key Concepts

1. **Occluder Pattern**: Dark overlay covering everything except selected area
2. **Logical Coordinates**: Handle display scaling automatically
3. **Resize Handles**: 8 handles (4 corners + 4 edges) with smart constraints
4. **Bounds Persistence**: Remember last selected area per screen

### Vue.js Implementation

#### 1. Cropper Component (`src/renderer/components/Cropper.vue`)

```vue
<template>
  <div
    ref="containerRef"
    class="cropper-container"
    @mousedown="handleOverlayClick"
  >
    <!-- Occluder: Dark overlay everywhere except selection -->
    <div class="occluder-layer">
      <!-- Top blind -->
      <div class="occluder occluder-top" :style="{ height: `${bounds.y}px` }" />
      <!-- Bottom blind -->
      <div
        class="occluder occluder-bottom"
        :style="{ top: `${bounds.y + bounds.height}px` }"
      />
      <!-- Left blind -->
      <div
        class="occluder occluder-left"
        :style="{
          top: `${bounds.y}px`,
          width: `${bounds.x}px`,
          height: `${bounds.height}px`,
        }"
      />
      <!-- Right blind -->
      <div
        class="occluder occluder-right"
        :style="{
          top: `${bounds.y}px`,
          left: `${bounds.x + bounds.width}px`,
          height: `${bounds.height}px`,
        }"
      />
    </div>

    <!-- Selection Rectangle -->
    <div
      ref="selectionRef"
      class="selection-rectangle"
      :class="{ 'is-valid': isValid }"
      :style="{
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }"
      @mousedown.stop="handleSelectionDragStart"
    >
      <!-- Resize Handles -->
      <div
        v-for="handle in handles"
        :key="handle.id"
        class="resize-handle"
        :class="`handle-${handle.position}`"
        :style="getHandleStyle(handle)"
        @mousedown.stop="(e) => handleResizeStart(e, handle)"
      />

      <!-- Size Label (shown while resizing) -->
      <div v-if="isResizing" class="size-label">
        {{ bounds.width }} × {{ bounds.height }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { CropBounds, Handle } from "@/shared/types";

const props = defineProps<{
  initialCrop?: CropBounds;
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  aspectRatio?: number | null;
  showBounds?: boolean;
}>();

const emit = defineEmits<{
  cropChange: [bounds: CropBounds];
  interaction: [interacting: boolean];
}>();

const containerRef = ref<HTMLDivElement>();
const selectionRef = ref<HTMLDivElement>();

const MIN_SIZE = props.minSize || { width: 150, height: 150 };

const bounds = ref<CropBounds>(
  props.initialCrop || {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  }
);

const isResizing = ref(false);
const isDragging = ref(false);
const dragStart = ref<{ x: number; y: number; bounds: CropBounds } | null>(
  null
);

const isValid = computed(() => {
  return (
    bounds.value.width >= MIN_SIZE.width &&
    bounds.value.height >= MIN_SIZE.height
  );
});

// Resize handles configuration
const handles: Handle[] = [
  { id: "nw", position: "nw", cursor: "nwse-resize" },
  { id: "ne", position: "ne", cursor: "nesw-resize" },
  { id: "sw", position: "sw", cursor: "nesw-resize" },
  { id: "se", position: "se", cursor: "nwse-resize" },
  { id: "n", position: "n", cursor: "ns-resize" },
  { id: "s", position: "s", cursor: "ns-resize" },
  { id: "w", position: "w", cursor: "ew-resize" },
  { id: "e", position: "e", cursor: "ew-resize" },
];

function getHandleStyle(handle: Handle) {
  const { x, y, width, height } = bounds.value;
  const handleSize = 8;
  const offset = -handleSize / 2;

  const positions: Record<string, { left: string; top: string }> = {
    nw: { left: `${x + offset}px`, top: `${y + offset}px` },
    ne: { left: `${x + width + offset}px`, top: `${y + offset}px` },
    sw: { left: `${x + offset}px`, top: `${y + height + offset}px` },
    se: { left: `${x + width + offset}px`, top: `${y + height + offset}px` },
    n: { left: `${x + width / 2 + offset}px`, top: `${y + offset}px` },
    s: { left: `${x + width / 2 + offset}px`, top: `${y + height + offset}px` },
    w: { left: `${x + offset}px`, top: `${y + height / 2 + offset}px` },
    e: { left: `${x + width + offset}px`, top: `${y + height / 2 + offset}px` },
  };

  return {
    ...positions[handle.position],
    cursor: handle.cursor,
    width: `${handleSize}px`,
    height: `${handleSize}px`,
  };
}

function handleSelectionDragStart(e: MouseEvent) {
  if (!containerRef.value) return;
  e.preventDefault();
  isDragging.value = true;
  emit("interaction", true);

  const containerRect = containerRef.value.getBoundingClientRect();
  const startX = e.clientX - containerRect.left - bounds.value.x;
  const startY = e.clientY - containerRect.top - bounds.value.y;

  dragStart.value = { x: startX, y: startY, bounds: { ...bounds.value } };

  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.value || !dragStart.value) return;

    const containerRect = containerRef.value.getBoundingClientRect();
    let newX = e.clientX - containerRect.left - startX;
    let newY = e.clientY - containerRect.top - startY;

    // Constrain to container
    newX = Math.max(
      0,
      Math.min(newX, containerRect.width - bounds.value.width)
    );
    newY = Math.max(
      0,
      Math.min(newY, containerRect.height - bounds.value.height)
    );

    bounds.value = {
      ...bounds.value,
      x: newX,
      y: newY,
    };
    emit("cropChange", bounds.value);
  };

  const handleMouseUp = () => {
    isDragging.value = false;
    emit("interaction", false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

function handleResizeStart(e: MouseEvent, handle: Handle) {
  if (!containerRef.value) return;
  e.preventDefault();
  isResizing.value = true;
  emit("interaction", true);

  const containerRect = containerRef.value.getBoundingClientRect();
  const startBounds = { ...bounds.value };
  const startX = e.clientX;
  const startY = e.clientY;

  const handleMouseMove = (e: MouseEvent) => {
    if (!containerRef.value) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const newBounds = calculateResize(
      startBounds,
      handle.position,
      deltaX,
      deltaY,
      containerRect.width,
      containerRect.height
    );

    bounds.value = constrainBounds(
      newBounds,
      containerRect.width,
      containerRect.height
    );
    emit("cropChange", bounds.value);
  };

  const handleMouseUp = () => {
    isResizing.value = false;
    emit("interaction", false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

function handleOverlayClick(e: MouseEvent) {
  // Start new selection from click point
  if (e.target === containerRef.value) {
    const containerRect = containerRef.value!.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    bounds.value = {
      x,
      y,
      width: 1,
      height: 1,
    };

    // Start resizing from bottom-right
    handleResizeStart(e, { id: "se", position: "se", cursor: "nwse-resize" });
  }
}

function calculateResize(
  startBounds: CropBounds,
  handle: string,
  deltaX: number,
  deltaY: number,
  maxWidth: number,
  maxHeight: number
): CropBounds {
  let { x, y, width, height } = startBounds;

  // Handle different resize directions
  if (handle.includes("e")) {
    width = Math.max(
      MIN_SIZE.width,
      Math.min(startBounds.width + deltaX, maxWidth - startBounds.x)
    );
  }
  if (handle.includes("w")) {
    const newWidth = Math.max(MIN_SIZE.width, startBounds.width - deltaX);
    x = startBounds.x + startBounds.width - newWidth;
    width = newWidth;
  }
  if (handle.includes("s")) {
    height = Math.max(
      MIN_SIZE.height,
      Math.min(startBounds.height + deltaY, maxHeight - startBounds.y)
    );
  }
  if (handle.includes("n")) {
    const newHeight = Math.max(MIN_SIZE.height, startBounds.height - deltaY);
    y = startBounds.y + startBounds.height - newHeight;
    height = newHeight;
  }

  // Apply aspect ratio if specified
  if (props.aspectRatio) {
    const ratio = props.aspectRatio;
    if (handle.includes("e") || handle.includes("w")) {
      height = width / ratio;
      if (handle.includes("n")) {
        y = startBounds.y + startBounds.height - height;
      }
    } else {
      width = height * ratio;
      if (handle.includes("w")) {
        x = startBounds.x + startBounds.width - width;
      }
    }
  }

  return { x, y, width, height };
}

function constrainBounds(
  bounds: CropBounds,
  maxWidth: number,
  maxHeight: number
): CropBounds {
  let { x, y, width, height } = bounds;

  // Ensure minimum size
  width = Math.max(width, MIN_SIZE.width);
  height = Math.max(height, MIN_SIZE.height);

  // Constrain to container
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > maxWidth) {
    x = maxWidth - width;
    if (x < 0) {
      x = 0;
      width = maxWidth;
    }
  }
  if (y + height > maxHeight) {
    y = maxHeight - height;
    if (y < 0) {
      y = 0;
      height = maxHeight;
    }
  }

  return { x, y, width, height };
}

// Emit changes when bounds update
watch(
  bounds,
  (newBounds) => {
    emit("cropChange", newBounds);
  },
  { deep: true }
);
</script>

<style scoped>
.cropper-container {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  user-select: none;
}

.occluder-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.occluder {
  position: absolute;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.selection-rectangle {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.5);
  cursor: move;
  z-index: 10;
}

.selection-rectangle.is-valid {
  border-color: rgba(255, 255, 255, 0.8);
}

.resize-handle {
  position: absolute;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  z-index: 20;
}

.resize-handle:hover {
  background: #f0f0f0;
  border-color: rgba(0, 0, 0, 0.5);
}

.size-label {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
  pointer-events: none;
}
</style>
```

#### 2. Area Selection Window (`src/main/windows/areaSelect.ts`)

```typescript
import { BrowserWindow, screen } from "electron";
import path from "path";

export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createAreaSelectionWindow(displayId: number): BrowserWindow {
  const displays = screen.getAllDisplays();
  const display =
    displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    width: display.size.width,
    height: display.size.height,
    x: display.bounds.x,
    y: display.bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/areaSelect.js"),
    },
  });

  // Load Vue.js app route for area selection
  if (process.env.NODE_ENV === "development") {
    win.loadURL("http://localhost:5173/#/area-select");
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"), {
      hash: "area-select",
    });
  }

  return win;
}
```

#### 3. Area Selection View (`src/renderer/views/AreaSelect.vue`)

```vue
<template>
  <div class="area-select-view">
    <Cropper
      :initial-crop="initialCrop"
      :min-size="{ width: 150, height: 150 }"
      @crop-change="handleCropChange"
      @interaction="handleInteraction"
    />

    <!-- Controls -->
    <Transition name="fade">
      <div v-if="!isInteracting && isValid" class="controls">
        <button @click="handleConfirm" class="btn-confirm">
          Confirm Selection
        </button>
        <button @click="handleCancel" class="btn-cancel">Cancel</button>
      </div>
    </Transition>

    <!-- Validation Message -->
    <Transition name="fade">
      <div v-if="!isValid && !isInteracting" class="validation-message">
        Minimum size is 150 × 150 pixels
        <br />
        Current: {{ bounds.width }} × {{ bounds.height }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import Cropper from "@/components/Cropper.vue";
import type { CropBounds } from "@/shared/types";

const router = useRouter();

const bounds = ref<CropBounds>({
  x: 0,
  y: 0,
  width: 400,
  height: 300,
});

const isInteracting = ref(false);
const initialCrop = ref<CropBounds | undefined>(undefined);

const isValid = computed(() => {
  return bounds.value.width >= 150 && bounds.value.height >= 150;
});

function handleCropChange(newBounds: CropBounds) {
  bounds.value = newBounds;
}

function handleInteraction(interacting: boolean) {
  isInteracting.value = interacting;
}

function handleConfirm() {
  if (!isValid.value) return;

  // Send bounds back to main process via IPC
  window.electronAPI?.confirmAreaSelection(bounds.value);
  router.back();
}

function handleCancel() {
  window.electronAPI?.cancelAreaSelection();
  router.back();
}

// Load saved bounds for this screen
import { onMounted } from "vue";
onMounted(async () => {
  const displayId = await window.electronAPI?.getCurrentDisplayId();
  const savedBounds = await window.electronAPI?.getSavedBounds(displayId);
  if (savedBounds) {
    initialCrop.value = savedBounds;
    bounds.value = savedBounds;
  }
});
</script>

<style scoped>
.area-select-view {
  width: 100vw;
  height: 100vh;
  position: relative;
}

.controls {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  z-index: 100;
}

.btn-confirm,
.btn-cancel {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-confirm {
  background: #007aff;
  color: white;
}

.btn-confirm:hover {
  background: #0056b3;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  backdrop-filter: blur(10px);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
}

.validation-message {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 59, 48, 0.9);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
  z-index: 100;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

---

## Recording Overlay/Highlighting

### Reference Implementation

**Cap Project Files**:

- `apps/desktop/src/routes/window-capture-occluder.tsx` - Overlay component
- `apps/desktop/src-tauri/src/windows.rs:615-688` - Window creation logic

### Vue.js Implementation

#### Recording Overlay Window (`src/main/windows/overlay.ts`)

```typescript
import { BrowserWindow, screen } from "electron";
import path from "path";

export function createRecordingOverlay(
  bounds: CropBounds,
  displayId: number
): BrowserWindow {
  const displays = screen.getAllDisplays();
  const display =
    displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    width: display.size.width,
    height: display.size.height,
    x: display.bounds.x,
    y: display.bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // Don't steal focus
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load overlay HTML directly (no Vue.js needed for simple overlay)
  win.loadURL(`data:text/html,${getOccluderHTML(bounds, display.size)}`);

  return win;
}

function getOccluderHTML(
  bounds: CropBounds,
  screenSize: { width: number; height: number }
): string {
  const { x, y, width, height } = bounds;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          width: 100vw;
          height: 100vh;
          position: relative;
          pointer-events: none;
          overflow: hidden;
        }
        .occluder {
          position: absolute;
          background: rgba(0, 0, 0, 0.5);
        }
        .top {
          top: 0;
          left: 0;
          width: 100%;
          height: ${y}px;
        }
        .bottom {
          top: ${y + height}px;
          left: 0;
          width: 100%;
          height: ${screenSize.height - (y + height)}px;
        }
        .left {
          top: ${y}px;
          left: 0;
          width: ${x}px;
          height: ${height}px;
        }
        .right {
          top: ${y}px;
          left: ${x + width}px;
          width: ${screenSize.width - (x + width)}px;
          height: ${height}px;
        }
      </style>
    </head>
    <body>
      <div class="occluder top"></div>
      <div class="occluder bottom"></div>
      <div class="occluder left"></div>
      <div class="occluder right"></div>
    </body>
    </html>
  `;
}
```

---

## Screen Capture Implementation

### Reference Implementation

**Cap Project Files**:

- `crates/scap-screencapturekit/src/capture.rs` - macOS ScreenCaptureKit wrapper
- `crates/recording/src/sources/screen_capture/macos.rs` - macOS capture implementation
- `crates/recording/src/capture_pipeline.rs:168-258` - Bounds conversion logic

### Electron Implementation Options

#### Option 1: Native Module (Recommended for Performance)

Create a native addon that wraps ScreenCaptureKit (macOS) or Desktop Duplication API (Windows).

**macOS Native Module Structure**:

```
native/capture-macos/
├── binding.gyp
├── src/
│   └── capture.mm        # Objective-C++ wrapper
└── index.js              # Node.js interface
```

**Windows Native Module Structure**:

```
native/capture-windows/
├── binding.gyp
├── src/
│   └── capture.cpp       # C++ wrapper
└── index.js              # Node.js interface
```

#### Option 2: desktopCapturer with Software Cropping

```typescript
// src/main/recording/capture.ts
import { desktopCapturer } from "electron";
import { EventEmitter } from "events";

export class ScreenCapture extends EventEmitter {
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private bounds: CropBounds;

  constructor(bounds: CropBounds) {
    super();
    this.bounds = bounds;
  }

  async start(displayId: number): Promise<void> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },
    });

    const source = sources.find((s) => s.display_id === displayId);
    if (!source) throw new Error("Display not found");

    // Get full screen stream
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-ignore - Electron-specific API
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: source.id,
        },
      },
    } as any);

    // Create canvas for cropping
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.bounds.width;
    this.canvas.height = this.bounds.height;
    this.ctx = this.canvas.getContext("2d")!;

    // Start capturing and cropping frames
    this.captureLoop();
  }

  private captureLoop() {
    if (!this.stream || !this.canvas || !this.ctx) return;

    const video = document.createElement("video");
    video.srcObject = this.stream;
    video.play();

    const drawFrame = () => {
      if (!this.ctx || !this.canvas) return;

      // Draw cropped region
      this.ctx.drawImage(
        video,
        this.bounds.x,
        this.bounds.y,
        this.bounds.width,
        this.bounds.height,
        0,
        0,
        this.bounds.width,
        this.bounds.height
      );

      // Get frame data
      const imageData = this.canvas.toDataURL("image/png");
      this.emit("frame", imageData);

      this.animationFrameId = requestAnimationFrame(drawFrame);
    };

    video.addEventListener("loadedmetadata", () => {
      drawFrame();
    });
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
```

---

## File Saving Pipeline

### Reference Implementation

**Cap Project Files**:

- `crates/recording/src/output_pipeline/core.rs` - Pipeline builder
- `crates/enc-avfoundation/src/mux/mp4.rs` - macOS MP4 muxer
- `crates/recording/src/instant_recording.rs` - Instant recording mode

### Electron + FFmpeg Implementation

#### Video Encoder (`src/main/recording/encoder.ts`)

```typescript
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";

export interface EncoderConfig {
  width: number;
  height: number;
  fps: number;
  outputPath: string;
  bitrate?: number;
}

export class VideoEncoder extends EventEmitter {
  private ffmpeg: ChildProcess | null = null;
  private config: EncoderConfig;
  private frameCount = 0;

  constructor(config: EncoderConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    const { width, height, fps, outputPath, bitrate = 2500000 } = this.config;

    // Detect hardware encoder
    const videoCodec = this.getHardwareEncoder();

    const args = [
      // Input: raw video frames from stdin
      "-f",
      "rawvideo",
      "-pixel_format",
      "bgra",
      "-video_size",
      `${width}x${height}`,
      "-framerate",
      fps.toString(),
      "-i",
      "pipe:0",

      // Video encoding
      "-c:v",
      videoCodec,
      "-b:v",
      bitrate.toString(),
      "-preset",
      "ultrafast", // Real-time encoding
      "-pix_fmt",
      "yuv420p",

      // Audio (if needed)
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-c:a",
      "aac",
      "-b:a",
      "128k",

      // Output format: Fragment MP4 for streaming
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov", // Allows playback during recording
      "-y", // Overwrite output file
      outputPath,
    ];

    this.ffmpeg = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.ffmpeg.stderr?.on("data", (data) => {
      // FFmpeg outputs progress to stderr
      const output = data.toString();
      if (output.includes("frame=")) {
        const match = output.match(/frame=\s*(\d+)/);
        if (match) {
          this.frameCount = parseInt(match[1]);
          this.emit("progress", this.frameCount);
        }
      }
    });

    this.ffmpeg.on("close", (code) => {
      if (code === 0) {
        this.emit("finished", this.config.outputPath);
      } else {
        this.emit("error", new Error(`FFmpeg exited with code ${code}`));
      }
    });

    this.ffmpeg.on("error", (err) => {
      this.emit("error", err);
    });
  }

  addFrame(frameBuffer: Buffer): void {
    if (!this.ffmpeg || !this.ffmpeg.stdin) {
      throw new Error("Encoder not started");
    }

    // Write frame to FFmpeg stdin
    if (!this.ffmpeg.stdin.write(frameBuffer)) {
      // Backpressure: wait for drain
      this.ffmpeg.stdin.once("drain", () => {
        this.addFrame(frameBuffer);
      });
    }
  }

  async finish(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ffmpeg || !this.ffmpeg.stdin) {
        reject(new Error("Encoder not started"));
        return;
      }

      // End input stream
      this.ffmpeg.stdin.end();

      // Wait for FFmpeg to finish
      this.ffmpeg.once("close", (code) => {
        if (code === 0) {
          resolve(this.config.outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      this.ffmpeg.once("error", reject);
    });
  }

  stop() {
    if (this.ffmpeg) {
      this.ffmpeg.kill();
      this.ffmpeg = null;
    }
  }

  private getHardwareEncoder(): string {
    const platform = process.platform;

    if (platform === "darwin") {
      // macOS: VideoToolbox (hardware H.264)
      return "h264_videotoolbox";
    } else if (platform === "win32") {
      // Windows: Try NVIDIA, Intel, then software
      // You can detect GPU and choose accordingly
      return "h264_nvenc"; // or 'h264_qsv' for Intel
    } else {
      // Linux: Use software encoder
      return "libx264";
    }
  }
}
```

#### Recording Controller (`src/main/recording/recorder.ts`)

```typescript
import { EventEmitter } from "events";
import { app } from "electron";
import path from "path";
import { ScreenCapture } from "./capture";
import { VideoEncoder, EncoderConfig } from "./encoder";
import { createRecordingOverlay } from "../windows/overlay";
import type { CropBounds } from "../windows/areaSelect";

export interface RecordingConfig {
  bounds: CropBounds;
  displayId: number;
  fps?: number;
  bitrate?: number;
}

export class Recorder extends EventEmitter {
  private capture: ScreenCapture | null = null;
  private encoder: VideoEncoder | null = null;
  private overlayWindow: Electron.BrowserWindow | null = null;
  private config: RecordingConfig | null = null;
  private isRecording = false;

  async start(config: RecordingConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error("Recording already in progress");
    }

    this.config = config;

    // 1. Create overlay window
    const { BrowserWindow } = await import("electron");
    this.overlayWindow = createRecordingOverlay(
      config.bounds,
      config.displayId
    );

    // 2. Start screen capture
    this.capture = new ScreenCapture(config.bounds);
    this.capture.on("frame", (frameData) => {
      this.handleFrame(frameData);
    });

    await this.capture.start(config.displayId);

    // 3. Start encoder
    const outputPath = this.getOutputPath();
    this.encoder = new VideoEncoder({
      width: config.bounds.width,
      height: config.bounds.height,
      fps: config.fps || 30,
      outputPath,
      bitrate: config.bitrate,
    });

    this.encoder.on("progress", (frameCount) => {
      this.emit("progress", frameCount);
    });

    this.encoder.on("error", (err) => {
      this.emit("error", err);
    });

    await this.encoder.start();

    this.isRecording = true;
    this.emit("started", outputPath);
  }

  async stop(): Promise<string> {
    if (!this.isRecording) {
      throw new Error("No recording in progress");
    }

    // Stop capture
    if (this.capture) {
      this.capture.stop();
      this.capture = null;
    }

    // Finish encoding
    let outputPath = "";
    if (this.encoder) {
      outputPath = await this.encoder.finish();
      this.encoder = null;
    }

    // Close overlay
    if (this.overlayWindow) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }

    this.isRecording = false;
    this.emit("stopped", outputPath);

    return outputPath;
  }

  private handleFrame(frameData: string): void {
    if (!this.encoder) return;

    // Convert base64 image to buffer
    const buffer = Buffer.from(frameData.split(",")[1], "base64");
    this.encoder.addFrame(buffer);
  }

  private getOutputPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `recording-${timestamp}.mp4`;
    const recordingsDir = path.join(app.getPath("userData"), "recordings");

    // Ensure directory exists
    const fs = require("fs");
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    return path.join(recordingsDir, filename);
  }
}
```

---

## Complete Vue.js + Electron Implementation

### Main Process Setup (`src/main/main.ts`)

```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import { Recorder } from "./recording/recorder";
import { createAreaSelectionWindow } from "./windows/areaSelect";
import type { CropBounds } from "./windows/areaSelect";

let mainWindow: BrowserWindow | null = null;
let recorder: Recorder | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// IPC Handlers
ipcMain.handle("start-area-selection", async (_, displayId: number) => {
  const win = createAreaSelectionWindow(displayId);
  return new Promise((resolve) => {
    win.on("closed", () => {
      // Get result from preload
      resolve(null);
    });
  });
});

ipcMain.handle("start-recording", async (_, config: RecordingConfig) => {
  if (!recorder) {
    recorder = new Recorder();
  }

  await recorder.start(config);
  return { success: true };
});

ipcMain.handle("stop-recording", async () => {
  if (!recorder) return { success: false };

  const outputPath = await recorder.stop();
  return { success: true, outputPath };
});

app.whenReady().then(createWindow);
```

### Preload Script (`src/main/preload.ts`)

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Area selection
  startAreaSelection: (displayId: number) =>
    ipcRenderer.invoke("start-area-selection", displayId),
  confirmAreaSelection: (bounds: CropBounds) =>
    ipcRenderer.invoke("confirm-area-selection", bounds),
  cancelAreaSelection: () => ipcRenderer.invoke("cancel-area-selection"),

  // Recording
  startRecording: (config: RecordingConfig) =>
    ipcRenderer.invoke("start-recording", config),
  stopRecording: () => ipcRenderer.invoke("stop-recording"),

  // Display info
  getDisplays: () => ipcRenderer.invoke("get-displays"),
  getCurrentDisplayId: () => ipcRenderer.invoke("get-current-display-id"),
});
```

### Vue.js Store (`src/renderer/stores/recording.ts`)

```typescript
import { defineStore } from "pinia";
import { ref } from "vue";
import type { CropBounds } from "@/shared/types";

export const useRecordingStore = defineStore("recording", () => {
  const isRecording = ref(false);
  const selectedBounds = ref<CropBounds | null>(null);
  const currentDisplayId = ref<number | null>(null);

  async function selectArea(displayId: number) {
    currentDisplayId.value = displayId;
    const bounds = await window.electronAPI?.startAreaSelection(displayId);
    if (bounds) {
      selectedBounds.value = bounds;
    }
  }

  async function startRecording() {
    if (!selectedBounds.value || !currentDisplayId.value) {
      throw new Error("No area selected");
    }

    await window.electronAPI?.startRecording({
      bounds: selectedBounds.value,
      displayId: currentDisplayId.value,
      fps: 30,
    });

    isRecording.value = true;
  }

  async function stopRecording() {
    const result = await window.electronAPI?.stopRecording();
    isRecording.value = false;
    return result;
  }

  return {
    isRecording,
    selectedBounds,
    currentDisplayId,
    selectArea,
    startRecording,
    stopRecording,
  };
});
```

---

## Code References from Cap Project

### Key Files to Reference

1. **Area Selection UI**:

   - `apps/desktop/src/components/Cropper.tsx` - Full cropper implementation (1266 lines)
   - `apps/desktop/src/routes/capture-area.tsx` - Area selection window
   - `apps/desktop/src/routes/target-select-overlay.tsx` - Overlay with cropper

2. **Recording Overlay**:

   - `apps/desktop/src/routes/window-capture-occluder.tsx` - Overlay component
   - `apps/desktop/src-tauri/src/windows.rs:615-688` - Window creation

3. **Screen Capture**:

   - `crates/scap-screencapturekit/src/capture.rs` - macOS ScreenCaptureKit wrapper
   - `crates/recording/src/sources/screen_capture/macos.rs:114-190` - Capture initialization
   - `crates/recording/src/capture_pipeline.rs:168-258` - Bounds conversion

4. **Recording Pipeline**:

   - `crates/recording/src/instant_recording.rs:314-393` - Recording actor spawn
   - `crates/recording/src/output_pipeline/core.rs` - Pipeline builder
   - `crates/enc-avfoundation/src/mux/mp4.rs` - MP4 muxer

5. **Window Management**:
   - `apps/desktop/src-tauri/src/windows.rs` - Window creation and management
   - `apps/desktop/src-tauri/src/recording.rs:386-400` - When to show overlay

### Key Data Structures

**Shared Types File** (`src/shared/types.ts`):

```typescript
// From crates/recording/src/sources/screen_capture/mod.rs
export interface ScreenCaptureTarget {
  variant: "display" | "window" | "area";
  id?: number; // Display ID or Window ID
  screen?: number; // Screen ID for area
  bounds?: CropBounds; // For area selection
}

// From apps/desktop/src/components/Cropper.tsx
export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Handle {
  id: string;
  position: "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";
  cursor: string;
}

// From crates/recording/src/lib.rs
export interface RecordingConfig {
  bounds: CropBounds;
  displayId: number;
  fps?: number;
  bitrate?: number;
  captureSystemAudio?: boolean;
  micName?: string;
  cameraLabel?: string;
}
```

---

## Implementation Checklist

When implementing in your Electron + Vue.js app:

- [ ] **Area Selection**:

  - [ ] Create `Cropper.vue` component with occluder pattern
  - [ ] Implement resize handles (8 handles)
  - [ ] Add keyboard navigation support
  - [ ] Create area selection window (fullscreen, transparent)
  - [ ] Implement bounds persistence per screen

- [ ] **Recording Overlay**:

  - [ ] Create overlay window function
  - [ ] Implement occluder HTML/CSS
  - [ ] Show overlay when recording starts
  - [ ] Hide overlay when recording stops

- [ ] **Screen Capture**:

  - [ ] Choose capture method (native module or desktopCapturer)
  - [ ] Implement bounds-to-crop conversion
  - [ ] Handle display scaling (logical vs physical coordinates)
  - [ ] Set up frame callback/stream

- [ ] **Video Encoding**:

  - [ ] Set up FFmpeg with hardware acceleration
  - [ ] Implement streaming encoder
  - [ ] Use fragment MP4 format
  - [ ] Handle frame buffering (3-5 frames max)

- [ ] **File Management**:

  - [ ] Create recordings directory
  - [ ] Generate unique filenames
  - [ ] Save file metadata
  - [ ] Handle file completion

- [ ] **IPC Communication**:
  - [ ] Set up preload script
  - [ ] Create IPC handlers in main process
  - [ ] Expose API to renderer
  - [ ] Handle errors and edge cases

---

## Performance Optimization Tips

1. **Use Hardware Encoding**: Always use GPU encoders (`h264_videotoolbox`, `h264_nvenc`)
2. **Streaming Writes**: Write frames as they arrive, don't buffer entire video
3. **Fragment MP4**: Use `-movflags frag_keyframe+empty_moov` for streaming-friendly files
4. **Frame Rate**: 30fps is usually sufficient for screen recording
5. **Queue Depth**: Buffer only 3-5 frames maximum
6. **Native Capture**: Use native modules for area recording (better performance than software cropping)

---

## Additional Resources

- **ScreenCaptureKit**: https://developer.apple.com/documentation/screencapturekit
- **Desktop Duplication API**: https://docs.microsoft.com/en-us/windows/win32/direct3d11/desktop-dup-api
- **FFmpeg Hardware Acceleration**: https://trac.ffmpeg.org/wiki/HWAccelIntro
- **Electron Screen Capture**: https://www.electronjs.org/docs/latest/api/desktop-capturer
- **Vue.js Composition API**: https://vuejs.org/guide/extras/composition-api-faq.html

---

**Ready for Implementation**: This document contains all necessary information, code references, and implementation details. When you share your Electron + Vue.js project, I can immediately start implementing these features based on this reference.
