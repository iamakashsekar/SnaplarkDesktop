# Backend API Specification for Chunked Video Upload

This document outlines the API endpoints required to support real-time chunk-by-chunk video uploads during recording.

## Overview

The frontend uploads video chunks in real-time as they are recorded (every ~2 seconds). The backend must:

1. Initialize a session for chunked uploads
2. Accept chunks asynchronously (may arrive out of order)
3. Store chunks temporarily
4. Assemble chunks into final video when recording completes
5. Handle partial uploads gracefully

---

## API Endpoints

### 1. Initialize Upload Session

**Endpoint:** `POST /api/v1/videos/init`

**Purpose:** Create a new upload session for chunked video uploads.

**Request Body:**

```json
{
    "filename": "recording_2024-01-15T10-30-45.webm",
    "timestamp": "2024-01-15T10-30-45",
    "fps": 30,
    "codec": "video/webm;codecs=vp9",
    "bitrate": 2500000,
    "resolution": {
        "width": 1920,
        "height": 1080
    }
}
```

**Response (200 OK):**

```json
{
    "success": true,
    "sessionId": "uuid-session-id-here",
    "message": "Upload session initialized"
}
```

**Error Responses:**

- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication token
- `500 Internal Server Error`: Server error creating session

**Implementation Notes:**

- Generate a unique `sessionId` (UUID recommended)
- Store session metadata in database/cache
- Set session expiration (e.g., 24 hours) for cleanup
- Initialize empty chunk storage for this session

---

### 2. Upload Chunk

**Endpoint:** `POST /api/v1/videos/chunk`

**Purpose:** Upload a single video chunk. Chunks may arrive out of order.

**Request:** `multipart/form-data`

**Form Fields:**

- `sessionId` (string, required): Session ID from init endpoint
- `chunkIndex` (string, required): Zero-based chunk index (e.g., "0", "1", "2")
- `chunk` (file, required): Video chunk blob (WebM format)

**Example Request:**

```
POST /api/v1/videos/chunk
Content-Type: multipart/form-data

sessionId: uuid-session-id-here
chunkIndex: 0
chunk: [binary data]
```

**Response (200 OK):**

```json
{
    "success": true,
    "receivedChunkIndex": 0,
    "sessionId": "uuid-session-id-here",
    "totalChunksReceived": 1,
    "message": "Chunk received"
}
```

**Error Responses:**

- `400 Bad Request`: Missing required fields, invalid chunkIndex
- `401 Unauthorized`: Missing or invalid authentication token
- `404 Not Found`: Session ID not found or expired
- `413 Payload Too Large`: Chunk exceeds size limit (e.g., 10MB)
- `500 Internal Server Error`: Server error saving chunk

**Implementation Notes:**

- Validate `sessionId` exists and is active
- Validate `chunkIndex` is a non-negative integer
- Store chunk with filename pattern: `{sessionId}_chunk_{chunkIndex}.webm`
- Track received chunks in session metadata
- Allow duplicate chunk uploads (idempotent) - overwrite if same chunkIndex
- Chunks may arrive out of order - backend should handle this
- Recommended storage: Temporary directory or object storage (S3, etc.)

---

### 3. Finalize Upload Session

**Endpoint:** `POST /api/v1/videos/finalize`

**Purpose:** Signal that recording is complete and trigger video assembly.

**Request Body:**

