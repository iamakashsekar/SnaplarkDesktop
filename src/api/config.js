// API Configuration
export const API_CONFIG = {
  // Base URL for your API - update this to your actual API endpoint
  // BASE_URL:
  //   process.env.NODE_ENV === "production"
  //     ? "https://snaplark.com/api"
  //     : "http://snaplark.test/api",
  BASE_URL: "http://snaplark.test/api",

  // Request timeout in milliseconds
  TIMEOUT: 30000,

  // Headers that should be included in all requests
  DEFAULT_HEADERS: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  // API version (if your API uses ver sioning)
  API_VERSION: "v1",

  // Auth-related constants
  AUTH: {
    TOKEN_KEY: "auth_token",
  },

  // Custom protocol for deep linking
  PROTOCOL: "snaplark",

  // Endpoints
  ENDPOINTS: {
    AUTH: {
      LOGIN: "/auth/login",
      REGISTER: "/auth/register",
      REFRESH: "/auth/refresh",
      LOGOUT: "/auth/logout",
      ME: "/user",
    },
    BLOG: {
      POSTS: "/blogs/latest",
    },
    MEDIA: {
      UPLOAD: "/media/upload",
      UPLOADS: "/media/uploads",
    },
  },
};

// Custom protocol handler URLs
export const WEB_URLS = {
  // BASE_URL:
  //   process.env.NODE_ENV === "production"
  //     ? "https://snaplark.com"
  //     : "http://snaplark.test",
  BASE_URL: "http://snaplark.test",
  HELP_CENTER: "/help-center",
  CAPTURES: "/captures",
  PROFILE: "/account/settings",
};
