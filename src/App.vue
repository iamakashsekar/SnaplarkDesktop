<script setup>
    import { onMounted, watch } from 'vue'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useStore } from '@/store'
    import { setLanguage } from '@/i18n'

    const store = useStore()
    const route = useRoute()
    const { t } = useI18n()

    const syncDocumentTitle = () => {
        const titleKey = route.meta?.titleKey
        if (titleKey) {
            document.title = t(titleKey)
        }
    }

    onMounted(() => {
        // Initialize store synchronization across windows
        store.initializeStoreSync()
    })

    watch(
        () => store.settings.language,
        (language) => {
            const resolvedLanguage = setLanguage(language)
            if (language !== resolvedLanguage) {
                store.updateSetting('language', resolvedLanguage)
                return
            }
            syncDocumentTitle()
        },
        { immediate: true }
    )

    watch(
        () => route.meta?.titleKey,
        () => {
            syncDocumentTitle()
        },
        { immediate: true }
    )
</script>

<template>
    <div
        class="select-none"
        :class="{ dark: store.settings.darkMode }">
        <router-view />
    </div>
</template>
