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
    timeout: 0, // No timeout - unlimited
    maxContentLength: Infinity, // No content length limit
    maxBodyLength: Infinity, // No body length limit
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    }
})

// Shared request interceptor function
const requestInterceptor = (config) => {
    const token = TokenManager.getToken()
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
}

const requestErrorInterceptor = (error) => {
    console.error('[API Request Error]', error)
    return Promise.reject(error)
}

// Shared response interceptor function
const responseSuccessInterceptor = (response) => response

const responseErrorInterceptor = async (error) => {
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

    // Handle connection aborted errors (rare since timeout is disabled)
    if (error.code === 'ECONNABORTED') {
        console.error('[Connection Aborted]', error.message)
        return Promise.reject({
            ...error,
            message: 'Connection was interrupted. Please try again.',
            isConnectionError: true
        })
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

// Apply interceptors to API client
apiClient.interceptors.request.use(requestInterceptor, requestErrorInterceptor)
apiClient.interceptors.response.use(responseSuccessInterceptor, responseErrorInterceptor)
