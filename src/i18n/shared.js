import { FALLBACK_LOCALE, messages, SUPPORTED_LOCALES } from './generated-locales.js'

export { FALLBACK_LOCALE, messages, SUPPORTED_LOCALES }

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

export const resolveLocale = (locale) => {
    if (!locale || typeof locale !== 'string') {
        return FALLBACK_LOCALE
    }

    const normalized = locale.toLowerCase().trim()
    const exactMatch = SUPPORTED_LOCALES.find((entry) => entry.code === normalized)
    if (exactMatch) {
        return exactMatch.code
    }

    const baseMatch = SUPPORTED_LOCALES.find((entry) => normalized.startsWith(`${entry.code}-`))
    return baseMatch?.code || FALLBACK_LOCALE
}

const getMessageByPath = (locale, key) => {
    const localeMessages = messages[resolveLocale(locale)] || messages[FALLBACK_LOCALE]
    return key.split('.').reduce((current, segment) => {
        if (current && hasOwn(current, segment)) {
            return current[segment]
        }

        return undefined
    }, localeMessages)
}

const interpolateMessage = (message, values = {}) => {
    if (typeof message !== 'string') {
        return message
    }

    return message.replace(/\{(\w+)\}/g, (_, token) => {
        if (!hasOwn(values, token)) {
            return `{${token}}`
        }

        return String(values[token])
    })
}

export const translateShared = (locale, key, values = {}) => {
    const resolvedLocale = resolveLocale(locale)
    const localized = getMessageByPath(resolvedLocale, key)

    if (typeof localized === 'string') {
        return interpolateMessage(localized, values)
    }

    const fallback = getMessageByPath(FALLBACK_LOCALE, key)
    if (typeof fallback === 'string') {
        return interpolateMessage(fallback, values)
    }

    return key
}

export const getStoredLocale = (store) => {
    const settings = store?.get?.('settings') || {}
    return resolveLocale(settings.language)
}

export const getWindowTitle = (store, titleKey) => {
    return translateShared(getStoredLocale(store), `windowTitles.${titleKey}`)
}
