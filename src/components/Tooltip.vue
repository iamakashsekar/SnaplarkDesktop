<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
    text: {
        type: String,
        required: true
    }
})

const wrapperRef = ref(null)
const tooltipRef = ref(null)
const isVisible = ref(false)
const tooltipPosition = ref('bottom')

const handleMouseEnter = () => {
    isVisible.value = true
    checkTooltipPosition()
}

const handleMouseLeave = () => {
    isVisible.value = false
}

const checkTooltipPosition = () => {
    if (!wrapperRef.value) return

    const wrapperRect = wrapperRef.value.getBoundingClientRect()
    const tooltipHeight = 50
    const spaceBelow = window.innerHeight - wrapperRect.bottom
    const spaceAbove = wrapperRect.top

    if (spaceBelow < tooltipHeight && spaceAbove > tooltipHeight) {
        tooltipPosition.value = 'top'
    } else {
        tooltipPosition.value = 'bottom'
    }
}

const tooltipClasses = computed(() => [
    'bg-gray-black pointer-events-none absolute z-10 rounded px-5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100',
    'before:absolute before:border-6 before:border-transparent before:content-[""]',
    {
        'top-full mt-4 before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-b-gray-black':
            tooltipPosition.value === 'bottom',
        'bottom-full mb-4 before:top-full before:left-1/2 before:-translate-x-1/2 before:border-t-gray-black':
            tooltipPosition.value === 'top',
        'left-1/2 -translate-x-1/2': true
    }
])

onMounted(() => {
    window.addEventListener('resize', checkTooltipPosition)
})

onUnmounted(() => {
    window.removeEventListener('resize', checkTooltipPosition)
})
</script>

<template>
    <div
        ref="wrapperRef"
        class="group relative"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave">
        <slot />
        <span v-if="isVisible" ref="tooltipRef" :class="tooltipClasses">
            {{ text }}
        </span>
    </div>
</template>
