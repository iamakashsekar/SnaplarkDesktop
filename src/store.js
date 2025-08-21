import { defineStore } from "pinia";
import { TokenManager } from "@/api/client.js";
import { authService } from "@/api/index.js";
import { API_CONFIG, WEB_URLS } from "@/api/config.js";
import connectivityService from "@/services/connectivity.js";
import router from "@/router";

export const useStore = defineStore("main", {
  state: () => ({
    // UI State
    isDarkMode: false,

    // Auth State
    user: null,
    isAuthenticated: false,
    isLoading: false,
    authError: null,

    // Connectivity State (synced with global service)
    isOnline: connectivityService.isOnline,
  }),

  persist: {
    storage: {
      getItem: (key) => {
        return window.electronStore.get(key);
      },
      setItem: (key, value) => {
        window.electronStore.set(key, value);
      },
    },
  },

  getters: {
    // Auth Getters
    token: () => TokenManager.getToken(),
    hasValidToken: () => !!TokenManager.getToken(),
    userProfile: (state) => state.user,
    isLoggedIn: (state) => state.isAuthenticated && !!TokenManager.getToken(),

    // Connectivity Getters
    connectivityStatus: () => connectivityService.getStatus(),
    canMakeRequests: (state) => state.isOnline && state.isAuthenticated,
  },

  actions: {
    // UI Actions
    toggleDarkMode() {
      this.isDarkMode = !this.isDarkMode;
    },

    // Auth Actions
    // Initialize auth state (call this on app startup)
    initializeAuth() {
      const token = TokenManager.getToken();

      if (token && this.user) {
        this.isAuthenticated = true;
      } else {
        this.clearAuth();
      }
    },

    // Handle successful authentication (called when token is received via deeplink)
    async handleAuthSuccess(access_token) {
      this.isLoading = true;
      this.authError = null;

      try {
        // Store tokens
        if (access_token) {
          TokenManager.setToken(access_token);
        }

        try {
          const result = await authService.getProfile();

          if (result.success && result.data) {
            this.user = result.data;
            this.isAuthenticated = true;
            router.push("/");
            setTimeout(() => {
              window.electronWindows.showWindow("main");
            }, 1000);
          } else {
            console.warn("Failed to fetch user profile:", result.error);
          }
        } catch (error) {
          console.warn("Failed to fetch user profile:", error);
        }

        console.log("Authentication successful");
        return true;
      } catch (error) {
        console.error("Error handling auth success:", error);
        this.authError = error.message;
        return false;
      } finally {
        this.isLoading = false;
      }
    },

    // Clear authentication data
    clearAuth() {
      TokenManager.removeToken();
      this.user = null;
      this.isAuthenticated = false;
      this.authError = null;
    },

    // Logout
    async logout() {
      this.isLoading = true;

      try {
        // Optionally call logout endpoint
        // await apiUtils.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT);

        this.clearAuth();
        console.log("Logged out successfully");
      } catch (error) {
        console.error("Error during logout:", error);
        // Still clear local auth data even if API call fails
        this.clearAuth();
      } finally {
        this.isLoading = false;
      }
    },
    openExternal(url) {
      window.electron?.openExternal?.(url) || window.open(url, "_blank");
    },

    // Update user profile
    updateUser(userData) {
      this.user = { ...this.user, ...userData };
      window.electronStore?.set(API_CONFIG.AUTH.USER_KEY, this.user);
    },

    // Set loading state
    setAuthLoading(loading) {
      this.isLoading = loading;
    },

    // Set error state
    setAuthError(error) {
      this.authError = error;
    },

    // Clear error state
    clearAuthError() {
      this.authError = null;
    },

    // Connectivity Actions
    // Initialize connectivity monitoring
    initializeConnectivity() {
      // Sync store state with connectivity service
      this.isOnline = connectivityService.isOnline;

      // Listen for connectivity changes and update store
      connectivityService.on("changed", (data) => {
        this.isOnline = data.isOnline;
        console.log(
          `Store connectivity updated: ${data.isOnline ? "Online" : "Offline"}`
        );
      });

      console.log("Store connectivity monitoring initialized");
    },

    // Get connectivity service instance (for direct access)
    getConnectivityService() {
      return connectivityService;
    },

    // Update connectivity state (called by service)
    updateConnectivityState(isOnline) {
      this.isOnline = isOnline;
    },
  },
});
