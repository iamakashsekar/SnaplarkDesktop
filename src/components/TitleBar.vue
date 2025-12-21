<script setup>
    defineProps({
        title: {
            type: String,
            required: true
        }
    })
</script>

<template>
    <div
        class="drag flex h-12 w-full shrink-0 items-center justify-center bg-transparent px-20 text-center"
        data-component="TitleBar">
        <span class="text-sm font-semibold text-slate-600/90 dark:text-gray-400">{{ title }}</span>
    </div>
</template>

<style scoped>
    .drag {
        -webkit-app-region: drag;
        /* Ensure specific user interactions are still allowed if we had buttons, but here it's just text */
    }
</style>
