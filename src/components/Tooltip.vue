<script setup>
    import { ref, onMounted, onUnmounted, nextTick } from 'vue'

    const props = defineProps({
        displayId: {
            type: String,
            required: true
        },
        isRecording: {
            type: Boolean,
            required: true
        },
        showToolbar: {
            type: Boolean,
            required: true
        },

        text: {
            type: String,
            required: true
        },
        position: {
            type: String,
            default: 'top', // 'top' or 'bottom'
            validator: (value) => ['top', 'bottom'].includes(value)
        }
    })

    const showTooltip = ref(false)
    const tooltipRef = ref(null)
    let hoverTimeout = null
    let parentElement = null

    const handleParentMouseEnter = async () => {
        // Clear any existing timeout
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }

        // Set timeout for 3 seconds
        hoverTimeout = setTimeout(async () => {
            if (props.isRecording) {
                await window.electronWindows?.resizeWindow?.(
                    `recording-${props.displayId}`,
                    props.showToolbar ? 490 : 255,
                    80
                )
            }
            showTooltip.value = true
        }, 3000)
    }

    const handleParentMouseLeave = async () => {
        // Clear timeout if user leaves before 3 seconds
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        if (props.isRecording) {
            await window.electronWindows?.resizeWindow?.(
                `recording-${props.displayId}`,
                props.showToolbar ? 450 : 215,
                45
            )
        }
        showTooltip.value = false
    }

    onMounted(() => {
        // Find the parent element with 'group' class and attach listeners
        nextTick(() => {
            if (tooltipRef.value) {
                parentElement = tooltipRef.value.closest('.group')
                if (parentElement) {
                    parentElement.addEventListener('mouseenter', handleParentMouseEnter)
                    parentElement.addEventListener('mouseleave', handleParentMouseLeave)

                    // Ensure parent and ancestors have overflow visible
                    let current = parentElement
                    while (current && current !== document.body) {
                        const computedStyle = window.getComputedStyle(current)
                        if (computedStyle.overflow === 'hidden' || computedStyle.overflowY === 'hidden') {
                            current.style.overflow = 'visible'
                            current.style.overflowY = 'visible'
                        }
                        current = current.parentElement
                    }
                }
            }
        })
    })

    onUnmounted(() => {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }
        if (parentElement) {
            parentElement.removeEventListener('mouseenter', handleParentMouseEnter)
            parentElement.removeEventListener('mouseleave', handleParentMouseLeave)
        }
    })
</script>

<template>
    <span
        ref="tooltipRef"
        :class="[
            'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded bg-gray-900 px-5 py-1.5 text-xs whitespace-nowrap text-white transition-opacity',
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            showTooltip ? 'opacity-100' : 'opacity-0'
        ]"
        style="z-index: 9999">
        {{ text }}
        <!-- Arrow pointing down (when tooltip is above element) -->
        <span
            v-if="position === 'top'"
            class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-[6px] border-r-[6px] border-l-[6px] border-t-gray-900 border-r-transparent border-l-transparent"></span>
        <!-- Arrow pointing up (when tooltip is below element) -->
        <span
            v-else
            class="absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-r-[6px] border-b-[6px] border-l-[6px] border-r-transparent border-b-gray-900 border-l-transparent"></span>
    </span>
</template>
