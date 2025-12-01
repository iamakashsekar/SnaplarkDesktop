# Chunk Upload Implementation Summary

## Overview

This implementation adds real-time chunk-by-chunk video upload functionality to the recording system. Videos are uploaded to the backend API as chunks are generated during recording, with robust error handling, retry logic, and network resilience.

## What Was Implemented

### 1. Chunk Upload Manager Service (`src/services/chunk-upload-manager.js`)

A comprehensive service that handles:

- **Queue Management**: Queues chunks for upload as they arrive
- **Parallel Uploads**: Uploads 2 chunks simultaneously for better performance
- **Retry Logic**: Exponential backoff retry (up to 5 attempts per chunk)
- **Network Resilience**: Automatically pauses when offline, resumes when online
- **Progress Tracking**: Tracks uploaded chunks, failed chunks, and queue status
- **Session Management**: Initializes and finalizes upload sessions

**Key Features:**

- Non-blocking: Upload failures don't stop recording
- Resume capability: Automatically resumes uploads when connectivity is restored
- Idempotent: Handles duplicate chunk uploads gracefully
- Progress tracking: Real-time upload progress statistics

### 2. Integration with Recorder (`src/composables/useRecorder.js`)

Modified the recorder to:

- Initialize upload session when recording starts
- Queue chunks for upload as they're generated
- Track upload progress in real-time
- Finalize upload session when recording stops
- Handle upload errors gracefully (recording continues even if upload fails)

**New State Variables:**

- `uploadProgress`: Object with `{ uploaded, total, percentage, isOnline }`
- `isUploading`: Boolean indicating if upload is active

### 3. Backend API Specification (`BACKEND_API_SPECIFICATION.md`)

Comprehensive documentation for backend implementation including:

- API endpoint specifications
- Request/response formats
- Error handling guidelines
- Database schema suggestions
- Security considerations
- Testing checklist

## How It Works

### Recording Flow

1. **Recording Starts**
    - Disk streaming initialized (existing)
    - Upload session initialized (new)
    - If offline, session init is deferred until online

2. **During Recording**
    - MediaRecorder generates chunks every ~2 seconds
    - Each chunk is:
        - Written to disk immediately (existing)
        - Queued for upload (new)
    - Upload manager processes queue in background
    - Progress updated every second

3. **Recording Stops**
    - Wait for disk writes to complete
    - Finalize upload session
    - Backend assembles chunks into final video
    - Return video URL

### Network Resilience

**Offline During Recording:**

- Recording continues normally
- Chunks are queued locally
- Upload manager pauses automatically
- When connectivity restored:
    - Session initialized (if not already)
    - Queued chunks uploaded automatically
    - Upload resumes seamlessly

**Partial Uploads:**

- If some chunks fail to upload:
    - Recording still completes successfully
    - Failed chunks are retried
    - Backend receives list of uploaded chunks
    - Backend can handle partial uploads (see API spec)

## Usage

### Accessing Upload Progress

The `useRecorder` composable now exposes:

```javascript
const {
    uploadProgress, // { uploaded, total, percentage, isOnline }
    isUploading // boolean
} = useRecorder()
```

**Example:**

```vue
<template>
    <div v-if="isUploading">
        <p>Uploading: {{ uploadProgress.uploaded }}/{{ uploadProgress.total }} chunks</p>
        <p>Progress: {{ uploadProgress.percentage }}%</p>
        <p v-if="!uploadProgress.isOnline">⚠️ Offline - upload will resume when online</p>
    </div>
</template>
```

### Monitoring Upload Status

The upload manager provides progress statistics:

```javascript
import chunkUploadManager from '@/services/chunk-upload-manager'

const progress = chunkUploadManager.getProgress()
// {
//   uploaded: 50,
//   totalQueued: 100,
//   failed: 2,
//   pending: 48,
//   percentage: 50,
//   isOnline: true,
//   hasSession: true
// }
```

## Configuration

### Upload Manager Settings

In `src/services/chunk-upload-manager.js`, you can adjust:

```javascript
this.maxConcurrentUploads = 2 // Parallel uploads (2-3 recommended)
this.maxRetries = 5 // Max retry attempts per chunk
this.retryDelays = [1000, 2000, 4000, 8000, 16000] // Exponential backoff
```

### Chunk Generation Interval

In `src/composables/useRecorder.js`, chunks are generated every 2 seconds:

```javascript
mediaRecorder.start(2000) // Request data every 2 seconds
```

This can be adjusted, but 2 seconds is optimal for:

