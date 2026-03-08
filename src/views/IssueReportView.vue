<script setup>
    import { computed, onMounted, ref } from 'vue'
    import Switch from '@/components/Switch.vue'
    import TitleBar from '@/components/TitleBar.vue'
    import { WINDOW_TITLES } from '@/config/window-config'
    import { submitIssueReport, formatAttachmentSize } from '@/api/issue-report.js'
    import { rendererLogService } from '@/services/renderer-log-service.js'

    const message = ref('')
    const screenshotFile = ref(null)
    const includeDiagnosticLog = ref(true)
    const logFileInfo = ref(null)
    const isSubmitting = ref(false)
    const feedback = ref({ type: '', message: '' })
    const appVersion = ref('')
    const deviceName = ref('')

    const isSubmitDisabled = computed(() => !message.value.trim() || isSubmitting.value)
    const canAttachDiagnosticLog = computed(() => !!logFileInfo.value?.path)

    const screenshotSummary = computed(() => {
        if (!screenshotFile.value) {
            return 'No screenshot attached'
        }

        return `${screenshotFile.value.name} (${formatAttachmentSize(screenshotFile.value.size)})`
    })

    const loadDiagnosticLogState = async () => {
        try {
            logFileInfo.value = await window.electronLogger?.getLogFileInfo?.()
            includeDiagnosticLog.value = canAttachDiagnosticLog.value
        } catch (error) {
            rendererLogService.error(
                'issue_report.log_state_failed',
                'Failed to load diagnostic log state',
                error,
                {},
                'issue-report'
            )
            includeDiagnosticLog.value = false
        }
    }

    const handleScreenshotChange = (event) => {
        const [file] = event.target.files || []
        screenshotFile.value = file || null

        rendererLogService.info(
            'issue_report.screenshot_attachment_changed',
            'Issue report screenshot attachment changed',
            {
                attached: !!file,
                fileName: file?.name,
                fileSize: file?.size
            },
            'issue-report'
        )
    }

    const removeScreenshot = () => {
        screenshotFile.value = null
    }

    const resetForm = () => {
        message.value = ''
        screenshotFile.value = null
    }

    const openDiagnosticLog = () => {
        if (!logFileInfo.value?.path) {
            return
        }

        window.electron.showItemInFolder(logFileInfo.value.path)
    }

    const closeWindow = async () => {
        await window.electronWindows?.closeWindow?.('issue-report')
        await window.electron?.showMainAtTray?.({ force: true, gap: 5 })
    }

    const submit = async () => {
        if (isSubmitDisabled.value) {
            return
        }

        isSubmitting.value = true
        feedback.value = { type: '', message: '' }

        try {
            const metadata = {
                appVersion: appVersion.value,
                deviceName: deviceName.value,
                platform: window.electron?.platform,
                submittedAt: new Date().toISOString(),
                hasScreenshot: !!screenshotFile.value,
                hasDiagnosticLog: includeDiagnosticLog.value && !!logFileInfo.value?.path,
                logSessionId: logFileInfo.value?.sessionId || null
            }

            rendererLogService.info(
                'issue_report.submission_started',
                'Issue report submission started',
                metadata,
                'issue-report'
            )

            await submitIssueReport({
                message: message.value,
                screenshotFile: screenshotFile.value,
                includeDiagnosticLog: includeDiagnosticLog.value,
                logFileInfo: logFileInfo.value,
                metadata
            })

            rendererLogService.info(
                'issue_report.submission_succeeded',
                'Issue report submission succeeded',
                metadata,
                'issue-report'
            )

            feedback.value = {
                type: 'success',
                message: 'Issue report submitted successfully.'
            }
            resetForm()
        } catch (error) {
            rendererLogService.error(
                'issue_report.submission_failed',
                'Issue report submission failed',
                error,
                {
                    includeDiagnosticLog: includeDiagnosticLog.value,
                    hasScreenshot: !!screenshotFile.value
                },
                'issue-report'
            )

            const backendNotReady =
                error?.status === 404 ||
                error?.status === 405 ||
                error?.message?.toLowerCase?.().includes('network error')

            feedback.value = {
                type: 'error',
                message: backendNotReady
                    ? 'The report UI is ready, but the backend endpoint is not available yet.'
                    : error?.message || 'Failed to submit issue report.'
            }
        } finally {
            isSubmitting.value = false
        }
    }

    onMounted(async () => {
        rendererLogService.info('issue_report.window_opened', 'Issue report window mounted', {}, 'issue-report')

        appVersion.value = (await window.electron?.getAppVersion?.()) || ''
        deviceName.value = (await window.electron?.getDeviceName?.()) || ''
        await loadDiagnosticLogState()
    })
</script>

