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
        },
        validationState: {
            type: String,
            default: 'idle', // idle, validating, success, error, conflict
            validator: (value) => ['idle', 'validating', 'success', 'error', 'conflict'].includes(value)
        },
        errorMessage: {
            type: String,
            default: ''
        }
    })

    const emit = defineEmits(['update:modelValue', 'validation-result', 'shortcut-changed'])

    const isRecording = ref(false)
    const previousValue = ref('')
    const isMac = window.electron?.platform === 'darwin'
    const isValidating = ref(false)
    const localValidationState = ref('idle')
    const localErrorMessage = ref('')
    const recordedKeys = ref(new Set())

    // Computed state based on props or local state
    const currentState = computed(() => {
        return props.validationState !== 'idle' ? props.validationState : localValidationState.value
    })

    const currentError = computed(() => {
        return props.errorMessage || localErrorMessage.value
    })

    const inputClasses = computed(() => {
        const base = 'dark:bg-dark-900 w-44 rounded-lg border-2 px-3 py-2 text-center text-sm font-medium transition-all focus:ring-2 focus:outline-none'
        
        if (isRecording.value) {
            return `${base} border-blue-500 text-blue-600 placeholder-blue-400 focus:ring-blue-500/20 dark:text-blue-400 animate-pulse`
        }
        
        switch (currentState.value) {
            case 'success':
                return `${base} border-green-500 text-green-700 focus:border-green-500 focus:ring-green-500/20 dark:border-green-600 dark:text-green-400`
            case 'error':
                return `${base} border-red-500 text-red-700 focus:border-red-500 focus:ring-red-500/20 dark:border-red-600 dark:text-red-400`
            case 'validating':
                return `${base} border-blue-400 text-blue-600 dark:border-blue-500 dark:text-blue-400`
            default:
                return `${base} dark:border-dark-700 border-slate-200 text-slate-700 focus:border-blue-500 focus:ring-blue-500/20 dark:text-gray-300`
        }
    })

    const startRecording = () => {
        previousValue.value = props.modelValue
        isRecording.value = true
        localValidationState.value = 'idle'
        localErrorMessage.value = ''
        recordedKeys.value.clear()
    }

    const stopRecording = () => {
        if (isRecording.value) {
            isRecording.value = false
            recordedKeys.value.clear()
        }
    }

    const validateAndUpdate = async (hotkeyString) => {
        if (!props.storeKey || !window.electron?.invoke) {
            emit('update:modelValue', hotkeyString)
            return
        }

        localValidationState.value = 'validating'
        isValidating.value = true

        try {
            const validation = await window.electron.invoke('validate-shortcut', props.storeKey, hotkeyString)

            if (!validation.valid) {
                localValidationState.value = 'error'
                
                if (validation.duplicate) {
                    localErrorMessage.value = `Already assigned to "${validation.duplicate.description}"`
                } else if (validation.error) {
                    if (validation.error.includes('not found') || validation.error.includes('Shortcut not found')) {
                        localErrorMessage.value = 'This shortcut combination is not supported'
                    } else {
                        localErrorMessage.value = validation.error
                    }
                } else {
                    localErrorMessage.value = 'Invalid shortcut combination'
                }

                emit('update:modelValue', previousValue.value)

                setTimeout(() => {
                    localValidationState.value = 'idle'
                    localErrorMessage.value = ''
                }, 6000)

                return
            }

            const result = await window.electron.invoke('update-shortcut', props.storeKey, hotkeyString)

            if (result && result.success) {
                localValidationState.value = 'success'
                localErrorMessage.value = ''
                emit('update:modelValue', hotkeyString)

                setTimeout(() => {
                    localValidationState.value = 'idle'
                }, 2000)
            } else {
                localValidationState.value = 'error'
                
                if (result?.error?.includes('another application') || result?.error?.includes('already in use')) {
                    localErrorMessage.value = 'This shortcut is being used by another application. Please choose a different one.'
                } else if (result?.error) {
                    localErrorMessage.value = result.error
                } else {
                    localErrorMessage.value = 'Failed to register shortcut. It may be in use by your system or another application.'
                }
                
                emit('update:modelValue', previousValue.value)

                setTimeout(() => {
                    localValidationState.value = 'idle'
                    localErrorMessage.value = ''
                }, 6000)
            }
        } catch (error) {
            console.error('Error validating/updating shortcut:', error)
            localValidationState.value = 'error'
            localErrorMessage.value = 'Unable to register this shortcut. Please try a different combination.'
            
            emit('update:modelValue', previousValue.value)

            setTimeout(() => {
                localValidationState.value = 'idle'
                localErrorMessage.value = ''
            }, 6000)
        } finally {
            isValidating.value = false
        }
    }

    const handleKeyDown = (event) => {
        event.preventDefault()

        // Handle Escape key to cancel recording
        if (event.key === 'Escape') {
            isRecording.value = false
            emit('update:modelValue', previousValue.value)
            recordedKeys.value.clear()
            return
        }

        // Track all keys being pressed
        if (event.ctrlKey) recordedKeys.value.add('Ctrl')
        if (event.metaKey) recordedKeys.value.add('Cmd')
        if (event.altKey) recordedKeys.value.add(isMac ? 'Option' : 'Alt')
        if (event.shiftKey) recordedKeys.value.add('Shift')

        // Add the actual key (not modifiers)
        if (!['Control', 'Alt', 'Shift', 'Meta', 'Tab'].includes(event.key)) {
            const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
            recordedKeys.value.add(key)
        }
    }

    const handleKeyUp = async (event) => {
        event.preventDefault()

        // Don't do anything if we haven't recorded enough keys
        if (recordedKeys.value.size < 2) {
            recordedKeys.value.clear()
            return
        }

        // Build the hotkey string from recorded keys
        const keys = []
        const keyArray = Array.from(recordedKeys.value)

        // Add modifiers in consistent order
        if (keyArray.includes('Ctrl')) keys.push('Ctrl')
        if (keyArray.includes('Cmd')) keys.push('Cmd')
        if (keyArray.includes('Option')) keys.push('Option')
        if (keyArray.includes('Alt')) keys.push('Alt')
        if (keyArray.includes('Shift')) keys.push('Shift')

        // Add the non-modifier key
        const nonModifierKey = keyArray.find(
            (k) => !['Ctrl', 'Cmd', 'Option', 'Alt', 'Shift'].includes(k)
        )
        if (nonModifierKey) {
            keys.push(nonModifierKey)
        }

        // Only proceed if we have at least one modifier and a key
        if (keys.length >= 2) {
            const hotkeyString = keys.join(' + ')
            isRecording.value = false
            recordedKeys.value.clear()
            await validateAndUpdate(hotkeyString)
        } else {
            recordedKeys.value.clear()
        }
    }
