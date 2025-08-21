# HTTP Client Setup for Snaplark

This document explains the HTTP client setup using Axios for the Snaplark Electron + Vue 3 application.

## Overview

The HTTP client is built with the following features:

- **Centralized Axios instance** with automatic token management
- **Request/Response interceptors** for auth and error handling
- **Token refresh mechanism** for expired tokens
- **Secure token storage** using encrypted electron-store
- **Service layer architecture** for organized API calls
- **Deeplink authentication** support for web-based login/register

## Project Structure

```
src/
├── api/
│   ├── config.js              # API configuration and constants
│   ├── client.js              # Main Axios instance with interceptors
│   ├── index.js               # Main export file
│   └── services/
│       ├── auth.js            # Authentication API calls
│       ├── blog.js            # Blog-related API calls
│       └── media.js           # Media upload/management API calls
├── store.js                   # Main Pinia store (includes auth state)
├── composables/
│   └── useBlog.js             # Vue composable for blog functionality
└── examples/
    └── media-upload-example.js # Usage examples for media uploads
```

## Configuration

### API Configuration (`src/api/config.js`)

Update the base URLs and endpoints to match your API:

```javascript
export const API_CONFIG = {
  BASE_URL:
    process.env.NODE_ENV === "production"
      ? "https://api.snaplark.com"
      : "https://api-dev.snaplark.com",
  // ... other configuration
};
```

### Environment Variables

For different environments, you can set environment variables:

```bash
# Development
NODE_ENV=development
VITE_API_BASE_URL=https://api-dev.snaplark.com

# Production
NODE_ENV=production
VITE_API_BASE_URL=https://api.snaplark.com
```

## Authentication Flow

### 1. Web-based Login/Register

The app uses deeplink authentication:

1. **Login button** opens web login page with callback protocol
2. **Web application** handles authentication
3. **Success redirect** uses custom protocol: `snaplark://auth?access_token=xxx&refresh_token=yyy`
4. **Electron app** captures the protocol URL and extracts tokens
5. **Tokens are stored** securely using encrypted electron-store

### 2. Token Management

```javascript
import { useStore } from "@/store.js";

const store = useStore();

// Initialize auth on app startup
store.initializeAuth();

// Handle login
store.openLogin();

// Handle logout
await store.logout();

// Check if user is logged in
if (store.isLoggedIn) {
  // User is authenticated
}
```

## Using the HTTP Client

### Basic API Calls

```javascript
import { apiUtils } from "@/api/index.js";

// GET request
const response = await apiUtils.get("/endpoint");

// POST request
const response = await apiUtils.post("/endpoint", { data });

// PUT request
const response = await apiUtils.put("/endpoint", { data });

// DELETE request
const response = await apiUtils.delete("/endpoint");
```

### Using Services

```javascript
import { blogService, authService, mediaService } from "@/api/index.js";

// Fetch latest blog post (public)
const result = await blogService.getPosts({ page: 1, limit: 1 });
const latestPost = result.posts[0];

// Get user profile (authenticated)
const profile = await authService.getProfile();

// Upload screenshot (authenticated)
const uploadResult = await mediaService.uploadScreenshot(blob, {
  title: "My Screenshot",
  tags: ["screenshot"],
});
```

### Using Composables in Vue Components

```vue
<script setup>
import { useBlog } from "@/composables/useBlog.js";
import { useStore } from "@/store.js";

const { latestPost, loading, error, fetchLatestPost } = useBlog();
const store = useStore();

// Fetch latest post when component mounts
onMounted(() => {
  fetchLatestPost();
});
</script>

<template>
  <div>
    <button @click="store.openLogin()" :disabled="store.isLoading">
      Login
    </button>

    <div v-if="loading">Loading latest post...</div>
    <div v-else-if="error">Error: {{ error }}</div>
    <div v-else-if="latestPost">
      <h3>{{ latestPost.title }}</h3>
      <p>{{ latestPost.excerpt }}</p>
    </div>
  </div>
</template>
```

## Media Uploads

### Screenshot Upload

```javascript
import { mediaService } from "@/api/index.js";

const uploadScreenshot = async (screenshotBlob) => {
  const result = await mediaService.uploadScreenshot(screenshotBlob, {
    title: "My Screenshot",
    description: "Captured with Snaplark",
    tags: ["screenshot"],
    isPublic: false,
    onUploadProgress: (progressEvent) => {
      const percent = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      console.log(`Upload progress: ${percent}%`);
    },
  });

  if (result.success) {
    console.log("Upload successful:", result.media);
  } else {
    console.error("Upload failed:", result.error);
  }
};
```

### Video Upload

```javascript
const uploadVideo = async (videoFile) => {
  const result = await mediaService.uploadVideo(videoFile, {
    title: "Screen Recording",
    tags: ["video", "recording"],
    onUploadProgress: (progressEvent) => {
      // Update progress bar
    },
  });

  return result;
};
```

## Error Handling

The HTTP client includes comprehensive error handling:

### Automatic Token Refresh

- **401 errors** trigger automatic token refresh
- **Failed refresh** clears auth data and emits logout event
- **Original request** is retried with new token

### Network Error Handling

```javascript
try {
  const result = await apiUtils.get("/endpoint");
} catch (error) {
  if (error.isNetworkError) {
    // Handle network connectivity issues
    console.log("Network error:", error.message);
  } else if (error.isHttpError) {
    // Handle HTTP errors (4xx, 5xx)
    console.log("HTTP error:", error.status, error.message);
  }
}
```

### Custom Error Events

Listen for authentication errors:

```javascript
window.addEventListener("auth:logout", (event) => {
  console.log("Auth logout event:", event.detail.reason);
  // Redirect to login or show message
});
```

## Development Features

### Request/Response Logging

In development mode, all requests and responses are logged to the console:

```
[API Request] GET /blog/posts
[API Response] 200 /blog/posts { posts: [...] }
```

### Token Storage

Tokens are stored securely using encrypted electron-store:

```javascript
import { TokenManager } from "@/api/client.js";

// Get current token
const token = TokenManager.getToken();

// Check if user has valid token
if (TokenManager.getToken()) {
  // User is authenticated
}
```

## Custom Protocol Setup

The app registers the `snaplark://` protocol for deeplink authentication.

### URL Format

```
snaplark://auth?access_token=xxx&refresh_token=yyy&user=encoded_user_data
```

### Error Handling

```
snaplark://auth?error=authentication_failed
```

## Best Practices

1. **Always use services** instead of calling apiUtils directly
2. **Handle loading states** in UI components
3. **Show error messages** to users when API calls fail
4. **Use composables** for reusable API logic
5. **Implement proper cleanup** in Vue components (remove listeners)
6. **Update API URLs** in config.js for different environments

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure your API allows requests from Electron app
2. **Token not attached**: Check if user is properly authenticated
3. **Protocol not working**: Verify app is registered as protocol handler
4. **Upload failures**: Check file size limits and supported formats

### Debug Mode

Enable debug logging:

```javascript
// In development, all requests are logged
if (process.env.NODE_ENV === "development") {
  console.log("API client in debug mode");
}
```

## Security Considerations

1. **Tokens are encrypted** using electron-store with encryption key
2. **Sensitive data** is not logged in production
3. **HTTPS is enforced** in production
4. **Token refresh** happens automatically on expiration
5. **Logout clears** all stored authentication data
