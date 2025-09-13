<script setup>
    import { onMounted } from 'vue'
    import { useStore } from '@/store'
    const store = useStore()

    onMounted(() => {
        // Initialize store synchronization across windows
        store.initializeStoreSync()

        // Quick test for auto-sync (remove this in production)
        console.log('Auto-sync initialized. Current lastCapture:', store.lastCapture)
    })
</script>

<template>
    <div :class="{ dark: store.isDarkMode }">
        <router-view />
    </div>
</template>
