import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const MACOS_WINDOW_INSPECTOR_SCRIPT = String.raw`
ObjC.import('CoreGraphics')
ObjC.import('AppKit')

function toNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function unwrap(value) {
    return value ? ObjC.unwrap(value) : null
}

function run(argv) {
    const x = toNumber(argv[0], 0)
    const y = toNumber(argv[1], 0)
    const excludedPid = toNumber(argv[2], 0)
    const options = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements
    const windowList = ObjC.castRefToObject($.CGWindowListCopyWindowInfo(options, $.kCGNullWindowID))
    let match = null

    for (let index = 0; index < windowList.count; index += 1) {
        const windowInfo = ObjC.deepUnwrap(windowList.objectAtIndex(index))
        const bounds = windowInfo.kCGWindowBounds || {}
        const ownerPid = toNumber(windowInfo.kCGWindowOwnerPID, 0)
        const layer = toNumber(windowInfo.kCGWindowLayer, 0)
        const alpha = toNumber(windowInfo.kCGWindowAlpha, 1)
        const width = toNumber(bounds.Width, 0)
        const height = toNumber(bounds.Height, 0)
        const left = toNumber(bounds.X, 0)
        const top = toNumber(bounds.Y, 0)
        const containsPoint = x >= left && x <= left + width && y >= top && y <= top + height

        if (ownerPid === excludedPid || layer !== 0 || alpha <= 0 || width < 40 || height < 40 || !containsPoint) {
            continue
        }

        match = windowInfo
        break
    }

    if (!match) {
        return JSON.stringify({
            kind: 'desktop',
            screenPoint: { x, y },
            label: 'Desktop',
            message: 'No app window was found under this click.'
        })
    }

    const ownerPid = toNumber(match.kCGWindowOwnerPID, 0)
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(ownerPid)
    const bundleURL = app ? app.bundleURL : null
    const bounds = match.kCGWindowBounds || {}

    return JSON.stringify({
        kind: 'window',
        screenPoint: { x, y },
        app: {
            name: app ? unwrap(app.localizedName) : match.kCGWindowOwnerName || null,
            bundleId: app ? unwrap(app.bundleIdentifier) : null,
            bundlePath: bundleURL ? unwrap(bundleURL.path) : null,
            pid: ownerPid
        },
        window: {
            title: match.kCGWindowName || null,
            ownerName: match.kCGWindowOwnerName || null,
            layer: toNumber(match.kCGWindowLayer, 0),
            number: toNumber(match.kCGWindowNumber, 0),
            bounds: {
                x: toNumber(bounds.X, 0),
                y: toNumber(bounds.Y, 0),
                width: toNumber(bounds.Width, 0),
                height: toNumber(bounds.Height, 0)
            }
        }
    })
}
`

export async function inspectWindowAtScreenPoint(point, excludedPid = process.pid) {
    if (process.platform !== 'darwin') {
        return {
            success: false,
            kind: 'unsupported',
            error: `Window inspection is not implemented on ${process.platform}.`
        }
    }

    const x = Math.round(point?.x ?? 0)
    const y = Math.round(point?.y ?? 0)

    const { stdout } = await execFileAsync(
        'osascript',
        ['-l', 'JavaScript', '-e', MACOS_WINDOW_INSPECTOR_SCRIPT, '--', String(x), String(y), String(excludedPid)],
        {
            timeout: 1500,
            maxBuffer: 1024 * 1024
        }
    )

    const output = stdout.trim()
    if (!output) {
        return {
            success: false,
            kind: 'error',
            error: 'Window inspection returned no data.'
        }
    }

    return {
        success: true,
        ...JSON.parse(output)
    }
}
