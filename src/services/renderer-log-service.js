import { formatConsoleArgs, serializeError, serializeForLog, summarizeArgs } from './log-shared.js'

const getCurrentWindowType = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get('window') || 'main'
}

class RendererLogService {
    constructor() {
        this.consoleCaptured = false
        this.windowType = typeof window !== 'undefined' ? getCurrentWindowType() : 'main'
        this.originalConsole =
            typeof console !== 'undefined'
                ? {
                      log: console.log.bind(console),
                      info: console.info.bind(console),
                      warn: console.warn.bind(console),
                      error: console.error.bind(console),
                      debug: console.debug.bind(console)
                  }
                : {}
    }

    emit(payload) {
        try {
            window.electronLogger?.write({
                processType: 'renderer',
                windowType: this.windowType,
                ...payload
            })
        } catch {
            // Avoid crashing the renderer because logging is unavailable.
        }
    }

    log(level, event, message, context = {}, scope = 'app') {
        this.emit({
            level,
            event,
            message,
            scope,
            context
        })
    }

    info(event, message, context = {}, scope = 'app') {
        this.log('info', event, message, context, scope)
    }

    warn(event, message, context = {}, scope = 'app') {
        this.log('warn', event, message, context, scope)
    }

    error(event, message, error = null, context = {}, scope = 'app') {
        this.log(
            'error',
            event,
            message,
            {
                ...context,
                ...(error ? { error: serializeError(error) || serializeForLog(error) } : {})
            },
            scope
        )
    }

    captureConsole() {
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

        Object.entries(levelMap).forEach(([method, level]) => {
            const originalMethod = this.originalConsole[method]

            console[method] = (...args) => {
                this.log(
                    level,
                    'console.message',
                    formatConsoleArgs(args),
                    {
                        consoleMethod: method,
                        args: summarizeArgs(args)
                    },
                    'console'
                )

                originalMethod(...args)
            }
        })
    }

    installGlobalErrorHandlers() {
        window.addEventListener('error', (event) => {
            this.error(
                'renderer.unhandled_error',
                event.message || 'Unhandled renderer error',
                event.error,
                {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                },
                'runtime'
            )
        })

        window.addEventListener('unhandledrejection', (event) => {
            this.error('renderer.unhandled_rejection', 'Unhandled promise rejection', event.reason, {}, 'runtime')
        })
    }

    installLifecycleLogging() {
        document.addEventListener('visibilitychange', () => {
            this.info(
                'renderer.visibility_changed',
                'Renderer visibility changed',
                { state: document.visibilityState },
                'lifecycle'
            )
        })

        window.addEventListener('beforeunload', () => {
            this.info('renderer.before_unload', 'Renderer window is unloading', {}, 'lifecycle')
        })
    }

    installRouterLogging(router) {
        router.afterEach((to, from) => {
            this.windowType = to.meta?.windowType || this.windowType
            this.info(
                'router.navigation',
                'Route navigation completed',
                {
                    from: from.fullPath,
                    to: to.fullPath,
                    routeName: to.name,
                    windowType: this.windowType
                },
                'navigation'
            )
        })
    }

    createPiniaPlugin() {
        return ({ store }) => {
            store.$onAction(({ name, args, after, onError }) => {
                const startedAt = Date.now()

                this.info(
                    'store.action_started',
                    'Store action started',
                    {
                        storeId: store.$id,
                        action: name,
                        args: summarizeArgs(args)
                    },
                    'store'
                )

                after((result) => {
                    this.info(
                        'store.action_completed',
                        'Store action completed',
                        {
                            storeId: store.$id,
                            action: name,
                            durationMs: Date.now() - startedAt,
                            result: serializeForLog(result)
                        },
                        'store'
                    )
                })

                onError((error) => {
                    this.error(
                        'store.action_failed',
                        'Store action failed',
                        error,
                        {
                            storeId: store.$id,
                            action: name,
                            durationMs: Date.now() - startedAt
                        },
                        'store'
                    )
                })
            })
        }
    }

    initialize(router) {
        this.captureConsole()
        this.installGlobalErrorHandlers()
        this.installLifecycleLogging()

        if (router) {
            this.installRouterLogging(router)
        }

        this.info(
            'renderer.bootstrap',
            'Renderer logging initialized',
            {
                windowType: this.windowType,
                platform: window.electron?.platform,
                userAgent: navigator.userAgent
            },
            'bootstrap'
        )
    }
}

export const rendererLogService = new RendererLogService()
