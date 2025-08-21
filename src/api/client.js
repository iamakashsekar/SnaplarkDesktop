import axios from "axios";
import { API_CONFIG } from "./config.js";

// Create the main Axios instance
const apiClient = axios.create({
  baseURL: `${API_CONFIG.BASE_URL}/${API_CONFIG.API_VERSION}`,
  timeout: API_CONFIG.TIMEOUT,
  headers: API_CONFIG.DEFAULT_HEADERS,
});

// Token management utilities
class TokenManager {
  static getToken() {
    return window.electronStore?.get(API_CONFIG.AUTH.TOKEN_KEY) || null;
  }

  static setToken(token) {
    window.electronStore?.set(API_CONFIG.AUTH.TOKEN_KEY, token);
  }

  static removeToken() {
    window.electronStore?.set(API_CONFIG.AUTH.TOKEN_KEY, null);
  }

  static getRefreshToken() {
    return window.electronStore?.get(API_CONFIG.AUTH.REFRESH_TOKEN_KEY) || null;
  }

  static setRefreshToken(token) {
    window.electronStore?.set(API_CONFIG.AUTH.REFRESH_TOKEN_KEY, token);
  }

  static removeRefreshToken() {
    window.electronStore?.set(API_CONFIG.AUTH.REFRESH_TOKEN_KEY, null);
  }
}

// Request interceptor - automatically attach auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = TokenManager.getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    console.error("[API Request Error]", error);
    return Promise.reject(error);
  }
);

// Response interceptor - handle token expiration and refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized - Token expired or invalid
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = TokenManager.getRefreshToken();

        if (refreshToken) {
          // Attempt to refresh the token
          const refreshResponse = await axios.post(
            `${API_CONFIG.BASE_URL}/${API_CONFIG.API_VERSION}${API_CONFIG.ENDPOINTS.AUTH.REFRESH}`,
            { refresh_token: refreshToken }
          );

          const { access_token, refresh_token: newRefreshToken } =
            refreshResponse.data;

          // Store new tokens
          TokenManager.setToken(access_token);
          if (newRefreshToken) {
            TokenManager.setRefreshToken(newRefreshToken);
          }

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        console.error("[Token Refresh Error]", refreshError);

        // Refresh failed - clear tokens and redirect to login
        TokenManager.removeToken();
        TokenManager.removeRefreshToken();

        // Emit custom event for auth failure (can be listened to by Vue components)
        window.dispatchEvent(
          new CustomEvent("auth:logout", {
            detail: { reason: "token_refresh_failed" },
          })
        );
      }
    }

    // Handle network errors
    if (!error.response) {
      console.error("[Network Error]", error.message);
      return Promise.reject({
        ...error,
        message: "Network error. Please check your connection.",
        isNetworkError: true,
      });
    }

    // Handle other HTTP errors
    const errorResponse = {
      status: error.response.status,
      message: error.response.data?.message || error.message,
      data: error.response.data,
      isHttpError: true,
    };

    // Log errors in development
    if (process.env.NODE_ENV === "development") {
      console.error(
        `[API Error] ${error.response.status} ${error.config.url}`,
        errorResponse
      );
    }

    return Promise.reject(errorResponse);
  }
);

// Utility functions for common request patterns
export const apiUtils = {
  // GET request
  get: (url, config = {}) => apiClient.get(url, config),

  // POST request
  post: (url, data = {}, config = {}) => apiClient.post(url, data, config),

  // PUT request
  put: (url, data = {}, config = {}) => apiClient.put(url, data, config),

  // PATCH request
  patch: (url, data = {}, config = {}) => apiClient.patch(url, data, config),

  // DELETE request
  delete: (url, config = {}) => apiClient.delete(url, config),

  // Upload file with progress tracking
  upload: (url, formData, onUploadProgress = null) => {
    return apiClient.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
    });
  },
};

// Token management utilities export
export { TokenManager };

// Export the configured client
export default apiClient;
