import { ref } from 'vue'

export function useDesktopCapturePreview(selectedSourceId) {
    const screenVideo = ref(null)
    const sources = ref([])

    let screenStream = null
    let previewCaptureCursor = true

    const refreshSources = async () => {
        try {
            if (window.electron) {
                sources.value = await window.electron.getSources()
            }
        } catch (error) {
            console.error('Error getting sources:', error)
        }
    }

    const setPreviewCaptureCursor = (value) => {
        previewCaptureCursor = value !== false
    }

    const applyPreviewCursorConstraints = async (stream, captureCursor) => {
        const videoTrack = stream?.getVideoTracks?.()?.[0]
        if (!videoTrack?.applyConstraints) return

        try {
            await videoTrack.applyConstraints({
                cursor: captureCursor ? 'always' : 'never'
            })
        } catch (error) {
            console.warn('Could not apply preview cursor constraint:', error)
        }
    }

    const startPreview = async ({ captureCursor = previewCaptureCursor } = {}) => {
        if (!selectedSourceId.value) return false

        previewCaptureCursor = captureCursor

        const baseVideoConstraints = {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedSourceId.value,
                minWidth: 1280,
                maxWidth: 3840,
                minHeight: 720,
                maxHeight: 2160
            }
        }

        const constraints = {
            audio: false,
            video: {
                ...baseVideoConstraints,
                cursor: previewCaptureCursor ? 'always' : 'never'
            }
        }

        try {
            try {
                screenStream = await navigator.mediaDevices.getUserMedia(constraints)
            } catch (error) {
                console.warn('Retrying preview stream without cursor constraint:', error)
                screenStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: baseVideoConstraints
                })
            }

            await applyPreviewCursorConstraints(screenStream, previewCaptureCursor)

            if (screenVideo.value) {
                screenVideo.value.srcObject = screenStream
            }

            await new Promise((resolve) => {
                if (!screenVideo.value) {
                    resolve()
                    return
                }

                screenVideo.value.onloadedmetadata = () => {
                    screenVideo.value
                        .play()
                        .then(resolve)
                        .catch((error) => {
                            console.error('Error playing screen video:', error)
                            resolve()
                        })
                }
            })

            return true
        } catch (error) {
            console.error('Error starting preview:', error)
            return false
        }
    }

    const hasLiveScreenStream = () => {
        return !!(
            screenStream &&
            screenStream.active &&
            screenStream.getVideoTracks().some((track) => track.readyState === 'live')
        )
    }

    const waitForScreenVideoReady = async (timeoutMs = 4000) => {
        const video = screenVideo.value
        if (!video) return false

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
            return true
        }

        return await new Promise((resolve) => {
            let settled = false

            const cleanup = () => {
                video.removeEventListener('loadedmetadata', checkReady)
                video.removeEventListener('canplay', checkReady)
                video.removeEventListener('playing', checkReady)
                video.removeEventListener('error', handleError)
            }

            const finish = (result) => {
                if (settled) return
                settled = true
                clearTimeout(timeoutId)
                cleanup()
                resolve(result)
            }

            const checkReady = () => {
                if (
                    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                    video.videoWidth > 0 &&
                    video.videoHeight > 0
                ) {
                    finish(true)
                }
            }

            const handleError = () => finish(false)
            const timeoutId = setTimeout(() => finish(false), timeoutMs)

            video.addEventListener('loadedmetadata', checkReady)
            video.addEventListener('canplay', checkReady)
            video.addEventListener('playing', checkReady)
            video.addEventListener('error', handleError)
            checkReady()
        })
    }

    const ensurePreviewStream = async ({ captureCursor = previewCaptureCursor } = {}) => {
        if (!selectedSourceId.value) return false

        if (!hasLiveScreenStream() || previewCaptureCursor !== captureCursor) {
            previewCaptureCursor = captureCursor
            if (hasLiveScreenStream()) {
                stopPreview()
            }
            await startPreview({ captureCursor })
        }

        return await waitForScreenVideoReady()
    }

    const stopPreview = () => {
        if (screenStream) {
            screenStream.getTracks().forEach((track) => track.stop())
            screenStream = null
        }

        if (screenVideo.value) {
            screenVideo.value.pause()
            screenVideo.value.srcObject = null
        }
    }

    return {
        screenVideo,
        sources,
        refreshSources,
        setPreviewCaptureCursor,
        startPreview,
        ensurePreviewStream,
        stopPreview
    }
}