```json
{
  "sessionId": "uuid-session-id-here",
  "totalChunks": 150,
  "uploadedChunks": [0, 1, 2, 3, 4, 5, ...],
  "duration": 300000,
  "metadata": {
    "filename": "recording_2024-01-15T10-30-45.webm",
    "timestamp": "2024-01-15T10-30-45",
    "fps": 30,
    "codec": "video/webm;codecs=vp9",
    "bitrate": 2500000,
    "resolution": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

**Response (200 OK):**

```json
{
    "success": true,
    "sessionId": "uuid-session-id-here",
    "videoId": "uuid-video-id-here",
    "videoUrl": "https://snaplark.com/videos/uuid-video-id-here",
    "message": "Video assembled successfully"
}
```

**Error Responses:**

- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication token
- `404 Not Found`: Session ID not found
- `409 Conflict`: Missing chunks (not all chunks received)
- `500 Internal Server Error`: Server error assembling video

**Implementation Notes:**

- Validate `sessionId` exists
- Check if all expected chunks are present (compare `uploadedChunks` array with `totalChunks`)
- If chunks are missing:
    - Option A: Return `409 Conflict` with list of missing chunks
    - Option B: Proceed with available chunks (partial video)
- Assemble chunks in order:
    1. Sort chunks by `chunkIndex`
    2. Concatenate chunks: `cat chunk_0.webm chunk_1.webm ... chunk_N.webm > final.webm`
    3. Use ffmpeg if needed for format conversion/validation
- Store final video in permanent storage
- Generate `videoId` and `videoUrl`
- Clean up temporary chunk files after assembly
- Update session status to "completed"

---

## Additional Considerations

### Session Management

**Session States:**

- `initialized`: Session created, waiting for chunks
- `uploading`: Chunks being received
- `finalizing`: Finalization requested, assembling video
- `completed`: Video assembled successfully
- `failed`: Assembly failed or session expired
- `expired`: Session timed out (cleanup)

**Session Expiration:**

- Recommended: 24 hours from initialization
- Cleanup expired sessions and their chunks periodically
- Return `404 Not Found` for expired sessions

### Chunk Storage

**Storage Options:**

1. **File System**: Temporary directory per session
2. **Object Storage**: S3, Azure Blob, etc. (recommended for scalability)
3. **Database**: BLOB storage (not recommended for large chunks)

**Chunk Naming Convention:**

```
{sessionId}_chunk_{chunkIndex}.webm
```

**Example:**

```
abc123_chunk_0.webm
abc123_chunk_1.webm
abc123_chunk_2.webm
```

### Video Assembly

**Assembly Process:**

1. Verify all chunks exist (or handle missing chunks)
2. Sort chunks by index: `chunk_0, chunk_1, ..., chunk_N`
3. Concatenate chunks (WebM format supports simple concatenation)
4. Optional: Use ffmpeg to:
    - Validate video integrity
    - Fix duration metadata
    - Convert to MP4 if needed
    - Add metadata

**FFmpeg Concatenation Example:**

```bash
# Create file list
for i in {0..149}; do
  echo "file 'abc123_chunk_${i}.webm'" >> filelist.txt
done

# Concatenate
ffmpeg -f concat -safe 0 -i filelist.txt -c copy final.webm
```

### Error Handling

**Missing Chunks:**

- If chunks are missing during finalization:
    - Log missing chunk indices
    - Option A: Return error, require retry
    - Option B: Assemble partial video with available chunks
    - Option C: Wait for missing chunks (with timeout)

**Duplicate Chunks:**

- Allow duplicate uploads (idempotent)
- Overwrite existing chunk if same `chunkIndex`

**Out-of-Order Chunks:**

- Accept chunks in any order
- Store chunks with their index
- Sort during assembly

### Authentication

- All endpoints require Bearer token authentication
- Validate token in Authorization header: `Authorization: Bearer <token>`
- Return `401 Unauthorized` for invalid/missing tokens

### Rate Limiting

- Consider rate limiting on chunk upload endpoint
- Recommended: 10 chunks/second per session
- Return `429 Too Many Requests` if exceeded

### Monitoring

**Metrics to Track:**

- Session creation rate
- Chunk upload rate
- Average chunks per session
- Assembly success rate
- Average assembly time
- Storage usage

---

## Example Flow

### Successful Upload Flow

1. **Client:** `POST /api/v1/videos/init`
    - **Response:** `{ sessionId: "abc123" }`

2. **Client:** `POST /api/v1/videos/chunk` (chunk 0)
    - **Response:** `{ success: true, receivedChunkIndex: 0 }`

3. **Client:** `POST /api/v1/videos/chunk` (chunk 1)
    - **Response:** `{ success: true, receivedChunkIndex: 1 }`

4. **... (continues for all chunks)**

5. **Client:** `POST /api/v1/videos/finalize`
    - **Backend:** Assembles chunks 0, 1, 2, ...
    - **Response:** `{ success: true, videoId: "xyz789", videoUrl: "..." }`

### Offline Recovery Flow

1. **Client:** `POST /api/v1/videos/init` (offline - fails)
    - Client stores metadata locally

2. **Client:** Records chunks, queues locally (offline)

3. **Client:** `POST /api/v1/videos/init` (online - succeeds)
    - **Response:** `{ sessionId: "abc123" }`

4. **Client:** Uploads all queued chunks in order

5. **Client:** `POST /api/v1/videos/finalize`
    - **Backend:** Assembles video
    - **Response:** `{ success: true, videoId: "xyz789" }`

---

## Database Schema (Suggested)

### Sessions Table

```sql
CREATE TABLE video_upload_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) NOT NULL, -- initialized, uploading, finalizing, completed, failed, expired
  filename VARCHAR(255),
  total_chunks INTEGER,
  received_chunks INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_sessions_session_id ON video_upload_sessions(session_id);
