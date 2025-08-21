/**
 * Example demonstrating how to use the media service for uploading screenshots and videos
 * This file shows common patterns and usage examples for the media API
 */

import { mediaService } from "@/api/index.js";

// Example 1: Upload a screenshot with progress tracking
export const uploadScreenshotExample = async (screenshotBlob) => {
  try {
    const result = await mediaService.uploadScreenshot(screenshotBlob, {
      title: "My Screenshot",
      description: "A screenshot taken from Snaplark",
      tags: ["screenshot", "demo"],
      isPublic: false,
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log(`Upload Progress: ${percentCompleted}%`);

        // Update UI progress bar here
        // updateProgressBar(percentCompleted);
      },
    });

    if (result.success) {
      console.log("Screenshot uploaded successfully:", result.media);
      return result.media;
    } else {
      console.error("Upload failed:", result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
};

// Example 2: Upload a video with metadata
export const uploadVideoExample = async (videoFile) => {
  try {
    const result = await mediaService.uploadVideo(videoFile, {
      title: `Recording - ${new Date().toLocaleDateString()}`,
      description: "Screen recording captured with Snaplark",
      tags: ["video", "recording", "screen-capture"],
      isPublic: false,
    });

    if (result.success) {
      console.log("Video uploaded successfully:", result.media);

      // Optional: Update local state or UI
      // addToMediaLibrary(result.media);

      return result.media;
    } else {
      console.error("Video upload failed:", result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Video upload error:", error);
    throw error;
  }
};

// Example 3: Get user's media library
export const getUserMediaExample = async (filters = {}) => {
  try {
    const result = await mediaService.getMyMedia({
      page: 1,
      limit: 20,
      type: "all", // 'screenshot', 'video', or 'all'
      sort: "newest",
      ...filters,
    });

    if (result.success) {
      console.log("User media fetched:", result.media);
      console.log("Total items:", result.total);
      console.log("Pagination:", result.pagination);

      return result;
    } else {
      console.error("Failed to fetch media:", result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Fetch media error:", error);
    throw error;
  }
};

// Example 4: Share/Unshare media
export const toggleMediaSharingExample = async (mediaId, makePublic) => {
  try {
    const result = await mediaService.shareMedia(mediaId, makePublic);

    if (result.success) {
      console.log(
        `Media ${makePublic ? "shared" : "made private"} successfully`
      );
      return result.media;
    } else {
      console.error("Failed to update sharing:", result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Share toggle error:", error);
    throw error;
  }
};

// Example 5: Delete media
export const deleteMediaExample = async (mediaId) => {
  try {
    const confirmed = confirm("Are you sure you want to delete this media?");
    if (!confirmed) return false;

    const result = await mediaService.deleteMedia(mediaId);

    if (result.success) {
      console.log("Media deleted successfully");

      // Optional: Remove from local state or UI
      // removeFromMediaLibrary(mediaId);

      return true;
    } else {
      console.error("Failed to delete media:", result.error);
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("Delete media error:", error);
    throw error;
  }
};

// Example 6: Batch upload with error handling
export const batchUploadExample = async (files) => {
  const results = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      console.log(`Uploading file ${i + 1} of ${files.length}: ${file.name}`);

      const isVideo = file.type.startsWith("video/");
      const result = isVideo
        ? await mediaService.uploadVideo(file, {
            title: file.name,
            tags: ["batch-upload", "video"],
          })
        : await mediaService.uploadScreenshot(file, {
            title: file.name,
            tags: ["batch-upload", "screenshot"],
          });

      if (result.success) {
        results.push(result.media);
        console.log(`✓ Successfully uploaded: ${file.name}`);
      } else {
        errors.push({ file: file.name, error: result.error });
        console.error(`✗ Failed to upload: ${file.name}`, result.error);
      }
    } catch (error) {
      errors.push({ file: file.name, error: error.message });
      console.error(`✗ Upload error for: ${file.name}`, error);
    }
  }

  console.log(
    `Batch upload completed. Success: ${results.length}, Errors: ${errors.length}`
  );

  return {
    successful: results,
    failed: errors,
    total: files.length,
  };
};

// Example 7: Using with Vue composition function
export const useMediaUpload = () => {
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const uploadError = ref(null);

  const uploadFile = async (file, options = {}) => {
    uploading.value = true;
    uploadProgress.value = 0;
    uploadError.value = null;

    try {
      const uploadOptions = {
        ...options,
        onUploadProgress: (progressEvent) => {
          uploadProgress.value = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
        },
      };

      const isVideo = file.type.startsWith("video/");
      const result = isVideo
        ? await mediaService.uploadVideo(file, uploadOptions)
        : await mediaService.uploadScreenshot(file, uploadOptions);

      if (result.success) {
        uploadProgress.value = 100;
        return result.media;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      uploadError.value = error.message;
      throw error;
    } finally {
      uploading.value = false;
    }
  };

  return {
    uploading: readonly(uploading),
    uploadProgress: readonly(uploadProgress),
    uploadError: readonly(uploadError),
    uploadFile,
  };
};
