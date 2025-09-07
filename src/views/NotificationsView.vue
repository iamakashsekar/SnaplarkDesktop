<script setup>
    import { onMounted, ref, watch, nextTick } from 'vue'
    import UploadNotification from '../components/UploadNotification.vue'

    let idCounter = 1

    const notifications = ref([])
    const wrap = ref(null)

    const recalc = () => {
        requestAnimationFrame(() => {
            const height = wrap.value?.scrollHeight || 0
            window.electronNotifications?.resize(height + 20)
        })
    }

    const addOrMerge = (n) => {
        notifications.value.unshift({
            id: n.id || `n_${idCounter++}`,
            variant: n.variant || 'info',
            timeoutMs: n.timeoutMs ?? 5000,
            fileInfo: n.fileInfo ?? {},
            _paused: n.variant === 'upload',
            _remaining: n.timeoutMs ?? 5000,
            _start: Date.now()
        })

        nextTick(() => {
            recalc()
        })
    }

    const dismiss = (id) => {
        notifications.value = notifications.value.filter((n) => n.id !== id)
        nextTick(() => {
            recalc()
        })

        if (notifications.length === 0) {
        }
    }

    const pause = (id) => {
        const n = notifications.value.find((n) => n.id === id)
        if (!n || n._paused) return
        n._paused = true
        n._remaining -= Date.now() - n._start
    }

    const resume = (id) => {
        const n = notifications.value.find((n) => n.id === id)
        if (!n || !n._paused) return
        n._paused = false
        n._start = Date.now()
    }

    const tick = () => {
        const now = Date.now()
        const toClose = []
        notifications.value.forEach((n) => {
            if (n.timeoutMs && !n._paused) {
                const elapsed = now - n._start
                if (elapsed >= n._remaining) toClose.push(n.id)
            }
        })
        if (toClose.length) {
            notifications.value = notifications.value.filter((n) => !toClose.includes(n.id))
            nextTick(() => {
                recalc()
            })
        }
        requestAnimationFrame(tick)
    }

    const snooze = (id) => {
        const n = notifications.value.find((n) => n.id === id)
        if (!n) return
        n._paused = false
        n._start = Date.now()
        n._remaining = n.timeoutMs || 5000
    }

    // Watch for empty notifications array and close window
    watch(
        notifications,
        (newNotifications) => {
            if (newNotifications.length === 0) {
                console.log('there is no window')
                setTimeout(() => {
                    window.electronNotifications?.close()
                }, 200)
            }
        },
        { deep: true, immediate: false }
    )

    window.electronNotifications?.onAdd((payload) => {
        addOrMerge(payload)
    })
    window.addEventListener('resize', () => recalc())
    window.electronNotifications?.reposition()

    // Initial setup
    nextTick(() => {
        recalc()
    })
    requestAnimationFrame(tick)
</script>

<template>
    <div
        class="p-2.5"
        ref="wrap">
        <transition-group
            tag="div"
            class="flex flex-col gap-3"
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1.5"
            leave-to-class="opacity-0 -translate-y-1.5">
            <div
                v-for="n in notifications"
                :key="n.id"
                class="size-full rounded-2xl bg-linear-to-r from-blue-500 to-cyan-500 pt-2">
                <div class="rounded-2xl bg-white p-5">
                    <UploadNotification
                        v-if="n.variant === 'upload'"
                        @close="dismiss(n.id)"
                        :fileInfo="n.fileInfo" />
                </div>
            </div>
        </transition-group>
    </div>
</template>
