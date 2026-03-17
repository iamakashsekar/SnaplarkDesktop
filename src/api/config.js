import axios from 'axios'
import { serializeError, serializeForLog } from '../services/log-shared.js'
import { translate } from '../i18n'

// Centralized URL Configuration
export const BASE_URL = 'https://snaplark.com'
export const API_PREFIX = 'api'
export const API_VERSION = 'v1'
export const API_BASE_URL = `${BASE_URL}/${API_PREFIX}/${API_VERSION}`
export const PROTOCOL = 'snaplark'

export const updatesUrl = (platform, arch) => `${API_BASE_URL}/updates/${platform}/${arch}`

const emitApiLog = (level, event, message, context = {}) => {
    if (typeof window === 'undefined' || !window.electronLogger?.write) {
        return
    }

    window.electronLogger.write({
        level,
        event,
        message,
        scope: 'api',
        processType: 'renderer',
        context: serializeForLog(context)
    })
}

// Token management utilities
export class TokenManager {
    static getToken() {
        const token = window.electronStore?.get('auth_token') || null
        console.log('[TokenManager] getToken() called, returning:', token ? `${token.substring(0, 20)}...` : 'null')
        return token
    }

    static setToken(token) {
        console.log('[TokenManager] setToken() called with:', token ? `${token.substring(0, 20)}...` : 'null')
        if (!window.electronStore) {
            console.error('[TokenManager] window.electronStore is not available!')
            return false
        }
        const result = window.electronStore.set('auth_token', token)
        console.log('[TokenManager] setToken() result:', result)

        // Immediate verification
        const verified = window.electronStore.get('auth_token')
        console.log(
            '[TokenManager] Immediate verification:',
            verified ? `${verified.substring(0, 20)}...` : 'null',
            verified === token ? '✓' : '✗'
        )
        return result
    }

    static removeToken() {
        console.log('[TokenManager] removeToken() called')
        window.electronStore?.set('auth_token', null)
    }
}

// Create the main API client
export const apiClient = axios.create({
    baseURL: API_BASE_URL,
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
    const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const token = TokenManager.getToken()
    config.metadata = {
        requestId,
        startedAt: Date.now()
    }

    console.log(
        '[API Request Interceptor] Token available:',
        token ? '✓' : '✗',
        token ? `(${token.substring(0, 20)}...)` : ''
    )
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    } else {
        console.warn('[API Request Interceptor] No token available for request to:', config.url)
    }

    emitApiLog('info', 'api.request', 'API request started', {
        requestId,
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        hasAuthToken: !!token
    })

    return config
}

const requestErrorInterceptor = (error) => {
    console.error('[API Request Error]', error)
    emitApiLog('error', 'api.request_error', 'API request failed before sending', {
        error: serializeError(error)
    })
    return Promise.reject(error)
}

// Shared response interceptor function
const responseSuccessInterceptor = (response) => {
    const durationMs = response.config?.metadata?.startedAt ? Date.now() - response.config.metadata.startedAt : null

    emitApiLog('info', 'api.response', 'API request completed', {
        requestId: response.config?.metadata?.requestId,
        method: response.config?.method?.toUpperCase(),
        url: response.config?.url,
        status: response.status,
        durationMs
    })

    return response
}

const responseErrorInterceptor = async (error) => {
    const durationMs = error.config?.metadata?.startedAt ? Date.now() - error.config.metadata.startedAt : null

    emitApiLog('error', 'api.response_error', 'API request failed', {
        requestId: error.config?.metadata?.requestId,
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        durationMs,
        error: serializeError(error) || serializeForLog(error)
    })

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
            message: translate('errors.connectionInterrupted'),
            isConnectionError: true
        })
    }

    // Handle network errors
    if (!error.response) {
        console.error('[Network Error]', error.message)
        return Promise.reject({
            ...error,
            message: translate('errors.network'),
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
