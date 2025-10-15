import { defineStore } from 'pinia'
import { TokenManager, apiClient } from './api/config.js'
import connectivityService from './services/connectivity.js'
import router from './router'

export const useStore = defineStore('main', {
    state: () => ({
        // UI State
        isDarkMode: false,
        isLoading: false,

        // Auth State
        authError: null,
        user: null,
        isAuthenticated: false,

        welcomeCompleted: false,

        // Connectivity State (synced with global service)
        isOnline: connectivityService.isOnline,

        // Upload State
        lastCapture: null
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
                this.logout()
            }
        },

        // Handle successful authentication (called when a token is received via deeplink)
        async handleAuthSuccess(access_token) {
            this.isLoading = true
            this.authError = null

            try {
                // Store tokens
                if (access_token) {
                    TokenManager.setToken(access_token)
                    console.log('Token set: ', access_token)
                }
                try {
                    const response = await apiClient.get('/user')
                    if (response.data) {
                        this.user = response.data
                        this.isAuthenticated = true
                        await router.push('/')
                        window.electron.showMainAtTray({ force: true, gap: 0 })
                    }
                    return true
                } catch (error) {
                    console.error('Error fetching user data:', error)
                    this.logout(error)
                    return false
                }
            } catch (error) {
                console.error('Error handling auth success:', error)
                this.logout(error)
            } finally {
                this.isLoading = false
            }
        },

        handleAuthError(error) {
            this.logout(error)
        },

        // Logout
        logout(error = null) {
            TokenManager.removeToken()
            this.user = null
            this.isAuthenticated = false
            this.authError = error
            this.isLoading = false
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
        },

        // Initialize store sync listener and watcher
        initializeStoreSync() {
            // Track previous state to detect actual changes
            let previousState = {}

            // Listen for updates from other windows
            if (window.electronStore?.onUpdate) {
                window.electronStore.onUpdate((key, value) => {
                    // Update store without triggering sync (to prevent infinite loops)
                    this._isReceivingSync = true
                    this[key] = value
                    // Update previous state to match
                    previousState[key] = value
                    this._isReceivingSync = false
                })
            }

            // Initialize previous state
            const syncableKeys = ['lastCapture', 'user', 'isAuthenticated', 'isDarkMode', 'welcomeCompleted']
            syncableKeys.forEach((key) => {
                previousState[key] = this[key]
            })

            // Watch for local store changes and sync to other windows
            this.$subscribe((mutation, state) => {
                // Skip sync if this update came from another window
                if (this._isReceivingSync) return

                // Check which syncable properties actually changed
                const changedKeys = []
                syncableKeys.forEach((key) => {
                    if (state[key] !== previousState[key]) {
                        changedKeys.push(key)
                        previousState[key] = state[key]
                    }
                })

                // Only sync if there are actual changes to syncable properties
                if (changedKeys.length > 0 && window.electronStore?.sync) {
                    console.log('Syncing changed keys to other windows:', changedKeys)
                    changedKeys.forEach((key) => {
                        window.electronStore.sync(key, state[key])
                    })
                }
            })
        },

        // Utility Actions
        getOs() {
            return window.electron.platform
        }
    }
})
