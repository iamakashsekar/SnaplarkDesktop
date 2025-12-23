<script setup>
    import { onMounted, ref } from 'vue'
    import { useWindows } from '../composables/useWindows'
    import { useStore } from '../store'
    import GradientFrame from '../components/GradientFrame.vue'
    import CloseButton from '../components/CloseButton.vue'

    const store = useStore()

    const { closeWindow, centerWindow, resizeWindowTo } = useWindows()

    onMounted(async () => {
        await resizeWindowTo('welcome', 450, 455)
        await centerWindow('welcome')
    })

    const showTour = ref(false)

    const currentStep = ref(0)

    const steps = ref([
        {
            id: 1,
            title: 'Click on widget',
            image: store.getOs() === 'darwin' ? '1-step-mac.png' : '1-step-win.png'
        },
        {
            id: 2,
            title: 'Click and drag to make a crop and select from any options',
            image: '2-step.png'
        },
        {
            id: 3,
            title: 'Right click widget for all the menu options',
            image: store.getOs() === 'darwin' ? '3-step-mac.png' : '3-step-win.png'
        }
    ])

    const startTour = async () => {
        showTour.value = true
        await centerWindow('welcome')
        await resizeWindowTo('welcome', 420, 455)
    }

    const finishSetup = () => {
        try {
            store.welcomeCompleted = true
            window.electron.showMainAtTray({ force: true, gap: 0 })
        } catch (error) {
            console.error('Error saving welcome completion status:', error)
        }
        closeWindow('welcome')
    }

    const nextStep = async () => {
        if (currentStep.value < steps.value.length - 1) {
            currentStep.value = currentStep.value + 1
            if (currentStep.value === 2) {
                await resizeWindowTo('welcome', 420, 1000)
            }
        } else {
            finishSetup()
        }
    }

    const goToStep = async (index) => {
        if (currentStep.value === index) return
        currentStep.value = index
        if (currentStep.value === 2) {
            await resizeWindowTo('welcome', 420, 1000)
        }
    }

    const getImageUrl = (name) => {
        return new URL(`../assets/images/${name}`, import.meta.url).href
    }
</script>