CREATE INDEX idx_sessions_user_id ON video_upload_sessions(user_id);
CREATE INDEX idx_sessions_status ON video_upload_sessions(status);
CREATE INDEX idx_sessions_expires_at ON video_upload_sessions(expires_at);
```

### Chunks Table (Optional - for tracking)

```sql
CREATE TABLE video_chunks (
  id UUID PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  chunk_index INTEGER NOT NULL,
  file_path VARCHAR(500),
  file_size BIGINT,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, chunk_index)
);

CREATE INDEX idx_chunks_session_id ON video_chunks(session_id);
CREATE INDEX idx_chunks_session_chunk ON video_chunks(session_id, chunk_index);
```

### Videos Table (Final assembled videos)

```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id VARCHAR(255),
  video_url VARCHAR(500),
  file_path VARCHAR(500),
  file_size BIGINT,
  duration INTEGER, -- milliseconds
  resolution_width INTEGER,
  resolution_height INTEGER,
  fps INTEGER,
  codec VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_session_id ON videos(session_id);
```

---

## Testing Checklist

- [ ] Initialize session with valid data
- [ ] Initialize session with invalid data (should fail)
- [ ] Upload chunks in order
- [ ] Upload chunks out of order
- [ ] Upload duplicate chunks (should overwrite)
- [ ] Finalize with all chunks present
- [ ] Finalize with missing chunks (should handle gracefully)
- [ ] Handle expired session (should return 404)
- [ ] Handle invalid session ID (should return 404)
- [ ] Handle authentication failure (should return 401)
- [ ] Handle large chunks (test size limits)
- [ ] Handle concurrent chunk uploads
- [ ] Test video assembly produces valid video file
- [ ] Test cleanup of temporary chunks after assembly
- [ ] Test session expiration cleanup

---

## Security Considerations

1. **Authentication:** All endpoints require valid Bearer token
2. **Authorization:** Users can only access their own sessions
3. **File Validation:** Validate chunk file type and size
4. **Rate Limiting:** Prevent abuse with rate limits
5. **Storage Limits:** Enforce per-user storage quotas
6. **Input Validation:** Sanitize all inputs (filename, chunkIndex, etc.)
7. **Path Traversal:** Prevent directory traversal in file paths
8. **Session Hijacking:** Use secure session IDs (UUIDs)

---

## Performance Optimization

1. **Async Processing:** Process video assembly asynchronously (queue job)
2. **Chunk Storage:** Use object storage (S3) for scalability
3. **Caching:** Cache session metadata in Redis
4. **CDN:** Serve final videos via CDN
5. **Compression:** Compress chunks if needed (though WebM is already compressed)
6. **Parallel Assembly:** Use parallel processing for large videos

---

## Questions for Backend Implementation

1. What is the maximum chunk size? (Recommended: 10MB)
2. What is the maximum total video size? (Recommended: 2GB)
3. How long should sessions persist? (Recommended: 24 hours)
4. Should missing chunks block finalization or allow partial videos?
5. What video formats should be supported? (WebM, MP4?)
6. Should videos be converted to MP4 after assembly?
7. Where should videos be stored? (File system, S3, etc.)
8. Should there be per-user storage quotas?
9. Should assembly happen synchronously or asynchronously?

---

---

## Laravel Implementation Guide

This section provides complete Laravel implementation code for all endpoints.

### Routes

Add to `routes/api.php`:

```php
use App\Http\Controllers\Api\V1\VideoUploadController;