<template>
    <section class="dark:bg-dark-blue flex h-screen flex-col bg-white text-slate-900 dark:text-gray-200">
        <TitleBar :title="WINDOW_TITLES.issueReport" />

        <div class="flex items-start justify-between px-5 pb-2">
            <div>
                <h1 class="text-xl font-semibold text-slate-900 dark:text-white">Report an issue</h1>
                <p class="mt-0.5 text-sm text-slate-500 dark:text-gray-400">
                    Send a message to engineering with optional screenshot and diagnostics.
                </p>
            </div>
        </div>

        <div class="custom-scrollbar flex-1 space-y-2.5 overflow-y-auto px-5 pb-3">
            <div
                v-if="feedback.message"
                :class="
                    feedback.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
                "
                class="rounded-2xl border px-4 py-3 text-sm">
                {{ feedback.message }}
            </div>

            <div class="dark:border-dark-700 dark:bg-dark-800 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <label class="block">
                    <span class="text-sm font-semibold text-slate-800 dark:text-gray-100">What happened?</span>
                    <span class="mt-1 block text-xs text-slate-500 dark:text-gray-400">
                        Required. Describe what the user was doing and what went wrong.
                    </span>
                    <textarea
                        v-model="message"
                        rows="4"
                        placeholder="Example: The app froze after I started a screen recording and tried to enable my webcam."
                        class="dark:border-dark-700 dark:bg-dark-900 mt-2.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition outline-none focus:border-blue-400 dark:text-gray-100" />
                </label>
            </div>

            <div class="dark:border-dark-700 dark:bg-dark-800 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h2 class="text-sm font-semibold text-slate-800 dark:text-gray-100">Screenshot attachment</h2>
                        <p class="mt-1 text-xs text-slate-500 dark:text-gray-400">
                            Optional. Add a screenshot that shows the problem.
                        </p>
                    </div>

                    <label
                        class="cursor-pointer rounded-lg border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-400">
                        Choose image
                        <input
                            type="file"
                            accept="image/*"
                            class="hidden"
                            @change="handleScreenshotChange" />
                    </label>
                </div>

                <div
                    v-if="screenshotFile"
                    class="dark:bg-dark-900 mt-2.5 flex items-center justify-between rounded-xl bg-white px-4 py-2.5 text-sm text-slate-600 dark:text-gray-300">
                    <span class="truncate">{{ screenshotSummary }}</span>
                    <button
                        type="button"
                        @click="removeScreenshot"
                        class="ml-3 rounded-lg px-2 py-1 text-xs text-red-500 transition hover:bg-red-500/10">
                        Remove
                    </button>
                </div>
            </div>

            <div class="dark:border-dark-700 dark:bg-dark-800 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <h2 class="text-sm font-semibold text-slate-800 dark:text-gray-100">Diagnostic log</h2>
                        <p class="mt-1 text-xs text-slate-500 dark:text-gray-400">
                            Optional. Attach the live application log collected from startup through the current
                            session.
                        </p>
                    </div>

                    <div
                        class="dark:bg-dark-800 rounded-full bg-slate-100 px-1.5 py-1"
                        :class="{ 'pointer-events-none opacity-50': !canAttachDiagnosticLog }">
                        <Switch
                            v-model="includeDiagnosticLog"
                            size="md" />
                    </div>
                </div>

                <div
                    class="dark:border-dark-700 dark:bg-dark-900 mt-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium text-slate-700 dark:text-gray-100">
                                {{ logFileInfo?.filename || 'Diagnostic log unavailable' }}
                            </p>
                            <p class="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">
                                {{ logFileInfo?.path || 'No log file has been initialized yet.' }}
                            </p>
                        </div>

                        <button
                            type="button"
                            :disabled="!logFileInfo?.path"
                            @click="openDiagnosticLog"
                            class="dark:border-dark-700 dark:hover:bg-dark-800 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300">
                            Reveal log
                        </button>
                    </div>

                    <p class="mt-2 text-xs text-slate-500 dark:text-gray-400">
                        Size: {{ formatAttachmentSize(logFileInfo?.sizeBytes || 0) }}
                        <span v-if="logFileInfo?.updatedAt"
                            >• Updated {{ new Date(logFileInfo.updatedAt).toLocaleString() }}</span
                        >
                    </p>
                </div>
            </div>
        </div>

        <div class="dark:border-dark-700 flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <div class="text-xs text-slate-500 dark:text-gray-400">
                {{ deviceName || 'Unknown device' }}<span v-if="appVersion"> • v{{ appVersion }}</span>
            </div>

            <button
                type="button"
                :disabled="isSubmitDisabled"
                @click="submit"
                class="bg-primary-blue cursor-pointer rounded-full px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 ease-in-out hover:bg-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60">
                {{ isSubmitting ? 'Submitting...' : 'Submit report' }}
            </button>
        </div>
    </section>
</template>
