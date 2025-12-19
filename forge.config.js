const { FusesPlugin } = require('@electron-forge/plugin-fuses')
const { FuseV1Options, FuseVersion } = require('@electron/fuses')
const path = require('path')

module.exports = {
    packagerConfig: {
        icon: 'src/assets/icons/icon', // Correct: No extension, points to src/assets/icon.icns for macOS
        extraResource: ['./resources/icons'],
        asar: true, // Required because fuses enforce OnlyLoadAppFromAsar and ASAR integrity validation
        extendInfo: {
            NSCameraUsageDescription: 'This app needs access to the camera to record videos.',
            NSMicrophoneUsageDescription: 'This app needs access to the microphone to record audio.',
            NSAccessibilityUsageDescription: 'This app needs accessibility access to record your screen.'
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
            name: '@electron-forge/maker-deb',
            config: {}
        },
        {
            name: '@electron-forge/maker-rpm',
            config: {}
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
