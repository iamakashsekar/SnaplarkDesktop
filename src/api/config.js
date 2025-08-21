import axios from 'axios'

// Single API Configuration - everything in one place
export const BASE_URL = 'https://snaplark.com'
export const API_VERSION = 'v1'
export const PROTOCOL = 'snaplark'

// Token management utilities
export class TokenManager {
    static getToken() {
        return window.electronStore?.get('auth_token') || null
    }

    static setToken(token) {
        window.electronStore?.set('auth_token', token)
    }

    static removeToken() {
        window.electronStore?.set('auth_token', null)
    }
}

// Create the main API client
export const apiClient = axios.create({
    baseURL: `${BASE_URL}/api/${API_VERSION}`,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    }
})

// Request interceptor - automatically attach auth token
apiClient.interceptors.request.use(
    (config) => {
        const token = TokenManager.getToken()
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    },
    (error) => {
        console.error('[API Request Error]', error)
        return Promise.reject(error)
    }
)

// Response interceptor - handle errors
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        // Handle 401 Unauthorized - Token expired or invalid
        if (error.response?.status === 401) {
            // Clear tokens and emit logout event
            TokenManager.removeToken()

            // Emit custom event for auth failure
            window.dispatchEvent(
                new CustomEvent('auth:logout', {
                    detail: { reason: 'token_expired' }
                })
            )
        }

        // Handle network errors
        if (!error.response) {
            console.error('[Network Error]', error.message)
            return Promise.reject({
                ...error,
                message: 'Network error. Please check your connection.',
                isNetworkError: true
            })
        }

        // Handle other HTTP errors
        const errorResponse = {
            status: error.response.status,
            message: error.response.data?.message || error.message,
            data: error.response.data,
            isHttpError: true
        }

        return Promise.reject(errorResponse)
    }
)
