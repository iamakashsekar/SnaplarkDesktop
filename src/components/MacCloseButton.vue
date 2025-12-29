<script setup>
    import { useStore } from '@/store'
    import { computed } from 'vue'

    const props = defineProps({
        positionClasses: {
            type: String,
            default: null
        }
    })

    const store = useStore()
    const isMacOS = store.getOs() === 'darwin'

    const computedPositionClasses = computed(() => {
        if (props.positionClasses) {
            return props.positionClasses
        }
        return isMacOS ? 'absolute top-5 left-4' : 'absolute top-5 right-4'
    })

    defineEmits(['click'])
</script>

<template>
    <button
        type="button"
        @click="$emit('click')"
        :class="[
            'no-drag group flex items-center justify-center rounded-full p-1 transition-all duration-300 ease-out hover:scale-105 active:scale-95',
            'bg-red-500 text-red-500 backdrop-blur-sm hover:bg-red-500 hover:text-white hover:shadow-lg',
            'dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-red-500 dark:hover:text-white',
            computedPositionClasses
        ]">
        <svg
            class="size-2 transition-transform duration-300 ease-out group-hover:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            stroke-width="2.5">
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"></path>
        </svg>
    </button>
</template>
