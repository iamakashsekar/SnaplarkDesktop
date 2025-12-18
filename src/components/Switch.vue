<script setup>
    defineProps({
        modelValue: {
            type: Boolean,
            required: true
        },
        size: {
            type: String,
            default: 'md',
            validator: (value) => ['sm', 'md'].includes(value)
        }
    })

    defineEmits(['update:modelValue'])
</script>

<template>
    <label
        class="relative inline-flex cursor-pointer items-center"
        :class="[size === 'sm' ? 'h-6 w-12' : 'h-7 w-14']">
        <input
            type="checkbox"
            :checked="modelValue"
            @change="$emit('update:modelValue', $event.target.checked)"
            class="peer sr-only" />
        <span
            class="dark:bg-dark-700 absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-cyan-400"></span>
        <span
            class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition"
            :class="[size === 'sm' ? 'peer-checked:translate-x-6' : 'peer-checked:translate-x-7']"></span>
    </label>
</template>