</script>

<template>
    <div class="dark:border-dark-700/50 border-slate-200/50 py-3">
        <div class="flex items-start justify-between">
            <div class="flex-1">
                <h3 class="text-sm font-medium dark:text-gray-100">{{ title }}</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-gray-300">{{ description }}</p>
            </div>

            <div class="ml-4">
                <div class="flex flex-col items-end space-y-2">
                    <!-- Input Field -->
                    <input
                        type="text"
                        :value="isRecording ? '' : modelValue"
                        :placeholder="isRecording ? 'Press keys...' : 'Click to set'"
                        @focus="startRecording"
                        @blur="stopRecording"
                        @keydown="handleKeyDown"
                        @keyup="handleKeyUp"
                        :disabled="isValidating"
                        :class="inputClasses"
                        readonly />

                    <!-- Error message -->
                    <transition
                        enter-active-class="transition-all duration-200 ease-out"
                        enter-from-class="opacity-0 -translate-y-1"
                        enter-to-class="opacity-100 translate-y-0"
                        leave-active-class="transition-all duration-150 ease-in"
                        leave-from-class="opacity-100 translate-y-0"
                        leave-to-class="opacity-0 -translate-y-1">
                        <div
                            v-if="currentError && currentState === 'error'"
                            class="w-44 text-right">
                            <p class="text-xs font-medium text-red-600 dark:text-red-400">
                                {{ currentError }}
                            </p>
                        </div>
                    </transition>

                    <!-- Success message -->
                    <transition
                        enter-active-class="transition-all duration-200 ease-out"
                        enter-from-class="opacity-0 -translate-y-1"
                        enter-to-class="opacity-100 translate-y-0"
                        leave-active-class="transition-all duration-150 ease-in"
                        leave-from-class="opacity-100 translate-y-0"
                        leave-to-class="opacity-0 -translate-y-1">
                        <div
                            v-if="currentState === 'success'"
                            class="w-44 text-right">
                            <p class="text-xs font-medium text-green-600 dark:text-green-400">
                                Shortcut updated successfully
                            </p>
                        </div>
                    </transition>
                </div>
            </div>
        </div>
    </div>
</template>
