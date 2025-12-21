<script setup>
    import { onMounted } from 'vue'
    import { useStore } from '@/store'
    const store = useStore()

    onMounted(() => {
        // Initialize store synchronization across windows
        store.initializeStoreSync()
    })
</script>

<template>
    <div
        class="select-none"
        :class="{ dark: store.settings.darkMode }">
        <router-view />
    </div>
</template>