- Smooth playback (more keyframes)
- Reasonable chunk sizes (~625 KB each)
- Good balance between upload frequency and network overhead

## Error Handling

### Upload Failures

- **Network Errors**: Chunks are queued and retried when online
- **Server Errors**: Chunks are retried with exponential backoff
- **Max Retries Exceeded**: Chunk is skipped, recording continues
- **Session Init Failure**: Recording continues, session retried when online

### Recording Continuity

**Critical Principle**: Upload failures NEVER stop recording.

- Recording always completes successfully
- Local disk file is always saved
- Upload is best-effort, non-blocking
- User experience is never interrupted

## Backend Requirements

See `BACKEND_API_SPECIFICATION.md` for complete API documentation.

**Required Endpoints:**

1. `POST /api/v1/videos/init` - Initialize upload session
2. `POST /api/v1/videos/chunk` - Upload a chunk
3. `POST /api/v1/videos/finalize` - Finalize and assemble video

**Key Backend Responsibilities:**

- Store chunks temporarily
- Track received chunks per session
- Assemble chunks in order when finalizing
- Handle missing chunks gracefully
- Clean up temporary files after assembly

## Testing

### Manual Testing

1. **Normal Flow:**
    - Start recording
    - Verify chunks upload in console
    - Stop recording
    - Verify finalization succeeds

2. **Offline Testing:**
    - Start recording
    - Disconnect internet
    - Continue recording (should work)
    - Reconnect internet
    - Verify chunks resume uploading

3. **Network Interruption:**
    - Start recording
    - Interrupt network mid-recording
    - Continue recording
    - Restore network
    - Verify all chunks eventually upload

### Console Logging

The implementation includes comprehensive logging:

- `✅ Chunk X uploaded successfully` - Chunk uploaded
- `📦 Chunk X queued` - Chunk queued for upload
- `📵 Offline - Chunk X will be uploaded when online` - Offline detection
- `🔄 Connectivity restored - resuming uploads` - Resume on reconnect
- `⚠️ Failed to upload chunk X (attempt N/M)` - Retry attempts
- `✅ Upload completed: X/Y chunks uploaded` - Finalization success

## Performance Considerations

### Memory Usage

- Chunks are NOT stored in memory
- Chunks are written to disk immediately
- Upload queue only stores chunk references (Blob objects)
- Memory footprint is minimal

### Network Usage

- Chunks upload in parallel (2 concurrent)
- Uploads are non-blocking
- Failed uploads don't accumulate (retried immediately)
- Network failures pause uploads automatically

### Disk Usage

- Chunks are written to disk as before (no change)
- Upload doesn't affect disk I/O
- Temporary chunks cleaned up after assembly (backend)

## Troubleshooting

### Uploads Not Starting

1. Check internet connectivity: `connectivityService.isOnline`
2. Check console for session init errors
3. Verify API endpoint URLs in `src/api/config.js`
4. Check authentication token is valid

### Chunks Not Uploading

1. Check network tab for failed requests
2. Verify backend API is accessible
3. Check session ID is valid
4. Review console logs for error messages

### Upload Progress Not Updating

1. Verify `uploadProgress` is being watched in component
2. Check `isUploading` is true during recording
3. Review console for progress updates

## Future Enhancements

Potential improvements:

1. **Upload Progress UI**: Visual progress bar in recording UI
2. **Upload Status Indicator**: Show upload status (uploading, paused, complete)
3. **Resume Failed Uploads**: Manual retry button for failed uploads
4. **Upload Settings**: User-configurable upload settings
5. **Bandwidth Throttling**: Throttle uploads based on available bandwidth
6. **Chunk Compression**: Compress chunks before upload (if needed)
7. **Upload Analytics**: Track upload success rates, average times, etc.

## Files Modified

1. `src/services/chunk-upload-manager.js` - **NEW** - Upload manager service
2. `src/composables/useRecorder.js` - **MODIFIED** - Integrated upload manager
3. `BACKEND_API_SPECIFICATION.md` - **NEW** - Backend API documentation
4. `CHUNK_UPLOAD_IMPLEMENTATION.md` - **NEW** - This file

## Dependencies

No new dependencies required. Uses existing:

- `axios` (via `apiClient`)
- `connectivityService` (existing service)
- Vue 3 reactivity system

## Notes

- Upload is completely optional - recording works without backend
- Upload failures are silent to user (logged only)
- Local disk file is always saved regardless of upload status
- Backend must handle chunk assembly (see API spec)
- Chunks may arrive out of order (backend must handle this)
