<script setup>
    import { ref } from 'vue'

    const emit = defineEmits(['change'])

    const props = defineProps({
        selected: String
    })

    // Hardcoded color set
    const colors = ['#2178FF', '#ff0000', '#00ff00', '#ffa500', '#000000', '#ffffff']

    function selectColor(color) {
        emit('change', color)
    }
</script>

<template>
    <div class="absolute top-full right-0 mt-2.5 flex gap-1.5 rounded-md bg-slate-50 p-2">
        <button
            v-for="color in colors"
            :key="color"
            @click="selectColor(color)"
            class="h-6 w-6 rounded-full border border-gray-500 transition hover:scale-105"
            :style="{ backgroundColor: color }"></button>
    </div>
</template>
