import { apiUtils } from "@/api/client.js";
import { API_CONFIG } from "@/api/config.js";

/**
 * Authentication API Service
 * Handles authentication-related API calls
 */
export const authService = {
  /**
   * Fetch current user's profile information
   * @returns {Promise<Object>} User profile data
   */
  async getProfile() {
    try {
      const response = await apiUtils.get(API_CONFIG.ENDPOINTS.AUTH.ME);

      return {
        success: true,
        data: response.data,
        user: response.data.user || response.data,
      };
    } catch (error) {
      console.error("Error fetching user profile:", error);

      return {
        success: false,
        error: error.message || "Failed to fetch user profile",
        user: null,
      };
    }
  },

  /**
   * Update user profile
   * @param {Object} profileData - Updated profile data
   * @returns {Promise<Object>} Updated user profile
   */
  async updateProfile(profileData) {
    try {
      const response = await apiUtils.put(
        API_CONFIG.ENDPOINTS.AUTH.ME,
        profileData
      );

      return {
        success: true,
        data: response.data,
        user: response.data.user || response.data,
        message: response.data.message || "Profile updated successfully",
      };
    } catch (error) {
      console.error("Error updating user profile:", error);

      return {
        success: false,
        error: error.message || "Failed to update profile",
        user: null,
      };
    }
  },

  /**
   * Change user password
   * @param {Object} passwordData - Password change data
   * @param {string} passwordData.currentPassword - Current password
   * @param {string} passwordData.newPassword - New password
   * @param {string} passwordData.confirmPassword - Password confirmation
   * @returns {Promise<Object>} Password change result
   */
  async changePassword(passwordData) {
    try {
      const response = await apiUtils.post(
        `${API_CONFIG.ENDPOINTS.AUTH.ME}/password`,
        passwordData
      );

      return {
        success: true,
        data: response.data,
        message: response.data.message || "Password changed successfully",
      };
    } catch (error) {
      console.error("Error changing password:", error);

      return {
        success: false,
        error: error.message || "Failed to change password",
      };
    }
  },

  /**
   * Refresh authentication token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshToken(refreshToken) {
    try {
      const response = await apiUtils.post(API_CONFIG.ENDPOINTS.AUTH.REFRESH, {
        refresh_token: refreshToken,
      });

      return {
        success: true,
        data: response.data,
        tokens: {
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
        },
      };
    } catch (error) {
      console.error("Error refreshing token:", error);

      return {
        success: false,
        error: error.message || "Failed to refresh token",
        tokens: null,
      };
    }
  },

  /**
   * Logout user (optional - calls logout endpoint)
   * @returns {Promise<Object>} Logout result
   */
  async logout() {
    try {
      const response = await apiUtils.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT);

      return {
        success: true,
        data: response.data,
        message: response.data.message || "Logged out successfully",
      };
    } catch (error) {
      console.error("Error during logout:", error);

      return {
        success: false,
        error: error.message || "Logout failed",
      };
    }
  },

  /**
   * Verify token validity
   * @returns {Promise<Object>} Token verification result
   */
  async verifyToken() {
    try {
      const response = await apiUtils.get(
        `${API_CONFIG.ENDPOINTS.AUTH.ME}/verify`
      );

      return {
        success: true,
        data: response.data,
        valid: true,
      };
    } catch (error) {
      console.error("Token verification failed:", error);

      return {
        success: false,
        error: error.message || "Token verification failed",
        valid: false,
      };
    }
  },

  /**
   * Delete user account
   * @param {string} password - User password for confirmation
   * @returns {Promise<Object>} Account deletion result
   */
  async deleteAccount(password) {
    try {
      const response = await apiUtils.delete(API_CONFIG.ENDPOINTS.AUTH.ME, {
        data: { password },
      });

      return {
        success: true,
        data: response.data,
        message: response.data.message || "Account deleted successfully",
      };
    } catch (error) {
      console.error("Error deleting account:", error);

      return {
        success: false,
        error: error.message || "Failed to delete account",
      };
    }
  },
};
