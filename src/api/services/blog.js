import { apiUtils } from "@/api/client.js";
import { API_CONFIG } from "@/api/config.js";

/**
 * Blog API Service
 * Simplified to fetch only the latest blog post for login page
 */
export const blogService = {
  /**
   * Fetch latest blog posts (public endpoint)
   * Used on the login page to show the latest post
   * @returns {Promise<Object>} Blog posts data
   */
  async getPosts() {
    try {
      const response = await apiUtils.get(`${API_CONFIG.ENDPOINTS.BLOG.POSTS}`);

      return {
        success: true,
        data: response.data.data || response.data.posts || response.data || [],
      };
    } catch (error) {
      console.error("Error fetching blog posts:", error);

      return {
        success: false,
        error: error.message || "Failed to fetch blog posts",
        data: [],
      };
    }
  },
};
