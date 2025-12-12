<script setup>
    import { onMounted, ref } from 'vue'

    const selection = ref({
        left: 0,
        top: 0,
        width: 0,
        height: 0
    })

    onMounted(async () => {
        // Get parameters from URL
        const params = new URLSearchParams(window.location.search)

        // Parse selection coordinates
        // We expect these to be passed as query parameters
        const x = parseInt(params.get('selX') || '0', 10)
        const y = parseInt(params.get('selY') || '0', 10)
        const w = parseInt(params.get('selW') || '0', 10)
        const h = parseInt(params.get('selH') || '0', 10)

        selection.value = {
            left: x,
            top: y,
            width: w,
            height: h
        }

        // Set ignore mouse events to ensure click-through
        // We do this immediately on mount
        if (window.electronWindows?.setIgnoreMouseEvents) {
            await window.electronWindows.setIgnoreMouseEvents(true)
        }
    })
</script>

<template>
    <div class="pointer-events-none fixed top-0 left-0 h-screen w-screen overflow-hidden bg-transparent">
        <div
            class="pointer-events-none absolute z-[9999] box-border border-2 border-red-500"
            :style="{
                left: `${selection.left - 2}px`,
                top: `${selection.top - 2}px`,
                width: `${selection.width + 4}px`,
                height: `${selection.height + 4}px`
            }"></div>
    </div>
</template>
