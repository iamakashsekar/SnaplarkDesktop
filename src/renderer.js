import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import { useStore } from './store.js'
import { rendererLogService } from './services/renderer-log-service.js'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
pinia.use(rendererLogService.createPiniaPlugin())

rendererLogService.initialize(router)

const app = createApp(App)

app.use(pinia)
app.use(router)

// Initialize the app
const appInstance = app.mount('#app')
rendererLogService.info('renderer.app_mounted', 'Vue application mounted successfully', {}, 'bootstrap')

// Initialize store and services after app is mounted
const store = useStore()
store.initializeAuth()
store.initializeConnectivity()
store.initializeStoreSync()

// Listen for global screenshot shortcut trigger
if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('trigger-screenshot', async () => {
        console.log('Screenshot triggered via global shortcut')
        try {
            await window.electron.startScreenshotMode()
        } catch (error) {
            console.error('Error starting screenshot mode:', error)
        }
    })

    window.electron.ipcRenderer.on('trigger-video-recording', async () => {
        console.log('Video recording triggered via global shortcut')
        try {
            await window.electron.startVideoRecordingMode()
        } catch (error) {
            console.error('Error starting video recording mode:', error)
        }
    })

    window.electron.ipcRenderer.on('trigger-quick-menu', async () => {
        console.log('Video recording triggered via global shortcut')
        try {
            await window.electron.showMainAtTray({ force: true, gap: 5 })
        } catch (error) {
            console.error('Error starting video recording mode:', error)
        }
    })
}

// Listen for auth events from the HTTP client
// window.addEventListener("auth:logout", (event) => {
//   console.log("Auth logout event received:", event.detail);
//   store.clearAuth();
// });

// Listen for authentication responses from the main process (deeplink handling)
if (window.electronAuth) {
    window.electronAuth.onAuthResponse((authData) => {
        if (authData.error) {
            store.handleAuthError(authData.error)
        } else if (authData.access_token) {
            store.handleAuthSuccess(authData.access_token)
        }
    })
}
