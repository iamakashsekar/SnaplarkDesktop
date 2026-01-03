import { defineStore } from 'pinia'
import { TokenManager, apiClient } from './api/config.js'
import connectivityService from './services/connectivity.js'
import router from './router'
import { defaultState, excludeFromPersist } from './store-defaults.js'
import { WINDOW_DIMENSIONS } from './config/window-config.js'

export const useStore = defineStore('main', {
    state: () => ({
        ...defaultState,
        // Runtime-only state (not persisted)
        isLoading: false,
        authError: null,
        isOnline: connectivityService.isOnline
    }),

    persist: {
        storage: {
            getItem: (key) => {
                // Get all stored data and filter out excluded keys
                const allData = window.electronStore.getAll() || {}
                const state = {}

                Object.keys(allData).forEach((stateKey) => {
                    // Skip keys that shouldn't be persisted
                    if (!excludeFromPersist.includes(stateKey)) {
                        state[stateKey] = allData[stateKey]
                    }
                })

                return Object.keys(state).length > 0 ? JSON.stringify(state) : null
            },
            setItem: (key, value) => {
                try {
                    const state = JSON.parse(value)

                    // Store each property separately, excluding runtime-only state
                    Object.keys(state).forEach((stateKey) => {
                        if (!excludeFromPersist.includes(stateKey)) {
                            window.electronStore.set(stateKey, state[stateKey])
                        }
                    })
                } catch (error) {
                    console.error('Error parsing state for persistence:', error)
                }
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
        canMakeRequests: (state) => state.isOnline && state.isAuthenticated,

        // Settings Getters
        appSettings: (state) => state.settings,
        isDarkMode: (state) => state.settings.darkMode
    },

    actions: {
        // UI Actions
        toggleDarkMode() {
            this.settings.darkMode = !this.settings.darkMode
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

                    // Verify token was saved
                    const savedToken = TokenManager.getToken()
                    if (!savedToken || savedToken !== access_token) {
                        console.error('Token verification failed. Expected:', access_token, 'Got:', savedToken)
                        throw new Error('Failed to save authentication token')
                    }
                    console.log('Token verified in storage:', savedToken ? '✓' : '✗')
                } else {
                    throw new Error('No access token provided')
                }

                try {
                    const response = await apiClient.get('/user')
                    if (response.data) {
                        this.user = response.data
                        this.isAuthenticated = true
                        window.electronWindows?.hideWindow('main')
                        // Resize to main dimensions before showing
                        await window.electronWindows?.resizeWindow('main', WINDOW_DIMENSIONS.main.width, WINDOW_DIMENSIONS.main.height)
                        // Push to main route
                        await router.push('/')

                        const welcomeCompleted = window.electronStore.get('welcomeCompleted')
                        if (!welcomeCompleted) {
                            window.electronWindows.createWindow('welcome')
                        } else {
                            window.electron.showMainAtTray({ force: true, gap: 5 })
                        }
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

        // Settings Actions
        updateSettings(settingsData) {
            this.settings = { ...this.settings, ...settingsData }
        },

        async updateSetting(key, value) {
            this.settings[key] = value
        },

        resetSettings() {
            this.settings = { ...defaultState.settings }
        },

        initializeConnectivity() {
            this.isOnline = connectivityService.isOnline
            connectivityService.on('changed', (data) => {
                this.isOnline = data.isOnline
            })
        },

        // Initialize store sync listener and watcher
        initializeStoreSync() {
            // Helper function to check if a value can be safely serialized for IPC
            const canSerialize = (value) => {
                try {
                    // Test if the value can be serialized using JSON
                    JSON.stringify(value)
                    return true
                } catch (error) {
                    return false
                }
            }

            // Track previous state to detect actual changes (stores JSON strings for deep comparison)
            let previousState = {}

            // Listen for updates from other windows
            if (window.electronStore?.onUpdate) {
                window.electronStore.onUpdate((key, value) => {
                    // Skip auth_token - it's managed separately by TokenManager
                    if (key === 'auth_token') {
                        return
                    }
                    // Only update if this key exists in the Pinia state
                    if (key in this.$state) {
                        // Update store without triggering sync (to prevent infinite loops)
                        this._isReceivingSync = true

                        // Use $patch to ensure reactivity triggers correctly
                        this.$patch({ [key]: value })

                        // Update previous state to match (store as string)
                        try {
                            previousState[key] = JSON.stringify(value)
                        } catch (e) {
                            console.warn('Failed to stringify synced value for previousState:', e)
                        }
                        this._isReceivingSync = false
                    }
                })
            }

            // Get all syncable keys (all state keys except excluded ones)
            const syncableKeys = Object.keys(this.$state).filter((key) => !excludeFromPersist.includes(key))

            // Initialize previous state
            syncableKeys.forEach((key) => {
                try {
                    previousState[key] = JSON.stringify(this[key])
                } catch (e) {
                    console.warn('Failed to initialize previousState for key:', key)
                }
            })

            // Watch for local store changes and sync to other windows
            this.$subscribe((mutation, state) => {
                // Skip sync if this update came from another window
                if (this._isReceivingSync) return

                // Check which syncable properties actually changed
                const changedKeys = []
                syncableKeys.forEach((key) => {
                    let currentValueStr
                    try {
                        currentValueStr = JSON.stringify(state[key])
                    } catch (e) {
                        return // Skip if not serializable
                    }

                    if (currentValueStr !== previousState[key]) {
                        changedKeys.push(key)
                        previousState[key] = currentValueStr
                    }
                })

                // Only sync if there are actual changes to syncable properties
                if (changedKeys.length > 0 && window.electronStore?.sync) {
                    console.log('Syncing changed keys to other windows:', changedKeys)
                    changedKeys.forEach((key) => {
                        const value = state[key]
                        // Only sync if the value can be safely serialized
                        if (canSerialize(value)) {
                            try {
                                // Deep clone to strip Vue Proxies which cause IPC cloning errors
                                const rawValue = JSON.parse(JSON.stringify(value))
                                window.electronStore.sync(key, rawValue)
                            } catch (error) {
                                console.warn(`Failed to sync key "${key}" to other windows:`, error.message)
                            }
                        } else {
                            console.warn(`Skipping sync for key "${key}" - value is not serializable`)
                        }
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