Route::middleware('auth:sanctum')->prefix('v1')->group(function () {
    Route::post('/videos/init', [VideoUploadController::class, 'init']);
    Route::post('/videos/chunk', [VideoUploadController::class, 'chunk']);
    Route::post('/videos/finalize', [VideoUploadController::class, 'finalize']);
});
```

### Migrations

**Create migration:** `php artisan make:migration create_video_upload_sessions_table`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_upload_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('session_id')->unique();
            $table->enum('status', ['initialized', 'uploading', 'finalizing', 'completed', 'failed', 'expired'])->default('initialized');
            $table->string('filename')->nullable();
            $table->integer('total_chunks')->nullable();
            $table->integer('received_chunks')->default(0);
            $table->timestamp('expires_at');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('session_id');
            $table->index('user_id');
            $table->index('status');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_upload_sessions');
    }
};
```

**Create migration:** `php artisan make:migration create_video_chunks_table`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_chunks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('session_id');
            $table->integer('chunk_index');
            $table->string('file_path');
            $table->bigInteger('file_size');
            $table->timestamps();

            $table->foreign('session_id')->references('id')->on('video_upload_sessions')->onDelete('cascade');
            $table->unique(['session_id', 'chunk_index']);
            $table->index('session_id');
            $table->index(['session_id', 'chunk_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_chunks');
    }
};
```

**Create migration:** `php artisan make:migration create_videos_table`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('videos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->uuid('session_id')->nullable();
            $table->string('video_url')->nullable();
            $table->string('file_path')->nullable();
            $table->bigInteger('file_size')->nullable();
            $table->integer('duration')->nullable(); // milliseconds
            $table->integer('resolution_width')->nullable();
            $table->integer('resolution_height')->nullable();
            $table->integer('fps')->nullable();
            $table->string('codec')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index('session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('videos');
    }
};
```

### Models

**Create model:** `php artisan make:model VideoUploadSession`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class VideoUploadSession extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'session_id',
        'status',
        'filename',
        'total_chunks',
        'received_chunks',
        'expires_at',
        'metadata',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function chunks(): HasMany
    {
        return $this->hasMany(VideoChunk::class, 'session_id', 'id');
    }

    public function video(): HasOne
    {
        return $this->hasOne(Video::class, 'session_id', 'session_id');
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isActive(): bool
    {
        return in_array($this->status, ['initialized', 'uploading']) && !$this->isExpired();
    }
}
```

**Create model:** `php artisan make:model VideoChunk`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VideoChunk extends Model
{
    use HasUuids;

    protected $fillable = [
        'session_id',
        'chunk_index',
        'file_path',
        'file_size',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(VideoUploadSession::class, 'session_id', 'id');
    }
}
```

**Create model:** `php artisan make:model Video`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Video extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id',
        'session_id',
        'video_url',
        'file_path',
        'file_size',
        'duration',
        'resolution_width',
        'resolution_height',
        'fps',
        'codec',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(VideoUploadSession::class, 'session_id', 'id');
    }
}
```

### Request Validation Classes

**Create request:** `php artisan make:request Api/V1/InitVideoUploadRequest`

```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class InitVideoUploadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Authorization handled by middleware
    }

    public function rules(): array
    {
        return [
            'filename' => ['required', 'string', 'max:255'],
            'timestamp' => ['required', 'string'],
            'fps' => ['required', 'integer', 'min:1', 'max:120'],
            'codec' => ['required', 'string'],
            'bitrate' => ['required', 'integer', 'min:100000', 'max:10000000'],
            'resolution.width' => ['required', 'integer', 'min:1', 'max:7680'],
            'resolution.height' => ['required', 'integer', 'min:1', 'max:4320'],
        ];
    }
}
```

**Create request:** `php artisan make:request Api/V1/UploadChunkRequest`

```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UploadChunkRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sessionId' => ['required', 'string'],
            'chunkIndex' => ['required', 'string', 'regex:/^\d+$/'],
            'chunk' => ['required', 'file', 'mimes:webm', 'max:10240'], // Max 10MB
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'chunk_index' => (int) $this->chunkIndex,
        ]);
    }
}
```

**Create request:** `php artisan make:request Api/V1/FinalizeVideoUploadRequest`

```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class FinalizeVideoUploadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sessionId' => ['required', 'string'],
            'totalChunks' => ['required', 'integer', 'min:1'],
            'uploadedChunks' => ['required', 'array'],
            'uploadedChunks.*' => ['integer', 'min:0'],
            'duration' => ['required', 'integer', 'min:0'],
            'metadata' => ['sometimes', 'array'],
        ];
    }
}
```

### Service Class

**Create service:** `php artisan make:class Services/VideoUploadService`

```php
<?php

