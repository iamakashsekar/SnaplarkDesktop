require('dotenv').config()

const axios = require('axios')
const fs = require('fs/promises')
const path = require('path')

const BASE_URL = process.env.SNAPLARK_BASE_URL || 'https://snaplark.com'
const API_URL = `${BASE_URL}/api/v1/languages`
const I18N_DIR = path.resolve(__dirname, '..', 'src', 'i18n')
const GENERATED_FILE = path.join(I18N_DIR, 'generated-locales.js')
const VALID_DESKTOP_STATUSES = new Set(['ready', 'synced'])

const isLocaleJsonFile = (filename) => /^[A-Za-z0-9-]+\.json$/.test(filename)

const toImportIdentifier = (locale) => `locale_${locale.replace(/[^A-Za-z0-9_$]/g, '_')}`

const createGeneratedLocalesModule = ({ fallbackLocale, supportedLocales }) => {
    const imports = supportedLocales
        .map((language) => `import ${toImportIdentifier(language.code)} from './${language.code}.json'`)
        .join('\n')

    const localeEntries = supportedLocales
        .map((language) => {
            return `    {
        code: ${JSON.stringify(language.code)},
        name: ${JSON.stringify(language.name)}
    }`
        })
        .join(',\n')

    const messageEntries = supportedLocales
        .map((language) => `    ${JSON.stringify(language.code)}: ${toImportIdentifier(language.code)}`)
        .join(',\n')

    return `${imports}

export const FALLBACK_LOCALE = ${JSON.stringify(fallbackLocale)}

export const SUPPORTED_LOCALES = [
${localeEntries}
]

export const messages = {
${messageEntries}
}
`
}

async function fetchLanguageIndex() {
    const response = await axios.get(API_URL, {
        headers: {
            Accept: 'application/json'
        }
    })

    if (!Array.isArray(response.data?.items)) {
        throw new Error('Language API did not return an items array')
    }

    return response.data
}

async function downloadLocaleJson(downloadUrl) {
    const response = await axios.get(downloadUrl, {
        headers: {
            Accept: 'application/json'
        }
    })

    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
        throw new Error(`Downloaded locale file from ${downloadUrl} is not a JSON object`)
    }

    return response.data
}

async function writeLocaleFile(locale, data) {
    const targetPath = path.join(I18N_DIR, `${locale}.json`)
    await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function deleteStaleLocaleFiles(validLocales) {
    const files = await fs.readdir(I18N_DIR)

    await Promise.all(
        files
            .filter((filename) => isLocaleJsonFile(filename))
            .filter((filename) => !validLocales.has(path.basename(filename, '.json')))
            .map((filename) => fs.unlink(path.join(I18N_DIR, filename)))
    )
}

async function main() {
    console.log(`Fetching languages from ${API_URL}`)

    const payload = await fetchLanguageIndex()
    const syncedLanguages = []

    for (const item of payload.items) {
        const locale = item?.locale
        const desktopFile = item?.files?.desktop
        const downloadUrl = desktopFile?.download_url
        const status = String(desktopFile?.status || '').toLowerCase()

        if (!locale) {
            console.warn('Skipping language item without locale:', item)
            continue
        }

        if (!downloadUrl || !VALID_DESKTOP_STATUSES.has(status)) {
            console.log(`Skipping ${locale}: desktop file is not ready (${desktopFile?.status || 'missing'})`)
            continue
        }

        console.log(`Downloading ${locale} from ${downloadUrl}`)
        const localeJson = await downloadLocaleJson(downloadUrl)
        await writeLocaleFile(locale, localeJson)

        syncedLanguages.push({
            code: locale,
            name: item?.name || locale
        })
    }

    if (syncedLanguages.length === 0) {
        throw new Error('No desktop language files were available with status ready/synced')
    }

    const validLocaleCodes = new Set(syncedLanguages.map((language) => language.code))
    await deleteStaleLocaleFiles(validLocaleCodes)

    const fallbackLocale = validLocaleCodes.has(payload.default_locale)
        ? payload.default_locale
        : syncedLanguages[0].code

    const generatedModule = createGeneratedLocalesModule({
        fallbackLocale,
        supportedLocales: syncedLanguages
    })
    await fs.writeFile(GENERATED_FILE, generatedModule, 'utf8')

    console.log(`Synced ${syncedLanguages.length} desktop language(s): ${syncedLanguages.map((item) => item.code).join(', ')}`)
    console.log(`Updated ${path.relative(process.cwd(), GENERATED_FILE)}`)
}

main().catch((error) => {
    console.error('Language sync failed:', error.message)
    process.exit(1)
})
