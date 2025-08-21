import { defineStore } from 'pinia'
import { TokenManager, apiClient } from '@/api/config.js'
import connectivityService from '@/services/connectivity.js'
import router from '@/router'

export const useStore = defineStore('main', {
    state: () => ({
        // UI State
        isDarkMode: false,

        // Auth State
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authError: null,

        // Connectivity State (synced with global service)
        isOnline: connectivityService.isOnline
    }),

    persist: {
        storage: {
            getItem: (key) => {
                return window.electronStore.get(key)
            },
            setItem: (key, value) => {
                window.electronStore.set(key, value)
            }
        }
    },

    getters: {
        // Auth Getters
        token: () => TokenManager.getToken(),
        hasValidToken: () => !!TokenManager.getToken(),
        userProfile: (state) => state.user,
        isLoggedIn: (state) => state.isAuthenticated && !!TokenManager.getToken(),

        // Connectivity Getters
        connectivityStatus: () => connectivityService.getStatus(),
        canMakeRequests: (state) => state.isOnline && state.isAuthenticated
    },

    actions: {
        // UI Actions
        toggleDarkMode() {
            this.isDarkMode = !this.isDarkMode
        },

        // Auth Actions
        // Initialize auth state (call this on app startup)
        initializeAuth() {
            const token = TokenManager.getToken()

            if (token && this.user) {
                this.isAuthenticated = true
            } else {
                this.clearAuth()
            }
        },

        // Handle successful authentication (called when token is received via deeplink)
        async handleAuthSuccess(access_token) {
            this.isLoading = true
            this.authError = null

            try {
                // Store tokens
                if (access_token) {
                    TokenManager.setToken(access_token)
                }

                try {
                    const response = await apiClient.get('/user')
                    if (response.data) {
                        this.user = response.data
                        this.isAuthenticated = true
                        router.push('/')
                        setTimeout(() => {
                            window.electronWindows.showWindow('main')
                        }, 1000)
                    }
                } catch (error) {
                    console.warn('Failed to fetch user profile:', error)
                }

                console.log('Authentication successful')
                return true
            } catch (error) {
                console.error('Error handling auth success:', error)
                this.authError = error.message
                return false
            } finally {
                this.isLoading = false
            }
        },

        // Clear authentication data
        clearAuth() {
            TokenManager.removeToken()
            this.user = null
            this.isAuthenticated = false
            this.authError = null
        },

        // Logout
        async logout() {
            this.isLoading = true
            try {
                this.clearAuth()
                console.log('Logged out successfully')
            } catch (error) {
                console.error('Error during logout:', error)
                this.clearAuth()
            } finally {
                this.isLoading = false
            }
        },
        openExternal(url) {
            window.electron?.openExternal?.(url) || window.open(url, '_blank')
        },

        updateUser(userData) {
            this.user = { ...this.user, ...userData }
        },

        initializeConnectivity() {
            this.isOnline = connectivityService.isOnline
            connectivityService.on('changed', (data) => {
                this.isOnline = data.isOnline
            })
        }
    }
})
