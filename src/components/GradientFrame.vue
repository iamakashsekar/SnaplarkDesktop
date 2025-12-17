<script setup>
    import { useStore } from '../store'
    import CloseButton from './CloseButton.vue'

    const store = useStore()

    const props = defineProps({
        closeAction: {
            type: String,
            default: 'quit',
            validator: (value) => ['quit', 'close'].includes(value)
        },
        closeButtonClass: {
            type: String,
            default: undefined
        }
    })

    const handleClose = async () => {
        if (props.closeAction === 'quit') {
            window.electron?.quitApp()
        } else if (props.closeAction === 'close') {
            if (window.electronWindows) {
                const type = await window.electronWindows.getWindowType()
                if (type) {
                    await window.electronWindows.closeWindow(type)
                } else {
                    window.close()
                }
            } else {
                window.close()
            }
        }
    }
</script>

<template>
    <div
        :class="{ 'shadow-md': store.getOs() !== 'darwin' }"
        class="relative rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2 select-none">
        <slot />
        <CloseButton
            @click="handleClose"
            :position-classes="closeButtonClass" />
    </div>
</template>