namespace App\Services;

use App\Models\User;
use App\Models\Video;
use App\Models\VideoChunk;
use App\Models\VideoUploadSession;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class VideoUploadService
{
    private const CHUNK_STORAGE_DISK = 'chunks';
    private const VIDEO_STORAGE_DISK = 'videos';
    private const SESSION_EXPIRY_HOURS = 24;
    private const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

    public function initializeSession(User $user, array $metadata): VideoUploadSession
    {
        $sessionId = Str::uuid()->toString();

        $session = VideoUploadSession::create([
            'user_id' => $user->id,
            'session_id' => $sessionId,
            'status' => 'initialized',
            'filename' => $metadata['filename'] ?? null,
            'total_chunks' => null,
            'received_chunks' => 0,
            'expires_at' => now()->addHours(self::SESSION_EXPIRY_HOURS),
            'metadata' => $metadata,
        ]);

        return $session;
    }

    public function uploadChunk(string $sessionId, int $chunkIndex, UploadedFile $chunkFile, User $user): VideoChunk
    {
        $session = VideoUploadSession::where('session_id', $sessionId)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($session->isExpired()) {
            abort(404, 'Session expired');
        }

        if (!$session->isActive()) {
            abort(400, 'Session is not active');
        }

        // Validate chunk size
        if ($chunkFile->getSize() > self::MAX_CHUNK_SIZE) {
            abort(413, 'Chunk exceeds maximum size');
        }

        // Update session status
        if ($session->status === 'initialized') {
            $session->update(['status' => 'uploading']);
        }

        // Store chunk file
        $chunkPath = $this->storeChunk($session->id, $chunkIndex, $chunkFile);

        // Create or update chunk record (idempotent)
        $chunk = VideoChunk::updateOrCreate(
            [
                'session_id' => $session->id,
                'chunk_index' => $chunkIndex,
            ],
            [
                'file_path' => $chunkPath,
                'file_size' => $chunkFile->getSize(),
            ]
        );

        // Update session received chunks count
        $session->increment('received_chunks');

        return $chunk;
    }

    public function finalizeSession(string $sessionId, array $data, User $user): Video
    {
        $session = VideoUploadSession::where('session_id', $sessionId)
            ->where('user_id', $user->id)
            ->firstOrFail();

        if ($session->isExpired()) {
            abort(404, 'Session expired');
        }

        $session->update(['status' => 'finalizing']);

        $totalChunks = $data['totalChunks'];
        $uploadedChunks = $data['uploadedChunks'];
        $duration = $data['duration'];
        $metadata = $data['metadata'] ?? [];

        // Get all chunks for this session
        $chunks = VideoChunk::where('session_id', $session->id)
            ->orderBy('chunk_index')
            ->get();

        // Check for missing chunks
        $receivedIndices = $chunks->pluck('chunk_index')->toArray();
        $missingChunks = array_diff($uploadedChunks, $receivedIndices);

        // Option: Proceed with available chunks (you can change this logic)
        if (!empty($missingChunks) && count($chunks) < $totalChunks * 0.9) {
            // If less than 90% of chunks are present, return error
            abort(409, 'Missing chunks: ' . implode(', ', $missingChunks));
        }

        // Dispatch job to assemble video asynchronously
        AssembleVideoJob::dispatch($session->id, $chunks->pluck('id')->toArray(), $metadata, $duration);

        // Return response immediately (video will be assembled in background)
        // You can also assemble synchronously here if preferred

        // For synchronous assembly, uncomment:
        // $video = $this->assembleVideo($session, $chunks, $metadata, $duration);
        // return $video;

        // For async processing, return immediately
        // Video will be created in the job
        return new Video([
            'user_id' => $user->id,
            'session_id' => $session->session_id,
        ]);
    }

    private function storeChunk(string $sessionUuid, int $chunkIndex, UploadedFile $file): string
    {
        $path = "sessions/{$sessionUuid}/chunk_{$chunkIndex}.webm";
        Storage::disk(self::CHUNK_STORAGE_DISK)->put($path, $file->getContent());
        return $path;
    }

    public function assembleVideo(VideoUploadSession $session, $chunks, array $metadata, int $duration): Video
    {
        try {
            // Get chunk files
            $chunkFiles = $chunks->map(function ($chunk) {
                return Storage::disk(self::CHUNK_STORAGE_DISK)->path($chunk->file_path);
            })->toArray();

            // Create temporary file list for ffmpeg
            $fileListPath = storage_path('app/temp/' . $session->session_id . '_filelist.txt');
            $fileListDir = dirname($fileListPath);
            if (!is_dir($fileListDir)) {
                mkdir($fileListDir, 0755, true);
            }

            $fileListContent = '';
            foreach ($chunkFiles as $chunkFile) {
                $fileListContent .= "file '" . str_replace("'", "'\\''", $chunkFile) . "'\n";
            }
            file_put_contents($fileListPath, $fileListContent);

            // Assemble video using ffmpeg
            $outputPath = storage_path('app/temp/' . $session->session_id . '_output.webm');
            $ffmpegPath = config('services.ffmpeg.path', 'ffmpeg');

            $command = sprintf(
                '%s -f concat -safe 0 -i %s -c copy %s',
                escapeshellarg($ffmpegPath),
                escapeshellarg($fileListPath),
                escapeshellarg($outputPath)
            );

            exec($command . ' 2>&1', $output, $returnCode);

            if ($returnCode !== 0) {
                throw new \Exception('FFmpeg failed: ' . implode("\n", $output));
            }

            // Store final video
            $videoFilename = $session->session_id . '.webm';
            $videoPath = Storage::disk(self::VIDEO_STORAGE_DISK)->putFileAs(
                'videos',
                new \Illuminate\Http\File($outputPath),
                $videoFilename
            );

            // Create video record
            $video = Video::create([
                'user_id' => $session->user_id,
                'session_id' => $session->session_id,
                'video_url' => Storage::disk(self::VIDEO_STORAGE_DISK)->url($videoPath),
                'file_path' => $videoPath,
                'file_size' => filesize($outputPath),
                'duration' => $duration,
                'resolution_width' => $metadata['resolution']['width'] ?? null,
                'resolution_height' => $metadata['resolution']['height'] ?? null,
                'fps' => $metadata['fps'] ?? null,
                'codec' => $metadata['codec'] ?? null,
                'metadata' => $metadata,
            ]);

            // Update session
            $session->update(['status' => 'completed']);

            // Cleanup temporary files
            @unlink($fileListPath);
            @unlink($outputPath);

            // Cleanup chunk files (optional - can be done via scheduled job)
            foreach ($chunks as $chunk) {
                Storage::disk(self::CHUNK_STORAGE_DISK)->delete($chunk->file_path);
                $chunk->delete();
            }

            return $video;
        } catch (\Exception $e) {
            $session->update(['status' => 'failed']);
            throw $e;
        }
    }
}
```

### Queue Job (Async Video Assembly)

**Create job:** `php artisan make:job AssembleVideoJob`

```php
<?php

