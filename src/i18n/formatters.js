import { unref } from 'vue'
import { i18n, translate } from './index'

const getActiveLocale = () => {
    return unref(i18n.global.locale) || 'en'
}

export const formatLocalizedFileSize = (bytes) => {
    if (!bytes) {
        return `0 ${translate('common.units.bytes')}`
    }

    const units = [
        { key: 'common.units.bytes', value: 1, decimals: 0 },
        { key: 'common.units.kb', value: 1024, decimals: 0 },
        { key: 'common.units.mb', value: 1024 ** 2, decimals: 1 },
        { key: 'common.units.gb', value: 1024 ** 3, decimals: 1 }
    ]

    const unit = [...units].reverse().find((entry) => bytes >= entry.value) || units[0]
    const amount = bytes / unit.value
    const formatter = new Intl.NumberFormat(getActiveLocale(), {
        minimumFractionDigits: unit.decimals,
        maximumFractionDigits: unit.decimals
    })

    if (unit.value === 1) {
        return `${bytes} ${translate(unit.key)}`
    }

    return `${formatter.format(amount)} ${translate(unit.key)}`
}

export const formatLocalizedDateTime = (value) => {
    if (!value) {
        return ''
    }

    return new Intl.DateTimeFormat(getActiveLocale(), {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(value))
}
