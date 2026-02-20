<script setup>
import { ref, onMounted } from 'vue'
import GradientFrame from '../components/GradientFrame.vue'
import CloseButton from '../components/CloseButton.vue'

const updateInfo = ref(null)

onMounted(async () => {
    const info = await window.electronUpdate?.getUpdateInfo()
    if (info) {
        updateInfo.value = info
    }
})

const installUpdate = () => {
    window.electronUpdate?.installUpdate()
}

const dismiss = () => {
    window.electronUpdate?.dismissUpdate()
}

</script>

<template>
    <GradientFrame>
        <div class="drag relative rounded-xl bg-white p-4 dark:bg-gray-900">
            <CloseButton position-classes="no-drag absolute top-2.5 right-2.5" @click="dismiss" />

            <div class="flex flex-col items-center text-center">
                <img src="@/assets/icons/icon.png" alt="Snaplark" class="mb-2 size-10" />

                <h1 class="text-sm font-semibold text-gray-900 dark:text-white">
                    Update Available
                </h1>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    A new version of Snaplark is ready to install.
                </p>

                <div v-if="updateInfo" class="mt-3 w-full rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                    <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {{ updateInfo.releaseName || 'New Version' }}
                    </span>
                </div>

                <div class="no-drag mt-3 flex w-full gap-2">
                    <button @click="dismiss"
                        class="flex-1 cursor-pointer rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                        Later
                    </button>
                    <button @click="installUpdate"
                        class="flex-1 cursor-pointer rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600">
                        Update Now
                    </button>
                </div>
            </div>
        </div>
    </GradientFrame>
</template>
