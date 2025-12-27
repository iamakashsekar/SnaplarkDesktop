require('dotenv').config() // Load environment variables from .env
const { FusesPlugin } = require('@electron-forge/plugin-fuses')
const { FuseV1Options, FuseVersion } = require('@electron/fuses')
const path = require('path')

module.exports = {
    packagerConfig: {
        appBundleId: 'com.snaplark.snaplark',
        appCategoryType: 'public.app-category.utilities',
        icon: 'src/assets/icons/icon', // Correct: No extension, points to src/assets/icon.icns for macOS
        extraResource: ['./resources/icons'],
        asar: true, // Required because fuses enforce OnlyLoadAppFromAsar and ASAR integrity validation
        extendInfo: {
            NSCameraUsageDescription: 'Snaplark needs camera access to record videos with webcam.',
            NSMicrophoneUsageDescription: 'Snaplark needs microphone access to record audio in your videos.',
            NSScreenCaptureUsageDescription: 'Snaplark needs screen recording permission to capture your screen.',
            NSAccessibilityUsageDescription: 'Snaplark needs accessibility access to record specific windows.'
        },
        osxSign: {
            identity: process.env.APP_IDENTITY,
            hardenedRuntime: true,
            'gatekeeper-assess': false,
            entitlements: 'entitlements.plist',
            'entitlements-inherit': 'entitlements.plist'
        },
        osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID
        }
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                setupIcon: 'src/assets/icons/icon.ico',
                iconUrl: `file://${path.resolve(__dirname, 'src/assets/icons/icon.ico')}`
            }
        },
        {
            name: '@electron-forge/maker-dmg',
            config: {
                icon: 'src/assets/icons/icon.icns',
                background: 'src/assets/icons/background.png'
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
            config: (arch) => ({
                macUpdateManifestBaseUrl: `https://${process.env.AWS_DEFAULT_REGION}.contabostorage.com/72e7132000f0495a956688c26ebee898:${process.env.AWS_BUCKET}/releases/darwin/${arch}`
            })
        },
        {
            name: '@electron-forge/maker-deb',
            config: {}
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {}
        }
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-s3',
            config: {
                bucket: process.env.AWS_BUCKET,
                region: process.env.AWS_DEFAULT_REGION,
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                endpoint: `https://${process.env.AWS_DEFAULT_REGION}.contabostorage.com`,
                s3ForcePathStyle: true,
                public: true,
                acl: 'public-read',
                folder: 'releases'
            }
        }
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-vite',
            config: {
                // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
                // If you are familiar with Vite configuration, it will look really familiar.
                build: [
                    {
                        // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
                        entry: 'src/main.js',
                        config: 'vite.main.config.mjs',
                        target: 'main'
                    },
                    {
                        entry: 'src/preload.js',
                        config: 'vite.preload.config.mjs',
                        target: 'preload'
                    }
                ],
                renderer: [
                    {
                        name: 'main_window',
                        config: 'vite.renderer.config.mjs'
                    }
                ]
            }
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true
        })
    ]
}
