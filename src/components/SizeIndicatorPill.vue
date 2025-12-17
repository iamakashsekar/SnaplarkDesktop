<script setup>
    defineProps({
        width: {
            type: Number,
            required: true
        },
        height: {
            type: Number,
            required: true
        }
    })
</script>

<template>
    <div
        class="absolute -top-[30px] left-0 z-50 rounded-full bg-black/60 px-3 py-1 text-xs font-medium whitespace-nowrap text-white shadow-sm backdrop-blur-sm">
        {{ Math.round(width) }} x {{ Math.round(height) }}
    </div>
</template>
