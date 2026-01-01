<script setup>
    import whatsNewBg from '../assets/backgrounds/whats-new-bg.png'
    import { useStore } from '../store'
    import { useConnectivity } from '../services/connectivity.js'
    import { onMounted, ref } from 'vue'
    import 'vue3-carousel/carousel.css'
    import { Carousel, Slide } from 'vue3-carousel'
    import { apiClient, BASE_URL, PROTOCOL } from '../api/config.js'
    import { useWindows } from '../composables/useWindows'
    import router from '../router'
    import GradientFrame from '@/components/GradientFrame.vue'
    import { WINDOW_DIMENSIONS } from '@/config/window-config'

    const { hideWindow, resizeWindowTo } = useWindows()

    const carouselConfig = {
        autoplay: 5000,
        itemsToShow: 1,
        wrapAround: true,
        pauseAutoplayOnHover: true
    }

    const store = useStore()

    // Handle login button click
    const handleLogin = async () => {
        const deviceName = await window.electron.getDeviceName()
        const loginUrl = `${BASE_URL}/auth/client?callback_protocol=${
            PROTOCOL
        }&action=login&device_name=${encodeURIComponent(deviceName)}`
        store.openExternal(loginUrl)
        await hideWindow('main')
    }

    // Handle register button click
    const handleRegister = async () => {
        const deviceName = await window.electron.getDeviceName()
        const registerUrl = `${BASE_URL}/auth/client?callback_protocol=${
            PROTOCOL
        }&action=register&device_name=${encodeURIComponent(deviceName)}`
        store.openExternal(registerUrl)
        await hideWindow('main')
    }

    // Blog post state
    const latestPost = ref(null)

    // Fetch latest blog post directly
    const fetchLatestPost = async () => {
        try {
            const response = await apiClient.get('/blogs/latest')
            const posts = response.data.data || response.data.posts || response.data || []
            if (posts.length > 0) {
                latestPost.value = posts[0] // Get the first (latest) post
            }
        } catch (error) {
            console.warn('Failed to fetch blog post:', error)
        }
    }

    // Use global connectivity system
    const { isOnline, onRestored } = useConnectivity()

    // Handle fetching blog post with connectivity check
    const handleBlogPostFetch = async () => {
        if (!isOnline.value) {
            console.log('Offline - skipping blog post fetch')
            return
        }

        console.log('Online - fetching blog post')
        try {
            await fetchLatestPost()
            console.log('Blog post fetched successfully')
        } catch (error) {
            console.warn('Failed to fetch blog post:', error)
        }
    }

    onMounted(async () => {
        if (store.isLoggedIn) {
            window.electronWindows?.hideWindow('main')
            await resizeWindowTo('main', WINDOW_DIMENSIONS.main.width, WINDOW_DIMENSIONS.main.height)
            await router.push('/')
        }
        // Try to fetch blog post if online
        await handleBlogPostFetch()

        // Setup listener for when connection is restored
        onRestored(() => {
            handleBlogPostFetch()
        })
    })
</script>