namespace App\Jobs;

use App\Models\VideoChunk;
use App\Models\VideoUploadSession;
use App\Services\VideoUploadService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class AssembleVideoJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public string $sessionId,
        public array $chunkIds,
        public array $metadata,
        public int $duration
    ) {
        $this->onQueue('video-processing');
    }

    public function handle(VideoUploadService $service): void
    {
        $session = VideoUploadSession::findOrFail($this->sessionId);
        $chunks = VideoChunk::whereIn('id', $this->chunkIds)
            ->orderBy('chunk_index')
            ->get();

        $service->assembleVideo($session, $chunks, $this->metadata, $this->duration);
    }
}
```

### Controller

**Create controller:** `php artisan make:controller Api/V1/VideoUploadController`

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\Api\V1\FinalizeVideoUploadRequest;
use App\Http\Requests\Api\V1\InitVideoUploadRequest;
use App\Http\Requests\Api\V1\UploadChunkRequest;
use App\Jobs\AssembleVideoJob;
use App\Models\VideoChunk;
use App\Models\VideoUploadSession;
use App\Services\VideoUploadService;
use Illuminate\Http\JsonResponse;

class VideoUploadController
{
    public function __construct(
        private VideoUploadService $uploadService
    ) {
    }

    public function init(InitVideoUploadRequest $request): JsonResponse
    {
        $user = $request->user();
        $metadata = $request->validated();
        $metadata['resolution'] = [
            'width' => $request->input('resolution.width'),
            'height' => $request->input('resolution.height'),
        ];

        $session = $this->uploadService->initializeSession($user, $metadata);

        return response()->json([
            'success' => true,
            'sessionId' => $session->session_id,
            'message' => 'Upload session initialized',
        ]);
    }

    public function chunk(UploadChunkRequest $request): JsonResponse
    {
        $user = $request->user();
        $sessionId = $request->input('sessionId');
        $chunkIndex = (int) $request->input('chunkIndex');
        $chunkFile = $request->file('chunk');

        $chunk = $this->uploadService->uploadChunk($sessionId, $chunkIndex, $chunkFile, $user);

        $session = $chunk->session;

        return response()->json([
            'success' => true,
            'receivedChunkIndex' => $chunkIndex,
            'sessionId' => $session->session_id,
            'totalChunksReceived' => $session->received_chunks,
            'message' => 'Chunk received',
        ]);
    }

    public function finalize(FinalizeVideoUploadRequest $request): JsonResponse
    {
        $user = $request->user();
        $sessionId = $request->input('sessionId');

        // For async processing (recommended)
        $session = VideoUploadSession::where('session_id', $sessionId)
            ->where('user_id', $user->id)
            ->firstOrFail();

        $chunks = VideoChunk::where('session_id', $session->id)
            ->orderBy('chunk_index')
            ->get();

        $totalChunks = $request->input('totalChunks');
        $uploadedChunks = $request->input('uploadedChunks');
        $duration = $request->input('duration');
        $metadata = $request->input('metadata', []);

        // Check for missing chunks (optional validation)
        $receivedIndices = $chunks->pluck('chunk_index')->toArray();
        $missingChunks = array_diff($uploadedChunks, $receivedIndices);

        if (!empty($missingChunks) && count($chunks) < $totalChunks * 0.9) {
            return response()->json([
                'success' => false,
                'error' => 'Missing chunks',
                'missingChunks' => array_values($missingChunks),
            ], 409);
        }

        // Dispatch job for async processing
        AssembleVideoJob::dispatch(
            $session->id,
            $chunks->pluck('id')->toArray(),
            $metadata,
            $duration
        );

        return response()->json([
            'success' => true,
            'sessionId' => $sessionId,
            'message' => 'Video assembly started',
            'note' => 'Video is being processed. Poll /api/v1/videos/{sessionId} or use webhooks to get final video URL.',
        ]);

        // For synchronous processing (uncomment if preferred):
        // Note: Synchronous processing may timeout for large videos
        /*
        $video = $this->uploadService->finalizeSession(
            $sessionId,
            $request->validated(),
            $user
        );

        return response()->json([
            'success' => true,
            'sessionId' => $sessionId,
            'videoId' => $video->id,
            'videoUrl' => $video->video_url,
            'message' => 'Video assembled successfully',
        ]);
        */
    }
}
```