<template>
    <div
        :class="{ 'shadow-md': store.getOs() !== 'darwin' }"
        class="welcome-window">
        <transition
            name="slide-fade"
            mode="out-in">
            <GradientFrame v-if="!showTour">
                <div
                    key="welcome"
                    class="welcome-screen dark:bg-dark-blue drag relative flex size-[450px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-white">
                    <!-- Background shapes -->
                    <img
                        src="@/assets/images/welcome-shape.png"
                        alt="Welcome to Snaplark"
                        class="absolute top-0 left-0 z-0 h-full w-full" />

                    <img
                        src="@/assets/images/welcome-shape-2.png"
                        alt="Welcome to Snaplark"
                        class="absolute top-0 left-0 z-0 h-full w-full" />

                    <!-- Content -->
                    <div class="z-10 flex flex-col items-center">
                        <div>
                            <img
                                class="w-80"
                                src="@/assets/images/welcome-logo.png"
                                alt="Welcome to Snaplark" />
                            <p class="text-center dark:text-white">screen capture software</p>
                        </div>

                        <svg
                            class="mt-8"
                            width="160"
                            height="104"
                            viewBox="0 0 190 104"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M20.1592 88.5575V20.1592H95.252V103.82H35.4213C26.9923 103.82 20.1592 96.9865 20.1592 88.5575Z"
                                fill="url(#paint0_linear_13_17683)" />
                            <path
                                d="M94.748 103.82V20.1592H170.345V88.5575C170.345 96.9866 163.512 103.82 155.083 103.82H94.748Z"
                                fill="url(#paint1_linear_13_17683)" />
                            <path
                                d="M74.1247 0H2.65766C1.67692 0 1.18576 1.18576 1.87925 1.87925L20.1592 20.1592H94.244L74.9129 0.332344C74.7057 0.11984 74.4215 0 74.1247 0Z"
                                fill="url(#paint2_linear_13_17683)" />
                            <path
                                d="M115.859 0H187.389C188.363 0 188.857 1.17193 188.177 1.86934L170.345 20.1592H94.748L115.09 0.312879C115.296 0.112282 115.572 0 115.859 0Z"
                                fill="url(#paint3_linear_13_17683)" />
                            <defs>
                                <linearGradient
                                    id="paint0_linear_13_17683"
                                    x1="37.2945"
                                    y1="22.6791"
                                    x2="88.7003"
                                    y2="106.844"
                                    gradientUnits="userSpaceOnUse">
                                    <stop stop-color="#2178FF" />
                                    <stop
                                        offset="1"
                                        stop-color="#5698FF" />
                                </linearGradient>
                                <linearGradient
                                    id="paint1_linear_13_17683"
                                    x1="92.2282"
                                    y1="32.2547"
                                    x2="166.817"
                                    y2="101.804"
                                    gradientUnits="userSpaceOnUse">
                                    <stop stop-color="#4A91FC" />
                                    <stop
                                        offset="1"
                                        stop-color="#3C87FB" />
                                </linearGradient>
                                <linearGradient
                                    id="paint2_linear_13_17683"
                                    x1="-2.51989"
                                    y1="7.44628e-07"
                                    x2="100.796"
                                    y2="24.695"
                                    gradientUnits="userSpaceOnUse">
                                    <stop stop-color="#2178FF" />
                                    <stop
                                        offset="1"
                                        stop-color="#68A3FF" />
                                </linearGradient>
                                <linearGradient
                                    id="paint3_linear_13_17683"
                                    x1="132.546"
                                    y1="29.2308"
                                    x2="178.408"
                                    y2="-3.41525e-06"
                                    gradientUnits="userSpaceOnUse">
                                    <stop stop-color="#2179FF" />
                                    <stop
                                        offset="1"
                                        stop-color="#3485FF" />
                                </linearGradient>
                            </defs>
                        </svg>

                        <button
                            @click="startTour"
                            class="no-drag mt-10 cursor-pointer rounded-full bg-blue-500 px-6 py-3 font-medium text-white shadow-lg shadow-blue-500/30 transition-all duration-300 ease-in-out hover:bg-blue-600 focus:outline-none">
                            Let's get started
                        </button>
                    </div>
                </div>

                <CloseButton @click="finishSetup"/>
            </GradientFrame>

            <div
                v-else
                key="tour"
                class="tour-screen flex flex-col items-center justify-center gap-4">
                <GradientFrame>
                    <div class="drag dark:bg-dark-blue relative w-[420px] rounded-2xl bg-white px-5 py-6">
                        <div
                            class="bg-primary-blue absolute top-4 left-0 rounded-tr-2xl rounded-br-2xl py-3.5 pr-6 pl-8 text-white">
                            <span class="text-lg font-bold">{{ steps[currentStep].id }}</span>
                        </div>
                        <transition
                            name="slide-fade"
                            mode="out-in">
                            <div :key="currentStep">
                                <h1 class="mt-2 ml-14 text-base font-medium text-gray-900 dark:text-gray-100">
                                    {{ steps[currentStep].title }}
                                </h1>
                                <img
                                    :src="getImageUrl(steps[currentStep].image)"
                                    alt="Welcome to Snaplark"
                                    class="mx-auto mt-6 h-auto w-[400px]" />
                            </div>
                        </transition>

                        <div class="mt-4 flex items-center justify-between">
                            <button
                                @click="finishSetup"
                                class="no-drag w-full cursor-pointer rounded-full py-2 text-lg font-medium text-gray-500 transition-all duration-300 ease-in-out hover:text-gray-700 dark:text-gray-100 dark:hover:text-white">
                                Skip Tour
                            </button>

                            <button
                                @click="nextStep"
                                class="no-drag w-full cursor-pointer rounded-full bg-blue-500 py-2 text-lg font-medium text-white shadow-lg shadow-blue-500/30 transition-all duration-300 ease-in-out hover:bg-blue-600 focus:outline-none">
                                {{ currentStep === steps.length - 1 ? 'Finish' : 'Next' }}
                            </button>
                        </div>
                    </div>
                </GradientFrame>

                <div class="flex items-center justify-center gap-2">
                    <button
                        v-for="(step, index) in steps"
                        :key="index"
                        @click="goToStep(index)"
                        :class="[
                            'h-2.5 w-10 cursor-pointer rounded-full focus:outline-none',
                            currentStep === index ? 'bg-blue-500' : 'bg-gray-200/60 dark:bg-gray-600'
                        ]"></button>
                </div>
            </div>
        </transition>
    </div>
</template>

<style scoped>
    .slide-fade-enter-active {
        transition: all 0.3s ease-out;
    }

    .slide-fade-leave-active {
        transition: all 0.3s cubic-bezier(1, 0.5, 0.8, 1);
    }

    .slide-fade-enter-from,
    .slide-fade-leave-to {
        transform: translateX(20px);
        opacity: 0;
    }
</style>
