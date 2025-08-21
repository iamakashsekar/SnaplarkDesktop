import { ref } from "vue";
import { authService } from "@/api/index.js";

/**
 * Vue composable for auth functionality
 * Simplified to fetch only the user profile for login page
 */
export function useAuth() {
  // Reactive state
  const userProfile = ref(null);
  const loading = ref(false);
  const error = ref(null);

  // Fetch user profile
  const fetchUserProfile = async () => {
    loading.value = true;
    error.value = null;

    try {
      const result = await authService.getProfile();

      if (result.success && result.data) {
        userProfile.value = result.data;
      } else {
        error.value = result.error || "No user profile available";
        userProfile.value = null;
      }

      return result;
    } catch (err) {
      error.value = err.message || "Failed to fetch user profile";
      userProfile.value = null;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  };

  return {
    // State
    userProfile,
    loading,
    error,

    // Methods
    fetchUserProfile,
  };
}
