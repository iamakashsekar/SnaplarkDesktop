const MAX_DEPTH = 4
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_LENGTH = 4000

const truncateString = (value, maxLength = MAX_STRING_LENGTH) => {
    if (typeof value !== 'string') {
        return value
    }

    if (value.length <= maxLength) {
        return value
    }

    return `${value.slice(0, maxLength)}...<truncated>`
}

export const serializeError = (error) => {
    if (!error) {
        return null
    }

    if (typeof error === 'string') {
        return { message: truncateString(error) }
    }

    return {
        name: error.name || 'Error',
        message: truncateString(error.message || 'Unknown error'),
        stack: truncateString(error.stack || ''),
        code: error.code,
        status: error.status
    }
}

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'

export const serializeForLog = (value, depth = 0, seen = new WeakSet()) => {
    if (value === null || value === undefined) {
        return value
    }

    if (typeof value === 'string') {
        return truncateString(value)
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'bigint') {
        return value.toString()
    }

    if (typeof value === 'function') {
        return `[Function ${value.name || 'anonymous'}]`
    }

    if (value instanceof Error) {
        return serializeError(value)
    }

    if (typeof File !== 'undefined' && value instanceof File) {
        return {
            name: value.name,
            size: value.size,
            type: value.type,
            lastModified: value.lastModified
        }
    }

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
        return {
            size: value.size,
            type: value.type || 'application/octet-stream'
        }
    }

    if (value instanceof ArrayBuffer) {
        return { type: 'ArrayBuffer', byteLength: value.byteLength }
    }

    if (ArrayBuffer.isView(value)) {
        return {
            type: value.constructor?.name || 'TypedArray',
            byteLength: value.byteLength
        }
    }

    if (value instanceof Date) {
        return value.toISOString()
    }

    if (depth >= MAX_DEPTH) {
        if (Array.isArray(value)) {
            return `[Array(${value.length})]`
        }

        if (isPlainObject(value)) {
            return '[Object]'
        }
    }

    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]'
        }

        seen.add(value)

        if (Array.isArray(value)) {
            return value.slice(0, MAX_ARRAY_ITEMS).map((item) => serializeForLog(item, depth + 1, seen))
        }

        const serialized = {}
        Object.entries(value).forEach(([key, nestedValue]) => {
            serialized[key] = serializeForLog(nestedValue, depth + 1, seen)
        })
        return serialized
    }

    return truncateString(String(value))
}

export const summarizeArgs = (args = []) => args.map((arg) => serializeForLog(arg))

export const formatConsoleArgs = (args = []) =>
    args
        .map((arg) => {
            if (typeof arg === 'string') {
                return truncateString(arg, 800)
            }

            try {
                return JSON.stringify(serializeForLog(arg))
            } catch {
                return String(arg)
            }
        })
        .join(' ')

export const buildLogLine = (entry) => {
    const metadata = {
        sessionId: entry.sessionId,
        pid: entry.pid,
        scope: entry.scope,
        ...(entry.windowType ? { windowType: entry.windowType } : {}),
        ...(entry.context && Object.keys(entry.context).length > 0 ? { context: entry.context } : {})
    }

    return `${entry.timestamp} ${String(entry.level || 'info')
        .toUpperCase()
        .padEnd(
            5
        )} [${entry.processType}] [${entry.event}] ${truncateString(entry.message || '')} ${JSON.stringify(metadata)}\n`
}
