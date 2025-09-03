<template>
    <div
        class="noti-wrap"
        ref="wrap">
        <transition-group
            name="stack"
            tag="div"
            class="stack">
            <div
                v-for="n in notifications"
                :key="n.id"
                class="card"
                :class="n.variant || 'info'"
                @mouseenter="pause(n.id)"
                @mouseleave="resume(n.id)">
                <div class="title">
                    <span>{{ n.title }}</span>
                    <div class="actions">
                        <button
                            class="icon"
                            @click="snooze(n.id)"
                            title="Snooze">
                            —
                        </button>
                        <button
                            class="icon"
                            @click="dismiss(n.id)"
                            title="Dismiss">
                            ×
                        </button>
                    </div>
                </div>

                <div
                    v-if="n.progress != null"
                    class="progress">
                    <div
                        class="bar"
                        :style="{ width: n.progress + '%' }"></div>
                </div>

                <div
                    v-if="n.message"
                    class="message">
                    {{ n.message }}
                </div>

                <div
                    v-if="n.actions?.length"
                    class="buttons">
                    <button
                        v-for="a in n.actions"
                        :key="a.label"
                        class="btn"
                        @click="action(n, a)">
                        {{ a.label }}
                    </button>
                </div>
            </div>
        </transition-group>
    </div>
</template>

<script>
    import { onMounted, ref } from 'vue'

    let idCounter = 1

    export default {
        name: 'NotificationsView',
        setup() {
            const notifications = ref([])
            const wrap = ref(null)

            const recalc = () => {
                requestAnimationFrame(() => {
                    const height = wrap.value?.scrollHeight || 0
                    window.electronNotifications?.resize(height + 2)
                })
            }

            const addOrMerge = (n) => {
                const existingIdx = notifications.value.findIndex((x) => x.id === n.id)
                if (existingIdx >= 0) {
                    notifications.value[existingIdx] = { ...notifications.value[existingIdx], ...n }
                } else {
                    notifications.value.unshift({
                        id: n.id || `n_${idCounter++}`,
                        title: n.title || 'Notification',
                        message: n.message || '',
                        variant: n.variant || 'info',
                        timeoutMs: n.timeoutMs ?? 5000,
                        actions: n.actions || [],
                        progress: n.progress,
                        _paused: false,
                        _remaining: n.timeoutMs ?? 5000,
                        _start: Date.now()
                    })
                }
                recalc()
            }

            const dismiss = (id) => {
                notifications.value = notifications.value.filter((n) => n.id !== id)
                recalc()
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
                    recalc()
                }
                requestAnimationFrame(tick)
            }

            const action = (n, a) => {
                if (typeof a.onClick === 'function') {
                    a.onClick()
                } else if (a.channel) {
                    window.postMessage({ channel: a.channel, payload: n }, '*')
                }
                if (!a.keepOpen) dismiss(n.id)
            }

            const snooze = (id) => {
                const n = notifications.value.find((n) => n.id === id)
                if (!n) return
                n._paused = false
                n._start = Date.now()
                n._remaining = n.timeoutMs || 5000
            }

            onMounted(() => {
                window.electronNotifications?.onAdd((payload) => {
                    addOrMerge(payload)
                })
                window.addEventListener('resize', () => recalc())
                window.electronNotifications?.reposition()
                recalc()
                requestAnimationFrame(tick)
            })

            return { notifications, wrap, dismiss, pause, resume, action, snooze }
        }
    }
</script>

<style scoped>
    .noti-wrap {
        pointer-events: none;
        padding: 10px 10px;
    }

    .stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .card {
        pointer-events: auto;
        width: 400px;
        max-width: 88vw;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
        padding: 14px 14px 12px 14px;
        backdrop-filter: blur(10px);
    }

    .card.info {
        border-top: 4px solid #5cc7ff;
    }
    .card.success {
        border-top: 4px solid #68d391;
    }
    .card.error {
        border-top: 4px solid #f56565;
    }

    .title {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 700;
        color: #1f2937;
    }

    .actions {
        display: flex;
        gap: 8px;
    }
    .icon {
        background: #eef2f7;
        border: none;
        border-radius: 8px;
        width: 28px;
        height: 28px;
        cursor: pointer;
    }
    .icon:hover {
        background: #e2e8f0;
    }

    .message {
        color: #4b5563;
        margin-top: 8px;
        font-size: 12px;
    }

    .buttons {
        display: flex;
        gap: 8px;
        margin-top: 10px;
    }
    .btn {
        background: #0ea5e9;
        color: white;
        border: none;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        font-size: 12px;
    }
    .btn:hover {
        background: #0284c7;
    }

    .progress {
        height: 6px;
        background: #e5f2ff;
        border-radius: 6px;
        overflow: hidden;
        margin-top: 10px;
    }
    .bar {
        height: 100%;
        background: linear-gradient(90deg, #22d3ee, #3b82f6);
        width: 0%;
        transition: width 0.2s ease;
    }

    .stack-enter-active,
    .stack-leave-active {
        transition: all 0.18s ease;
    }
    .stack-enter-from,
    .stack-leave-to {
        opacity: 0;
        transform: translateY(-6px);
    }
</style>