### Configuration

**Add to `config/filesystems.php`:**

```php
'disks' => [
    // ... existing disks

    'chunks' => [
        'driver' => 'local',
        'root' => storage_path('app/chunks'),
        'throw' => false,
    ],

    'videos' => [
        'driver' => 'local', // or 's3' for cloud storage
        'root' => storage_path('app/videos'),
        'url' => env('APP_URL') . '/storage/videos',
        'visibility' => 'public',
        'throw' => false,
    ],
],
```

**Add to `config/services.php`:**

```php
'ffmpeg' => [
    'path' => env('FFMPEG_PATH', 'ffmpeg'),
],
```

**Add to `.env`:**

```env
FFMPEG_PATH=/usr/bin/ffmpeg
```

### Scheduled Cleanup Command

**Create command:** `php artisan make:command CleanupExpiredVideoSessions`

```php
<?php

namespace App\Console\Commands;

use App\Models\VideoChunk;
use App\Models\VideoUploadSession;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class CleanupExpiredVideoSessions extends Command
{
    protected $signature = 'videos:cleanup-expired';
    protected $description = 'Clean up expired video upload sessions and their chunks';

    public function handle(): void
    {
        $expiredSessions = VideoUploadSession::where('expires_at', '<', now())
            ->whereIn('status', ['initialized', 'uploading', 'failed'])
            ->get();

        foreach ($expiredSessions as $session) {
            // Delete chunk files
            $chunks = VideoChunk::where('session_id', $session->id)->get();
            foreach ($chunks as $chunk) {
                Storage::disk('chunks')->delete($chunk->file_path);
                $chunk->delete();
            }

            // Update session status
            $session->update(['status' => 'expired']);

            $this->info("Cleaned up session: {$session->session_id}");
        }

        $this->info("Cleaned up {$expiredSessions->count()} expired sessions");
    }
}
```