<template>
    <GradientFrame>
        <div class="dark:bg-dark-blue space-y-6 rounded-2xl bg-white px-2 py-3">
            <div class="mx-auto w-3/4 space-y-6">
                <div class="pt-7 text-center">
                    <h1 class="text-gray-black mb-2 text-2xl font-bold dark:text-white">
                        Sign in to <span class="text-primary-blue">Snaplark</span>
                    </h1>
                </div>
                <!-- Sign In Buttons -->
                <div class="space-y-3">
                    <!-- Login Button -->
                    <button
                        @click="handleLogin"
                        :disabled="store.isLoading"
                        class="border-primary-blue cursor-pointer text-primary-blue dark:bg-dark-800 dark:hover:bg-dark-700 w-full rounded-full border-2 bg-white px-6 py-3 text-base font-semibold transition-all duration-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <span v-if="store.isLoading">Loading...</span>
                        <span v-else>Login</span>
                    </button>

                    <!-- Register Button -->
                    <button
                        @click="handleRegister"
                        :disabled="store.isLoading"
                        class="bg-primary-blue cursor-pointer w-full rounded-full px-6 py-3 text-base font-semibold text-white transition-all duration-200 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
                        <span v-if="store.isLoading">Loading...</span>
                        <span v-else>Register</span>
                    </button>
                </div>
            </div>

            <div
                :style="{ backgroundImage: `url(${whatsNewBg})` }"
                class="shadow-cyan/50 relative min-h-56 rounded-2xl bg-cover bg-center shadow-lg">
                <Carousel v-bind="carouselConfig">
                    <!-- Blog Slider -->
                    <Slide>
                        <div class="space-y-6 px-6 pt-5 text-white">
                            <!-- Header -->
                            <div class="mb-5 space-y-1">
                                <h2 class="text-[28px] font-bold">What's new?</h2>
                                <p class="text-xs">check out the latest updates on Snaplark blog</p>
                            </div>

                            <!-- Latest Blog Post -->
                            <div class="space-y-2.5">
                                <!-- Latest Blog Post from API -->
                                <div
                                    v-if="latestPost"
                                    class="dark:bg-dark-900 dark:hover:bg-dark-800 flex cursor-pointer items-center gap-3 rounded-xl bg-white p-2 transition-colors hover:bg-gray-50"
                                    @click="store.openExternal(`https://snaplark.com/blog/${latestPost.slug}`)">
                                    <img
                                        v-if="latestPost.thumb_url"
                                        class="h-[93px] w-1/2 rounded-lg object-cover"
                                        :src="latestPost.thumb_url"
                                        :alt="latestPost.title"
                                        @error="(e) => (e.target.style.display = 'none')" />
                                    <div
                                        v-else
                                        class="flex h-[93px] w-1/2 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-cyan-400">
                                        <span class="text-xs font-semibold text-white">Snaplark</span>
                                    </div>
                                    <div class="flex-1">
                                        <p class="text-gray-black line-clamp-3 text-sm font-bold dark:text-white">
                                            {{ latestPost.title || 'Latest Update' }}
                                        </p>
                                        <p
                                            v-if="latestPost.excerpt"
                                            class="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                            {{ latestPost.excerpt }}
                                        </p>
                                    </div>
                                </div>

                                <!-- Fallback content if no post is available -->
                                <div
                                    v-else
                                    @click="store.openExternal('https://snaplark.com/blog')"
                                    class="dark:bg-dark-900 flex cursor-pointer items-center gap-3 rounded-xl bg-white p-2">
                                    <div
                                        class="flex h-[93px] w-1/2 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-cyan-400">
                                        <span class="text-xs font-semibold text-white">Snaplark</span>
                                    </div>
                                    <p class="text-gray-black text-sm font-bold dark:text-white">
                                        Welcome to Snaplark! Check out our blog for the latest updates and tutorials.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Slide>

                    <!-- Lightweight mode -->
                    <Slide>
                        <div class="space-y-6 px-6 pt-5 text-white">
                            <!-- Header -->
                            <div class="mb-5 space-y-1">
                                <h2 class="text-[28px] font-bold">Lightweight mode</h2>
                                <p class="text-xs">
                                    Are you overwhelmed by the number of available options? Use lightweight mode to
                                    disable resource-intensive features and improve performance
                                </p>
                            </div>

                            <img
                                class="mx-auto h-auto w-3/5"
                                src="@/assets/images/lightweight-mode.png"
                                alt="lightweight mode" />
                        </div>
                    </Slide>

                    <!-- Did you know? -->
                    <Slide>
                        <div class="w-full space-y-6 px-6 pt-5 text-white">
                            <!-- Header -->
                            <div class="mb-5 space-y-1">
                                <h2 class="text-[28px] font-bold">Did you know?</h2>
                                <p class="text-xs">Having multi monitors? Snaplark covers them all!</p>
                            </div>
                            <img
                                class="mx-auto w-46"
                                src="@/assets/images/multi-monitors.png"
                                alt="multi monitors" />
                        </div>
                    </Slide>

                    <!-- Premium member -->
                    <Slide>
                        <div class="space-y-6 px-6 pt-5 text-white">
                            <!-- Header -->
                            <div class="mb-5 space-y-1">
                                <h2 class="text-2xl font-bold">Premium member yet?</h2>
                            </div>

                            <img
                                src="@/assets/images/premium-member.png"
                                alt="premium member" />
                        </div>
                    </Slide>
                </Carousel>

                <!-- Footer Links -->
                <div class="mt-6 flex justify-between gap-1 border-t border-white/50 px-6 py-4 text-white">
                    <a
                        href="https://www.snaplark.com"
                        target="_blank"
                        class="flex items-center gap-1.5 transition-colors duration-200 hover:text-blue-200">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="size-3"
                            viewBox="0 0 24 24"
                            fill="none">
                            <g clip-path="url(#clip0_4418_8228)">
                                <path
                                    d="M7.65006 20.9098C7.62006 20.9098 7.58006 20.9298 7.55006 20.9298C5.61006 19.9698 4.03006 18.3798 3.06006 16.4398C3.06006 16.4098 3.08006 16.3698 3.08006 16.3398C4.30006 16.6998 5.56006 16.9698 6.81006 17.1798C7.03006 18.4398 7.29006 19.6898 7.65006 20.9098Z"
                                    fill="white" />
                                <path
                                    d="M20.94 16.4498C19.95 18.4398 18.3 20.0498 16.29 21.0198C16.67 19.7498 16.99 18.4698 17.2 17.1798C18.46 16.9698 19.7 16.6998 20.92 16.3398C20.91 16.3798 20.94 16.4198 20.94 16.4498Z"
                                    fill="white" />
                                <path
                                    d="M21.02 7.71047C19.76 7.33047 18.49 7.02047 17.2 6.80047C16.99 5.51047 16.68 4.23047 16.29 2.98047C18.36 3.97047 20.03 5.64047 21.02 7.71047Z"
                                    fill="white" />
                                <path
                                    d="M7.64998 3.09055C7.28998 4.31055 7.02998 5.55055 6.81998 6.81055C5.52998 7.01055 4.24998 7.33055 2.97998 7.71055C3.94998 5.70055 5.55998 4.05055 7.54998 3.06055C7.57998 3.06055 7.61998 3.09055 7.64998 3.09055Z"
                                    fill="white" />
                                <path
                                    d="M15.49 6.59C13.17 6.33 10.83 6.33 8.51001 6.59C8.76001 5.22 9.08001 3.85 9.53001 2.53C9.55001 2.45 9.54001 2.39 9.55001 2.31C10.34 2.12 11.15 2 12 2C12.84 2 13.66 2.12 14.44 2.31C14.45 2.39 14.45 2.45 14.47 2.53C14.92 3.86 15.24 5.22 15.49 6.59Z"
                                    fill="white" />
                                <path
                                    d="M6.59 15.4898C5.21 15.2398 3.85 14.9198 2.53 14.4698C2.45 14.4498 2.39 14.4598 2.31 14.4498C2.12 13.6598 2 12.8498 2 11.9998C2 11.1598 2.12 10.3398 2.31 9.55977C2.39 9.54977 2.45 9.54977 2.53 9.52977C3.86 9.08977 5.21 8.75977 6.59 8.50977C6.34 10.8298 6.34 13.1698 6.59 15.4898Z"
                                    fill="white" />
                                <path
                                    d="M21.9999 11.9998C21.9999 12.8498 21.8799 13.6598 21.6899 14.4498C21.6099 14.4598 21.5499 14.4498 21.4699 14.4698C20.1399 14.9098 18.7799 15.2398 17.4099 15.4898C17.6699 13.1698 17.6699 10.8298 17.4099 8.50977C18.7799 8.75977 20.1499 9.07977 21.4699 9.52977C21.5499 9.54977 21.6099 9.55977 21.6899 9.55977C21.8799 10.3498 21.9999 11.1598 21.9999 11.9998Z"
                                    fill="white" />
                                <path
                                    d="M15.49 17.4102C15.24 18.7902 14.92 20.1502 14.47 21.4702C14.45 21.5502 14.45 21.6102 14.44 21.6902C13.66 21.8802 12.84 22.0002 12 22.0002C11.15 22.0002 10.34 21.8802 9.55001 21.6902C9.54001 21.6102 9.55001 21.5502 9.53001 21.4702C9.09001 20.1402 8.76001 18.7902 8.51001 17.4102C9.67001 17.5402 10.83 17.6302 12 17.6302C13.17 17.6302 14.34 17.5402 15.49 17.4102Z"
                                    fill="white" />
                                <path
                                    d="M15.7633 15.7633C13.2622 16.0789 10.7378 16.0789 8.23667 15.7633C7.92111 13.2622 7.92111 10.7378 8.23667 8.23667C10.7378 7.92111 13.2622 7.92111 15.7633 8.23667C16.0789 10.7378 16.0789 13.2622 15.7633 15.7633Z"
                                    fill="white" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8228">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="white" />
                                </clipPath>
                            </defs>
                        </svg>
                        <span class="text-xs">Website</span>
                    </a>

                    <a
                        href="https://snaplark.com/blog"
                        target="_blank"
                        class="flex items-center gap-1.5 transition-colors duration-200 hover:text-blue-200">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="size-3"
                            viewBox="0 0 24 24"
                            fill="none">
                            <g clip-path="url(#clip0_4418_8261)">
                                <path
                                    d="M12.6778 19.957C12.9525 20.0209 12.9777 20.3807 12.7101 20.4699L11.1301 20.9899C7.1601 22.2699 5.0701 21.1999 3.7801 17.2299L2.5001 13.2799C1.2201 9.30992 2.2801 7.20992 6.2501 5.92992L6.77409 5.75639C7.17696 5.62297 7.56902 6.02703 7.45463 6.43571C7.39793 6.63828 7.34338 6.84968 7.2901 7.06992L6.3101 11.2599C5.2101 15.9699 6.8201 18.5699 11.5301 19.6899L12.6778 19.957Z"
                                    fill="white" />
                                <path
                                    d="M17.1699 3.2105L15.4999 2.8205C12.1599 2.0305 10.1699 2.6805 8.99994 5.1005C8.69994 5.7105 8.45994 6.4505 8.25994 7.3005L7.27994 11.4905C6.29994 15.6705 7.58994 17.7305 11.7599 18.7205L13.4399 19.1205C14.0199 19.2605 14.5599 19.3505 15.0599 19.3905C18.1799 19.6905 19.8399 18.2305 20.6799 14.6205L21.6599 10.4405C22.6399 6.2605 21.3599 4.1905 17.1699 3.2105ZM15.2899 13.3305C15.1999 13.6705 14.8999 13.8905 14.5599 13.8905C14.4999 13.8905 14.4399 13.8805 14.3699 13.8705L11.4599 13.1305C11.0599 13.0305 10.8199 12.6205 10.9199 12.2205C11.0199 11.8205 11.4299 11.5805 11.8299 11.6805L14.7399 12.4205C15.1499 12.5205 15.3899 12.9305 15.2899 13.3305ZM18.2199 9.9505C18.1299 10.2905 17.8299 10.5105 17.4899 10.5105C17.4299 10.5105 17.3699 10.5005 17.2999 10.4905L12.4499 9.2605C12.0499 9.1605 11.8099 8.7505 11.9099 8.3505C12.0099 7.9505 12.4199 7.7105 12.8199 7.8105L17.6699 9.0405C18.0799 9.1305 18.3199 9.5405 18.2199 9.9505Z"
                                    fill="white" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8261">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="white" />
                                </clipPath>
                            </defs>
                        </svg>
                        <span class="text-xs">Blog Updates</span>
                    </a>

                    <a
                        href="https://snaplark.com/contact"
                        target="_blank"
                        class="flex items-center gap-1.5 transition-colors duration-200 hover:text-blue-200">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="size-3"
                            viewBox="0 0 24 24"
                            fill="none">
                            <g clip-path="url(#clip0_4418_8833)">
                                <path
                                    d="M11.05 14.95L9.2 16.8C8.81 17.19 8.19 17.19 7.79 16.81C7.68 16.7 7.57 16.6 7.46 16.49C6.43 15.45 5.5 14.36 4.67 13.22C3.85 12.08 3.19 10.94 2.71 9.81C2.24 8.67 2 7.58 2 6.54C2 5.86 2.12 5.21 2.36 4.61C2.6 4 2.98 3.44 3.51 2.94C4.15 2.31 4.85 2 5.59 2C5.87 2 6.15 2.06 6.4 2.18C6.66 2.3 6.89 2.48 7.07 2.74L9.39 6.01C9.57 6.26 9.7 6.49 9.79 6.71C9.88 6.92 9.93 7.13 9.93 7.32C9.93 7.56 9.86 7.8 9.72 8.03C9.59 8.26 9.4 8.5 9.16 8.74L8.4 9.53C8.29 9.64 8.24 9.77 8.24 9.93C8.24 10.01 8.25 10.08 8.27 10.16C8.3 10.24 8.33 10.3 8.35 10.36C8.53 10.69 8.84 11.12 9.28 11.64C9.73 12.16 10.21 12.69 10.73 13.22C10.83 13.32 10.94 13.42 11.04 13.52C11.44 13.91 11.45 14.55 11.05 14.95Z"
                                    fill="white" />
                                <path
                                    d="M21.9701 18.3291C21.9701 18.6091 21.9201 18.8991 21.8201 19.1791C21.7901 19.2591 21.7601 19.3391 21.7201 19.4191C21.5501 19.7791 21.3301 20.1191 21.0401 20.4391C20.5501 20.9791 20.0101 21.3691 19.4001 21.6191C19.3901 21.6191 19.3801 21.6291 19.3701 21.6291C18.7801 21.8691 18.1401 21.9991 17.4501 21.9991C16.4301 21.9991 15.3401 21.7591 14.1901 21.2691C13.0401 20.7791 11.8901 20.1191 10.7501 19.2891C10.3601 18.9991 9.9701 18.7091 9.6001 18.3991L12.8701 15.1291C13.1501 15.3391 13.4001 15.4991 13.6101 15.6091C13.6601 15.6291 13.7201 15.6591 13.7901 15.6891C13.8701 15.7191 13.9501 15.7291 14.0401 15.7291C14.2101 15.7291 14.3401 15.6691 14.4501 15.5591L15.2101 14.8091C15.4601 14.5591 15.7001 14.3691 15.9301 14.2491C16.1601 14.1091 16.3901 14.0391 16.6401 14.0391C16.8301 14.0391 17.0301 14.0791 17.2501 14.1691C17.4701 14.2591 17.7001 14.3891 17.9501 14.5591L21.2601 16.9091C21.5201 17.0891 21.7001 17.2991 21.8101 17.5491C21.9101 17.7991 21.9701 18.0491 21.9701 18.3291Z"
                                    fill="white" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8833">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="white" />
                                </clipPath>
                            </defs>
                        </svg>
                        <span class="text-xs">Contact</span>
                    </a>

                    <a
                        href="https://snaplark.com/help-center"
                        target="_blank"
                        class="flex items-center gap-1.5 transition-colors duration-200 hover:text-blue-200">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="size-3"
                            viewBox="0 0 24 24"
                            fill="none">
                            <g clip-path="url(#clip0_4418_8671)">
                                <path
                                    d="M17 2.42969H7C4 2.42969 2 4.42969 2 7.42969V13.4297C2 16.4297 4 18.4297 7 18.4297V20.5597C7 21.3597 7.89 21.8397 8.55 21.3897L13 18.4297H17C20 18.4297 22 16.4297 22 13.4297V7.42969C22 4.42969 20 2.42969 17 2.42969ZM12 14.5997C11.58 14.5997 11.25 14.2597 11.25 13.8497C11.25 13.4397 11.58 13.0997 12 13.0997C12.42 13.0997 12.75 13.4397 12.75 13.8497C12.75 14.2597 12.42 14.5997 12 14.5997ZM13.26 10.4497C12.87 10.7097 12.75 10.8797 12.75 11.1597V11.3697C12.75 11.7797 12.41 12.1197 12 12.1197C11.59 12.1197 11.25 11.7797 11.25 11.3697V11.1597C11.25 9.99969 12.1 9.42969 12.42 9.20969C12.79 8.95969 12.91 8.78969 12.91 8.52969C12.91 8.02969 12.5 7.61969 12 7.61969C11.5 7.61969 11.09 8.02969 11.09 8.52969C11.09 8.93969 10.75 9.27969 10.34 9.27969C9.93 9.27969 9.59 8.93969 9.59 8.52969C9.59 7.19969 10.67 6.11969 12 6.11969C13.33 6.11969 14.41 7.19969 14.41 8.52969C14.41 9.66969 13.57 10.2397 13.26 10.4497Z"
                                    fill="white" />
                            </g>
                            <defs>
                                <clipPath id="clip0_4418_8671">
                                    <rect
                                        width="24"
                                        height="24"
                                        fill="white" />
                                </clipPath>
                            </defs>
                        </svg>
                        <span class="text-xs">Tutorials</span>
                    </a>
                </div>
            </div>
        </div>
    </GradientFrame>
</template>
