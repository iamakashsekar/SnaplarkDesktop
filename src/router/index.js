import { createRouter, createWebHashHistory } from 'vue-router'
// Import views for different window types
import MainView from '../views/MainView.vue'
import SettingsView from '../views/SettingsView.vue'
import WelcomeView from '../views/WelcomeView.vue'
import TourView from '../views/TourView.vue'
import LoginView from '../views/LoginView.vue'
import ScreenshotView from '../views/ScreenshotView.vue'
import DesignView from '../views/DesignView.vue'
import NotificationsView from '../views/NotificationsView.vue'
import { useStore } from '../store'
import VideoRecordingView from '../views/VideoRecordingView.vue'

const routes = [
    {
        path: '/',
        name: 'main',
        component: MainView,
        meta: { windowType: 'main' }
    },
    {
        path: '/login',
        name: 'login',
        component: LoginView,
        meta: { windowType: 'main' }
    },
    {
        path: '/settings',
        name: 'settings',
        component: SettingsView,
        meta: { windowType: 'settings' }
    },
    {
        path: '/welcome',
        name: 'welcome',
        component: WelcomeView,
        meta: { windowType: 'welcome' }
    },
    {
        path: '/tour',
        name: 'tour',
        component: TourView,
        meta: { windowType: 'tour' }
    },
    {
        path: '/screenshot',
        name: 'screenshot',
        component: ScreenshotView,
        meta: { windowType: 'screenshot' }
    },
    {
        path: '/recording',
        name: 'recording',
        component: VideoRecordingView,
        meta: { windowType: 'recording' }
    },
    {
        path: '/design',
        name: 'design',
        component: DesignView,
        meta: { windowType: 'design' }
    },
    {
        path: '/notifications',
        name: 'notifications',
        component: NotificationsView,
        meta: { windowType: 'notifications' }
    }
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

// Navigation guard to handle window type routing
router.beforeEach(async (to, from, next) => {
    // Get the current window type from Electron
    try {
        const windowType = await window.electronWindows?.getWindowType()

        // If the window is 'main', decide whether to show login or main view
        if (windowType === 'main') {
            const store = useStore()
            if (!store.isLoggedIn && to.name !== 'login') {
                next({ name: 'login' })
            } else if (store.isLoggedIn && to.name === 'login') {
                next({ name: 'main' })
            } else {
                next()
            }
            return
        }

        // If we have URL parameters indicating window type, use that
        const urlParams = new URLSearchParams(window.location.search)
        const urlWindowType = urlParams.get('window')

        const targetWindowType = urlWindowType || windowType || 'main'

        // Find the route that matches the window type
        const targetRoute = routes.find((route) => route.meta.windowType === targetWindowType)

        if (targetRoute && to.path !== targetRoute.path) {
            // Redirect to the correct route for this window type
            next(targetRoute.path)
        } else {
            next()
        }
    } catch (error) {
        console.error('Error in router navigation guard:', error)
        next()
    }
})

export default router
