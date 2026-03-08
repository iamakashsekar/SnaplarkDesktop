import { apiClient } from './config.js'

export const ISSUE_REPORT_ENDPOINT = '/issue-reports'

const bytesToFileSize = (bytes) => {
    if (!bytes) return '0 Bytes'

    const units = ['Bytes', 'KB', 'MB', 'GB']
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / Math.pow(1024, unitIndex)

    if (unitIndex === 0) {
        return `${bytes} Bytes`
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`
}

const normalizeBuffer = (buffer) => {
    if (!buffer) {
        return new Uint8Array()
    }

    if (buffer instanceof ArrayBuffer) {
        return new Uint8Array(buffer)
    }

    if (ArrayBuffer.isView(buffer)) {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    }

    if (Array.isArray(buffer?.data)) {
        return Uint8Array.from(buffer.data)
    }

    return new TextEncoder().encode(String(buffer))
}

export const submitIssueReport = async ({
    message,
    screenshotFile = null,
    includeDiagnosticLog = false,
    logFileInfo = null,
    metadata = {}
}) => {
    const formData = new FormData()

    formData.append('message', message.trim())
    formData.append('metadata', JSON.stringify(metadata))

    if (screenshotFile) {
        formData.append('screenshot', screenshotFile, screenshotFile.name)
    }

    if (includeDiagnosticLog && logFileInfo?.path) {
        const fileBuffer = await window.electron.readFileAsBuffer(logFileInfo.path)
        const normalizedBuffer = normalizeBuffer(fileBuffer)
        const logBlob = new Blob([normalizedBuffer], { type: 'text/plain' })
        formData.append('diagnostic_log', logBlob, logFileInfo.filename || 'snaplark.log')
        formData.append('diagnostic_log_size', String(normalizedBuffer.byteLength))
    }

    return apiClient.post(ISSUE_REPORT_ENDPOINT, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
}

export const formatAttachmentSize = bytesToFileSize
