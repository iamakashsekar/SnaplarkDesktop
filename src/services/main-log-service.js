import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { buildLogLine, formatConsoleArgs, serializeError, serializeForLog } from './log-shared.js'

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024
const MAX_ROTATED_LOGS = 5

class MainLogService {
    constructor() {
        this.stream = null
        this.filePath = null
        this.logsDirectory = null
        this.sessionId = `${Date.now()}-${process.pid}`
        this.initialized = false
        this.consoleCaptured = false
        this.processHandlersAttached = false
        this.pendingEntries = []
        this.originalConsole = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: console.debug.bind(console)
        }
    }

    captureConsole(processType = 'main') {
        if (this.consoleCaptured) {
            return
        }

        this.consoleCaptured = true

        const levelMap = {
            log: 'info',
            info: 'info',
            warn: 'warn',
            error: 'error',
            debug: 'debug'
        }

        Object.keys(levelMap).forEach((method) => {
            const originalMethod = this.originalConsole[method]

            console[method] = (...args) => {
                try {
                    this.log({
                        level: levelMap[method],
                        event: 'console.message',
                        message: formatConsoleArgs(args),
                        processType,
                        scope: 'console',
                        context: {
                            consoleMethod: method,
                            args: serializeForLog(args)
                        }
                    })
                } catch (error) {
                    originalMethod('[MainLogService] Failed to capture console output', error)
                }

                originalMethod(...args)
            }
        })
    }

    attachProcessHandlers() {
        if (this.processHandlersAttached) {
            return
        }

        this.processHandlersAttached = true

        process.on('uncaughtException', (error) => {
            this.log({
                level: 'error',
                event: 'process.uncaught_exception',
                message: error?.message || 'Uncaught exception',
                processType: 'main',
                scope: 'runtime',
                context: { error: serializeError(error) }
            })
        })

        process.on('unhandledRejection', (reason) => {
            this.log({
                level: 'error',
                event: 'process.unhandled_rejection',
                message: 'Unhandled promise rejection',
                processType: 'main',
                scope: 'runtime',
                context: { reason: serializeForLog(reason) }
            })
        })

        process.on('warning', (warning) => {
            this.log({
                level: 'warn',
                event: 'process.warning',
                message: warning?.message || 'Process warning',
                processType: 'main',
                scope: 'runtime',
                context: { warning: serializeError(warning) }
            })
        })

        app.on('render-process-gone', (event, webContents, details) => {
            this.log({
                level: 'error',
                event: 'renderer.process_gone',
                message: 'Renderer process terminated unexpectedly',
                processType: 'main',
                scope: 'runtime',
                context: {
                    reason: details?.reason,
                    exitCode: details?.exitCode,
                    url: webContents?.getURL?.()
                }
            })
        })

        app.on('child-process-gone', (event, details) => {
            this.log({
                level: 'error',
                event: 'child.process_gone',
                message: 'Child process terminated unexpectedly',
                processType: 'main',
                scope: 'runtime',
                context: serializeForLog(details)
            })
        })
    }

    initialize() {
        if (this.initialized) {
            return this.getLogFileInfo()
        }

        if (!app.isReady()) {
            return null
        }

        this.logsDirectory = path.join(app.getPath('userData'), 'logs')
        fs.mkdirSync(this.logsDirectory, { recursive: true })

        this.filePath = path.join(this.logsDirectory, 'snaplark.log')
        this.rotateIfNeeded()

        this.stream = fs.createWriteStream(this.filePath, {
            flags: 'a',
            encoding: 'utf8'
        })

        this.initialized = true

        this.flushPendingEntries()

        this.log({
            level: 'info',
            event: 'log.session_started',
            message: 'Diagnostic log session started',
            processType: 'main',
            scope: 'logging',
            context: {
                appVersion: app.getVersion(),
                platform: process.platform,
                arch: process.arch,
                hostname: os.hostname()
            }
        })

        return this.getLogFileInfo()
    }

    rotateIfNeeded() {
        if (!this.filePath || !fs.existsSync(this.filePath)) {
            return
        }

        const stats = fs.statSync(this.filePath)
        if (stats.size < MAX_LOG_SIZE_BYTES) {
            return
        }

        for (let index = MAX_ROTATED_LOGS; index >= 1; index -= 1) {
            const currentPath = `${this.filePath}.${index}`
            const nextPath = `${this.filePath}.${index + 1}`

            if (fs.existsSync(currentPath)) {
                if (index === MAX_ROTATED_LOGS) {
                    fs.rmSync(currentPath, { force: true })
                } else {
                    fs.renameSync(currentPath, nextPath)
                }
            }
        }

        fs.renameSync(this.filePath, `${this.filePath}.1`)
    }

    flushPendingEntries() {
        if (!this.initialized || !this.stream) {
            return
        }

        const pendingEntries = [...this.pendingEntries]
        this.pendingEntries = []

        pendingEntries.forEach((entry) => {
            this.writeEntry(entry)
        })
    }

    writeEntry(entry) {
        if (!this.stream) {
            return
        }

        try {
            this.stream.write(buildLogLine(entry))
        } catch (error) {
            this.originalConsole.error('[MainLogService] Failed to write log entry', error)
        }
    }

    log({
        level = 'info',
        event = 'app.event',
        message = '',
        context = {},
        processType = 'main',
        scope = 'app',
        windowType = null
    }) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            message,
            context: serializeForLog(context) || {},
            processType,
            scope,
            windowType,
            pid: process.pid,
            sessionId: this.sessionId
        }

        if (!this.initialized) {
            this.pendingEntries.push(entry)
            return entry
        }

        this.writeEntry(entry)
        return entry
    }

    getLogFileInfo() {
        if (!this.initialized) {
            this.initialize()
        }

        const stats = this.filePath && fs.existsSync(this.filePath) ? fs.statSync(this.filePath) : null

        return {
            path: this.filePath,
            directory: this.logsDirectory,
            filename: this.filePath ? path.basename(this.filePath) : null,
            sizeBytes: stats?.size || 0,
            updatedAt: stats?.mtime?.toISOString?.() || null,
            sessionId: this.sessionId
        }
    }

    readTail({ lines = 200 } = {}) {
        if (!this.filePath || !fs.existsSync(this.filePath)) {
            return ''
        }

        const content = fs.readFileSync(this.filePath, 'utf8')
        const allLines = content.split('\n').filter(Boolean)
        return allLines.slice(-lines).join('\n')
    }

    shutdown() {
        if (this.stream) {
            this.log({
                level: 'info',
                event: 'log.session_closed',
                message: 'Diagnostic log session closed',
                processType: 'main',
                scope: 'logging'
            })

            this.stream.end()
            this.stream = null
        }
    }
}

const mainLogService = new MainLogService()

export default mainLogService
