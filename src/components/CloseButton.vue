<script setup>
    defineProps({
        positionClasses: {
            type: String,
            default: 'absolute top-4 right-4'
        }
    })

    defineEmits(['click'])
</script>

<template>
    <button
        type="button"
        @click="$emit('click')"
        :class="[
            'no-drag group flex items-center justify-center rounded-full p-1 transition-all duration-300 ease-out hover:scale-105 active:scale-95',
            'bg-gray-200/50 text-gray-500 backdrop-blur-sm hover:bg-red-500 hover:text-white hover:shadow-lg',
            'dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-red-500 dark:hover:text-white',
            positionClasses
        ]">
        <svg
            class="size-4 transition-transform duration-300 ease-out group-hover:rotate-90"
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
