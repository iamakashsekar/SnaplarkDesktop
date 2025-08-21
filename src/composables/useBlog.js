import { ref } from "vue";
import { blogService } from "@/api/index.js";

/**
 * Vue composable for blog functionality
 * Simplified to fetch only the latest blog post for login page
 */
export function useBlog() {
  // Reactive state
  const latestPost = ref(null);
  const loading = ref(false);
  const error = ref(null);

  // Fetch latest blog post
  const fetchLatestPost = async () => {
    loading.value = true;
    error.value = null;

    try {
      const result = await blogService.getPosts();

      if (result.success && result.data.length > 0) {
        latestPost.value = result.data[0]; // Get the first (latest) post
      } else {
        error.value = result.error || "No posts available";
        latestPost.value = null;
      }

      return result;
    } catch (err) {
      error.value = err.message || "Failed to fetch latest blog post";
      latestPost.value = null;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  };

  return {
    // State
    latestPost,
    loading,
    error,

    // Methods
    fetchLatestPost,
  };
}
