<script setup>
    import { useStore } from '../store'

    const store = useStore()
</script>

<template>
    <div
        :class="{ 'shadow-md': store.getOs() !== 'darwin' }"
        class="relative rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2 select-none">
        <slot />
    </div>
</template>
