<script setup>
    import { ref, computed } from 'vue'

    const props = defineProps({
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        modelValue: {
            type: String,
            default: ''
        },
        storeKey: {
            type: String,
            default: ''
        }
    })

    const emit = defineEmits(['update:modelValue'])

    const isRecording = ref(false)
    const previousValue = ref('')
    const isMac = window.electron?.platform === 'darwin'

    const startRecording = () => {
        previousValue.value = props.modelValue
        isRecording.value = true
    }

    const stopRecording = () => {
        if (isRecording.value) {
            isRecording.value = false
        }
    }

    const recordHotkey = (event) => {
        event.preventDefault()

        // Handle Escape key to cancel recording
        if (event.key === 'Escape') {
            isRecording.value = false
            return
        }

        const keys = []

        // Record the actual modifiers the user pressed, not platform-specific ones
        // This allows users to choose Ctrl on Mac or Cmd on Windows if they want
        if (event.ctrlKey) keys.push('Ctrl')
        if (event.metaKey) keys.push('Cmd')
        if (event.altKey) keys.push(isMac ? 'Option' : 'Alt')
        if (event.shiftKey) keys.push('Shift')

        const key = event.key.length === 1 ? event.key.toUpperCase() : event.key

        // Skip modifier keys themselves
        if (!['Control', 'Alt', 'Shift', 'Meta', 'Tab', 'Escape'].includes(event.key)) {
            keys.push(key)
        }

        // Only set if we have at least one modifier and a key, or if it's a valid single key combo
        if (keys.length > 0) {
            const hotkeyString = keys.join(' + ')
            emit('update:modelValue', hotkeyString)

            // Update the shortcut in the main process if storeKey is provided
            if (props.storeKey && window.electron?.invoke) {
                window.electron.invoke('update-shortcut', props.storeKey, hotkeyString)
            }

            isRecording.value = false
        }
    }
</script>

<template>
    <div class="dark:border-dark-700/50 flex items-center justify-between border-slate-200/50 py-3">
        <div>
            <h3 class="text-sm font-medium dark:text-gray-100">{{ title }}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">{{ description }}</p>
        </div>
        <input
            type="text"
            :value="isRecording ? '' : modelValue"
            :placeholder="isRecording ? 'Recording...' : 'Click to set'"
            @focus="startRecording"
            @blur="stopRecording"
            @keydown.prevent="recordHotkey"
            :class="[
                'dark:bg-dark-900 w-40 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors focus:ring-2 focus:outline-none',
                isRecording
                    ? 'border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20 dark:text-blue-400'
                    : 'dark:border-dark-700 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20 dark:text-gray-300'
            ]"
            readonly />
    </div>
</template>
