import { defineStore } from 'pinia'
import { TokenManager, apiClient } from './api/config.js'
import connectivityService from './services/connectivity.js'
import router from './router'

// Keys that should NOT be persisted (runtime-only state)
const excludeFromPersist = ['isLoading', 'isOnline', 'authError']

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
        lastCapture: null,

        // App Settings
        settings: {
            // General
            launchAtStartup: false,
            language: 'en',
            defaultSaveFolder: '~/Pictures/Snaplark',

            // Hotkeys
            hotkeyScreenshot: 'Shift + Cmd + S',
            hotkeyRecording: 'Shift + Cmd + R',
            hotkeyQuickMenu: 'Ctrl + Alt + S',

            // Capture
            uploadQuality: 'high',
            showMagnifier: true,
            showGrid: false,
            showCursor: true,

            // Recording
            flipCamera: false,
            recordAudioMono: false,
            recordingCountdown: true
        }
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
        appSettings: (state) => state.settings
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

        // Settings Actions
        updateSettings(settingsData) {
            this.settings = { ...this.settings, ...settingsData }
        },

        async updateSetting(key, value) {
            this.settings[key] = value

            // Sync launch at startup with OS
            if (key === 'launchAtStartup') {
                await this.syncLaunchAtStartup(value)
            }
        },

        async syncLaunchAtStartup(enabled) {
            try {
                console.log(`Syncing launch at startup to OS: ${enabled}`)
                const result = await window.electron.setLaunchAtStartup(enabled)
                if (result.success) {
                    console.log(`Successfully set launch at startup to: ${enabled}`)
                } else {
                    console.error('Failed to set launch at startup:', result.error)
                }
            } catch (error) {
                console.error('Error syncing launch at startup:', error)
            }
        },

        async initializeLaunchAtStartup() {
            try {
                // Get the actual OS setting
                const result = await window.electron.getLaunchAtStartup()
                if (result.success) {
                    // If store setting differs from OS, sync store setting TO OS
                    // This ensures user's saved preference takes precedence
                    if (this.settings.launchAtStartup !== result.enabled) {
                        console.log(
                            `Launch at startup mismatch. Store: ${this.settings.launchAtStartup}, OS: ${result.enabled}. Syncing to OS...`
                        )
                        await this.syncLaunchAtStartup(this.settings.launchAtStartup)
                    }
                }
            } catch (error) {
                console.error('Error initializing launch at startup:', error)
            }
        },

        resetSettings() {
            this.settings = {
                launchAtStartup: false,
                language: 'en',
                defaultSaveFolder: '~/Pictures/Snaplark',
                hotkeyScreenshot: 'Shift + Cmd + S',
                hotkeyRecording: 'Shift + Cmd + R',
                hotkeyQuickMenu: 'Ctrl + Alt + S',
                uploadQuality: 'high',
                showMagnifier: true,
                showGrid: false,
                showCursor: true,
                flipCamera: false,
                recordAudioMono: false,
                recordingCountdown: true
            }
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

            // Get all syncable keys (all state keys except excluded ones)
            const syncableKeys = Object.keys(this.$state).filter((key) => !excludeFromPersist.includes(key))

            // Initialize previous state
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
