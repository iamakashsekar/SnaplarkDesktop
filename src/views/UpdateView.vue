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

const formatDate = (dateStr) => {
    if (!dateStr) return ''
    try {
        return new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    } catch {
        return dateStr
    }
}
</script>

<template>
    <GradientFrame>
        <div class="drag relative rounded-xl bg-white p-6 dark:bg-gray-900">
            <CloseButton position-classes="no-drag absolute top-3 right-3" @click="dismiss" />

            <div class="flex flex-col items-center text-center">
                <img src="@/assets/icons/icon.png" alt="Snaplark" class="mb-3 size-14" />

                <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
                    Update Available
                </h1>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    A new version of Snaplark is ready to install.
                </p>

                <div v-if="updateInfo" class="mt-4 w-full rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ updateInfo.releaseName || 'New Version' }}
                        </span>
                        <span v-if="updateInfo.releaseDate" class="text-xs text-gray-700 dark:text-gray-300">
                            {{ formatDate(updateInfo.releaseDate) }}
                        </span>
                    </div>
                </div>

                <div class="no-drag mt-5 flex w-full gap-3">
                    <button @click="dismiss"
                        class="flex-1 cursor-pointer rounded-2xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                        Later
                    </button>
                    <button @click="installUpdate"
                        class="flex-1 cursor-pointer rounded-2xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600">
                        Update Now
                    </button>
                </div>
            </div>
        </div>
    </GradientFrame>
</template>
