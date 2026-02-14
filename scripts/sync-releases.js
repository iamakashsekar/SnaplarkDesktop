require('dotenv').config()

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

// Detect platform and architecture from the current system
const platform = process.platform   // e.g. 'win32', 'darwin', 'linux'
const arch = process.arch            // e.g. 'x64', 'arm64'

// Read the S3 folder prefix from forge.config.js publisher settings
const forgeConfig = require('../forge.config.js')
const s3Publisher = forgeConfig.publishers.find(p => p.name === '@electron-forge/publisher-s3')
const folder = s3Publisher.config.folder  // e.g. 'releases'

// Build paths dynamically
const releasesKey = `${folder}/${platform}/${arch}/RELEASES`
const outDir = path.resolve(__dirname, '..', 'out', 'make', 'squirrel.windows', arch)

async function main() {
    const { AWS_BUCKET, AWS_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION } = process.env

    if (!AWS_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        console.error('Missing required env vars: AWS_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY')
        console.error('Make sure your .env file is configured.')
        process.exit(1)
    }

    const client = new S3Client({
        region: AWS_DEFAULT_REGION || 'auto',
        endpoint: AWS_ENDPOINT,
        credentials: {
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
        },
        forcePathStyle: process.env.AWS_USE_PATH_STYLE_ENDPOINT === 'true',
    })

    console.log(`Platform: ${platform}, Arch: ${arch}`)
    console.log(`Downloading RELEASES from s3://${AWS_BUCKET}/${releasesKey}`)

    // Ensure output directory exists
    fs.mkdirSync(outDir, { recursive: true })

    const destPath = path.join(outDir, 'RELEASES')

    try {
        const res = await client.send(new GetObjectCommand({
            Bucket: AWS_BUCKET,
            Key: releasesKey,
        }))

        await pipeline(res.Body, fs.createWriteStream(destPath))
        console.log(`Saved to ${destPath}`)
        console.log('\nRELEASES file contents:')
        console.log(fs.readFileSync(destPath, 'utf-8'))
    } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
            console.log('No RELEASES file found on S3. This is expected for the first release.')
            return
        }
        throw err
    }
}

main().catch((err) => {
    console.error('Sync failed:', err.message)
    process.exit(1)
})
