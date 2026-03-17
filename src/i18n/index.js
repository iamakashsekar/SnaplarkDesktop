import { createI18n } from 'vue-i18n'
import { FALLBACK_LOCALE, messages, resolveLocale } from './shared'

const getInitialLocale = () => {
    if (typeof window === 'undefined') {
        return FALLBACK_LOCALE
    }

    const savedLanguage = window.electronStore?.get?.('settings')?.language
    if (savedLanguage) {
        return resolveLocale(savedLanguage)
    }

    return resolveLocale(window.navigator?.language)
}

export const i18n = createI18n({
    legacy: false,
    locale: getInitialLocale(),
    fallbackLocale: FALLBACK_LOCALE,
    messages,
    globalInjection: true
})

export const setLanguage = (language) => {
    const nextLanguage = resolveLocale(language)
    i18n.global.locale.value = nextLanguage

    if (typeof document !== 'undefined') {
        document.documentElement.lang = nextLanguage
    }

    return nextLanguage
}

export const translate = (key, values = {}) => i18n.global.t(key, values)
