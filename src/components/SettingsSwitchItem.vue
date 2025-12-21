<script setup>
    import Switch from './Switch.vue'

    defineProps({
        modelValue: {
            type: Boolean,
            required: true
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            default: ''
        }
    })

    defineEmits(['update:modelValue'])
</script>

<template>
    <div class="dark:border-dark-700 dark:bg-dark-800 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
        <div class="flex items-center justify-between">
            <div>
                <h3 class="text-sm font-medium dark:text-gray-100">{{ title }}</h3>
                <p
                    v-if="description"
                    class="mt-1 text-sm text-slate-500 dark:text-gray-300">
                    {{ description }}
                </p>
            </div>
            <Switch
                :model-value="modelValue"
                @update:model-value="$emit('update:modelValue', $event)" />
        </div>
    </div>
</template>
