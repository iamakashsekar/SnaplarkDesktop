import { apiUtils } from "@/api/client.js";
import { API_CONFIG } from "@/api/config.js";

/**
 * Media API Service
 * Handles media uploads (screenshots, videos) and management
 */
export const mediaService = {
  /**
   * Upload a screenshot or video file
   * @param {File|Blob} file - The file to upload
   * @param {Object} options - Upload options
   * @param {string} options.type - File type ('screenshot' or 'video')
   * @param {string} options.title - Optional title for the media
   * @param {string} options.description - Optional description
   * @param {Array<string>} options.tags - Optional tags
   * @param {boolean} options.isPublic - Whether the media is public (default: false)
   * @param {Function} options.onUploadProgress - Progress callback function
   * @returns {Promise<Object>} Upload result
   */
  async uploadMedia(file, options = {}) {
    try {
      const {
        type = "screenshot",
        title = "",
        description = "",
        tags = [],
        isPublic = false,
        onUploadProgress = null,
      } = options;

      // Create FormData for file upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      if (title) formData.append("title", title);
      if (description) formData.append("description", description);
      if (tags.length > 0) formData.append("tags", JSON.stringify(tags));
      formData.append("is_public", isPublic.toString());

      // Add timestamp and additional metadata
      formData.append("uploaded_at", new Date().toISOString());
      formData.append("file_size", file.size.toString());
      formData.append("file_name", file.name);

      const response = await apiUtils.upload(
        API_CONFIG.ENDPOINTS.MEDIA.UPLOAD,
        formData,
        onUploadProgress
      );

      return {
        success: true,
        data: response.data,
        media: response.data.media || response.data,
        message: response.data.message || "Media uploaded successfully",
      };
    } catch (error) {
      console.error("Error uploading media:", error);

      return {
        success: false,
        error: error.message || "Failed to upload media",
        media: null,
      };
    }
  },

  /**
   * Upload screenshot specifically
   * @param {File|Blob} screenshotFile - Screenshot file
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadScreenshot(screenshotFile, options = {}) {
    return this.uploadMedia(screenshotFile, {
      ...options,
      type: "screenshot",
    });
  },

  /**
   * Upload video specifically
   * @param {File|Blob} videoFile - Video file
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadVideo(videoFile, options = {}) {
    return this.uploadMedia(videoFile, {
      ...options,
      type: "video",
    });
  },

  /**
   * Get user's uploaded media
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (default: 1)
   * @param {number} params.limit - Number of items per page (default: 20)
   * @param {string} params.type - Filter by type ('screenshot', 'video', or 'all')
   * @param {string} params.sort - Sort order ('newest', 'oldest', 'name')
   * @returns {Promise<Object>} User's media list
   */
  async getMyMedia({
    page = 1,
    limit = 20,
    type = "all",
    sort = "newest",
  } = {}) {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort,
      });

      if (type !== "all") {
        params.append("type", type);
      }

      const response = await apiUtils.get(
        `${API_CONFIG.ENDPOINTS.MEDIA.UPLOADS}?${params}`
      );

      return {
        success: true,
        data: response.data,
        media: response.data.media || response.data.data || [],
        pagination: response.data.pagination || null,
        total: response.data.total || 0,
      };
    } catch (error) {
      console.error("Error fetching user media:", error);

      return {
        success: false,
        error: error.message || "Failed to fetch media",
        media: [],
        pagination: null,
        total: 0,
      };
    }
  },

  /**
   * Get a specific media item by ID
   * @param {string|number} mediaId - Media ID
   * @returns {Promise<Object>} Media item data
   */
  async getMedia(mediaId) {
    try {
      const response = await apiUtils.get(
        `${API_CONFIG.ENDPOINTS.MEDIA.UPLOADS}/${mediaId}`
      );

      return {
        success: true,
        data: response.data,
        media: response.data.media || response.data,
      };
    } catch (error) {
      console.error(`Error fetching media ${mediaId}:`, error);

      return {
        success: false,
        error: error.message || "Failed to fetch media",
        media: null,
      };
    }
  },

  /**
   * Update media metadata
   * @param {string|number} mediaId - Media ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Update result
   */
  async updateMedia(mediaId, updateData) {
    try {
      const response = await apiUtils.put(
        `${API_CONFIG.ENDPOINTS.MEDIA.UPLOADS}/${mediaId}`,
        updateData
      );

      return {
        success: true,
        data: response.data,
        media: response.data.media || response.data,
        message: response.data.message || "Media updated successfully",
      };
    } catch (error) {
      console.error(`Error updating media ${mediaId}:`, error);

      return {
        success: false,
        error: error.message || "Failed to update media",
        media: null,
      };
    }
  },

  /**
   * Delete a media item
   * @param {string|number} mediaId - Media ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteMedia(mediaId) {
    try {
      const response = await apiUtils.delete(
        `${API_CONFIG.ENDPOINTS.MEDIA.UPLOADS}/${mediaId}`
      );

      return {
        success: true,
        data: response.data,
        message: response.data.message || "Media deleted successfully",
      };
    } catch (error) {
      console.error(`Error deleting media ${mediaId}:`, error);

      return {
        success: false,
        error: error.message || "Failed to delete media",
      };
    }
  },

  /**
   * Share media (make public/private)
   * @param {string|number} mediaId - Media ID
   * @param {boolean} isPublic - Whether to make media public
   * @returns {Promise<Object>} Share result
   */
  async shareMedia(mediaId, isPublic) {
    try {
      const response = await apiUtils.patch(
        `${API_CONFIG.ENDPOINTS.MEDIA.UPLOADS}/${mediaId}/share`,
        {
          is_public: isPublic,
        }
      );

      return {
        success: true,
        data: response.data,
        media: response.data.media || response.data,
        message:
          response.data.message ||
          `Media ${isPublic ? "shared" : "made private"} successfully`,
      };
    } catch (error) {
      console.error(`Error sharing media ${mediaId}:`, error);

      return {
        success: false,
        error: error.message || "Failed to share media",
        media: null,
      };
    }
  },

  /**
   * Get upload statistics for the user
   * @returns {Promise<Object>} Upload statistics
   */
  async getUploadStats() {
    try {
      const response = await apiUtils.get(
        `${API_CONFIG.ENDPOINTS.MEDIA.UPLOADS}/stats`
      );

      return {
        success: true,
        data: response.data,
        stats: response.data.stats || response.data,
      };
    } catch (error) {
      console.error("Error fetching upload stats:", error);

      return {
        success: false,
        error: error.message || "Failed to fetch upload statistics",
        stats: null,
      };
    }
  },
};