**Add to `routes/console.php`:**

```php
use Illuminate\Console\Scheduling\Schedule;

Schedule::command('videos:cleanup-expired')->hourly();
```

### Rate Limiting

**Add to `app/Http/Kernel.php` or `bootstrap/app.php` (Laravel 11):**

```php
// In bootstrap/app.php (Laravel 11)
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

->withMiddleware(function (Middleware $middleware) {
    // Rate limit chunk uploads
    RateLimiter::for('chunk-uploads', function (Request $request) {
        return Limit::perMinute(30)->by($request->user()?->id ?: $request->ip());
    });
})
```

**Apply to route:**

```php
Route::post('/videos/chunk', [VideoUploadController::class, 'chunk'])
    ->middleware('throttle:chunk-uploads');
```

### Error Handling

The implementation includes proper error handling:

- Session expiration checks
- File size validation
- User authorization
- Missing chunk detection
- FFmpeg execution errors

### Async Processing Note

When using async processing (recommended), the `finalize` endpoint returns immediately without the final video URL. You have two options:

1. **Polling**: Create an endpoint to check video status:

    ```php
    Route::get('/videos/{sessionId}', [VideoUploadController::class, 'status']);
    ```

2. **Webhooks/Events**: Dispatch a Laravel event when video is ready and notify the frontend via webhook or websocket.

3. **Synchronous**: Uncomment the synchronous code in the controller (not recommended for large videos as it may timeout).

### Testing

Create feature tests for each endpoint:

```php
<?php

namespace Tests\Feature\Api\V1;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class VideoUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_initialize_upload_session(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/videos/init', [
                'filename' => 'test.webm',
                'timestamp' => now()->toIso8601String(),
                'fps' => 30,
                'codec' => 'video/webm;codecs=vp9',
                'bitrate' => 2500000,
                'resolution' => [
                    'width' => 1920,
                    'height' => 1080,
                ],
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'sessionId',
                'message',
            ]);
    }

    // Add more tests for chunk upload and finalize
}
```

---

## Support

For questions or clarifications, refer to the frontend implementation in:

- `src/services/chunk-upload-manager.js`
- `src/composables/useRecorder.js`
