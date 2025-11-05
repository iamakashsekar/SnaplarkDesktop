import ffmpeg from 'fluent-ffmpeg'
import { ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

class FFmpegService {
    constructor() {
        this.setupFFmpegPath()
        this.setupHandlers()
    }

    setupFFmpegPath() {
        try {
            // Try to get FFmpeg and FFprobe paths dynamically
            let ffmpegPath = null
            let ffprobePath = null
            
            // In development, use the installed package
            if (!app.isPackaged) {
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
                const ffprobeInstaller = require('@ffprobe-installer/ffprobe')
                
                ffmpegPath = ffmpegInstaller.path
                ffprobePath = ffprobeInstaller.path
                
                console.log('Development mode - using installed packages')
            } else {
                // In production, find the unpacked FFmpeg and FFprobe binaries
                const platform = process.platform
                const arch = process.arch
                
                let ffmpegName = 'ffmpeg'
                let ffprobeName = 'ffprobe'
                if (platform === 'win32') {
                    ffmpegName = 'ffmpeg.exe'
                    ffprobeName = 'ffprobe.exe'
                }
                
                // The binaries should be in the unpacked asar directory
                const appPath = app.getAppPath()
                const ffmpegBasePaths = [
                    path.join(appPath, '..', 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', `${platform}-${arch}`),
                    path.join(appPath, 'node_modules', '@ffmpeg-installer', `${platform}-${arch}`),
                    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffmpeg-installer', `${platform}-${arch}`)
                ]
                
                const ffprobeBasePaths = [
                    path.join(appPath, '..', 'app.asar.unpacked', 'node_modules', '@ffprobe-installer', `${platform}-${arch}`),
                    path.join(appPath, 'node_modules', '@ffprobe-installer', `${platform}-${arch}`),
                    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@ffprobe-installer', `${platform}-${arch}`)
                ]
                
                // Find ffmpeg
                for (const basePath of ffmpegBasePaths) {
                    const candidate = path.join(basePath, ffmpegName)
                    if (fs.existsSync(candidate)) {
                        ffmpegPath = candidate
                        break
                    }
                }
                
                // Find ffprobe
                for (const basePath of ffprobeBasePaths) {
                    const candidate = path.join(basePath, ffprobeName)
                    if (fs.existsSync(candidate)) {
                        ffprobePath = candidate
                        break
                    }
                }
                
                console.log('Production mode - searching for binaries')
            }
            
            if (!ffmpegPath) {
                throw new Error('FFmpeg binary not found')
            }
            
            if (!ffmpegPath || !ffprobePath) {
                throw new Error(`Missing binaries - ffmpeg: ${!!ffmpegPath}, ffprobe: ${!!ffprobePath}`)
            }
            
            console.log('FFmpeg path:', ffmpegPath)
            console.log('FFprobe path:', ffprobePath)
            
            ffmpeg.setFfmpegPath(ffmpegPath)
            ffmpeg.setFfprobePath(ffprobePath)
            
            console.log('FFmpeg and FFprobe configured successfully!')
        } catch (error) {
            console.error('Failed to setup FFmpeg/FFprobe paths:', error)
            // Try to use system FFmpeg/FFprobe as fallback
            try {
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
                const ffprobeInstaller = require('@ffprobe-installer/ffprobe')
                
                ffmpeg.setFfmpegPath(ffmpegInstaller.path)
                ffmpeg.setFfprobePath(ffprobeInstaller.path)
                
                console.log('Fallback: Using installed packages')
                console.log('FFmpeg path:', ffmpegInstaller.path)
                console.log('FFprobe path:', ffprobeInstaller.path)
            } catch (fallbackError) {
                console.error('Failed to setup FFmpeg even with fallback:', fallbackError)
                throw new Error('Could not configure FFmpeg/FFprobe. Please ensure they are installed.')
            }
        }
    }

    setupHandlers() {
        // Create temp file and return path
        ipcMain.handle('create-temp-video-path', async () => {
            try {
                const tempDir = os.tmpdir()
                const tempPath = path.join(tempDir, `snaplark-temp-${Date.now()}.webm`)
                return { success: true, path: tempPath }
            } catch (error) {
                console.error('Error creating temp path:', error)
                return { success: false, error: error.message }
            }
        })

        // Write chunk to temp file (append mode)
        ipcMain.handle('write-video-chunk', async (event, { filePath, chunk, isFirst }) => {
            try {
                console.log('Backend: Received chunk, size:', chunk?.length || chunk?.byteLength, 'isFirst:', isFirst)
                
                // Handle both Uint8Array and plain array
                let buffer
                if (chunk instanceof Uint8Array || ArrayBuffer.isView(chunk)) {
                    buffer = Buffer.from(chunk.buffer || chunk)
                } else if (Array.isArray(chunk)) {
                    buffer = Buffer.from(chunk)
                } else {
                    console.error('Unknown chunk type:', typeof chunk)
                    throw new Error('Invalid chunk type')
                }
                
                if (isFirst) {
                    // First chunk - create new file
                    fs.writeFileSync(filePath, buffer)
                    console.log('Backend: Created file, wrote', buffer.length, 'bytes')
                } else {
                    // Append subsequent chunks
                    fs.appendFileSync(filePath, buffer)
                    console.log('Backend: Appended', buffer.length, 'bytes')
                }
                return { success: true }
            } catch (error) {
                console.error('Error writing video chunk:', error)
                return { success: false, error: error.message }
            }
        })

        // Crop video using FFmpeg (FAST!)
        ipcMain.handle('crop-video-ffmpeg', async (event, options) => {
            try {
                console.log('Backend: FFmpeg crop called with options:', {
                    inputPath: options.inputPath,
                    cropBounds: options.cropBounds,
                    displayWidth: options.displayWidth,
                    displayHeight: options.displayHeight
                })
                
                const { inputPath, cropBounds, displayWidth, displayHeight } = options
                
                if (!inputPath || typeof inputPath !== 'string') {
                    throw new Error('Invalid inputPath')
                }
                
                if (!cropBounds || typeof cropBounds !== 'object') {
                    throw new Error('Invalid cropBounds')
                }
                
                if (!fs.existsSync(inputPath)) {
                    throw new Error('Input video file not found: ' + inputPath)
                }

                // Create output path
                const tempDir = os.tmpdir()
                const outputPath = path.join(tempDir, `snaplark-cropped-${Date.now()}.webm`)
                console.log('Backend: Output path:', outputPath)

                // Get video metadata first
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(inputPath, (err, data) => {
                        if (err) reject(err)
                        else resolve(data)
                    })
                })

                const videoStream = metadata.streams.find(s => s.codec_type === 'video')
                if (!videoStream) {
                    throw new Error('No video stream found')
                }

                const actualVideoWidth = videoStream.width
                const actualVideoHeight = videoStream.height

                // Calculate scale factors
                const scaleX = actualVideoWidth / displayWidth
                const scaleY = actualVideoHeight / displayHeight

                // Calculate crop coordinates in video space
                const cropX = Math.round(cropBounds.left * scaleX)
                const cropY = Math.round(cropBounds.top * scaleY)
                const cropWidth = Math.round(cropBounds.width * scaleX)
                const cropHeight = Math.round(cropBounds.height * scaleY)

                // Ensure even dimensions (required for some codecs)
                const finalCropWidth = cropWidth % 2 === 0 ? cropWidth : cropWidth - 1
                const finalCropHeight = cropHeight % 2 === 0 ? cropHeight : cropHeight - 1

                console.log('FFmpeg crop params:', {
                    input: { width: actualVideoWidth, height: actualVideoHeight },
                    viewport: { width: displayWidth, height: displayHeight },
                    scale: { x: scaleX, y: scaleY },
                    crop: { x: cropX, y: cropY, width: finalCropWidth, height: finalCropHeight }
                })

                // Crop video with FFmpeg
                await new Promise((resolve, reject) => {
                    let progress = 0
                    
                    ffmpeg(inputPath)
                        .videoCodec('libvpx-vp9') // VP9 codec for WebM
                        .videoBitrate('5000k') // High quality
                        .outputOptions([
                            '-cpu-used 4', // Faster encoding (0=slowest/best, 5=fastest/good)
                            '-deadline realtime', // Real-time encoding
                            '-row-mt 1', // Enable row-based multi-threading
                            `-vf crop=${finalCropWidth}:${finalCropHeight}:${cropX}:${cropY}` // Crop filter
                        ])
                        .on('progress', (info) => {
                            if (info.percent) {
                                progress = Math.round(info.percent)
                                // Send progress to renderer
                                event.sender.send('ffmpeg-progress', progress)
                            }
                        })
                        .on('end', () => {
                            console.log('FFmpeg cropping completed')
                            resolve()
                        })
                        .on('error', (err) => {
                            console.error('FFmpeg error:', err)
                            reject(err)
                        })
                        .save(outputPath)
                })

                // Return the output path instead of buffer
                return {
                    success: true,
                    outputPath: outputPath,
                    inputPath: inputPath // Return for cleanup later
                }
            } catch (error) {
                console.error('FFmpeg crop error:', error)
                return {
                    success: false,
                    error: error.message || 'Failed to crop video'
                }
            }
        })

        // Get file size
        ipcMain.handle('get-file-size', async (event, filePath) => {
            try {
                if (!fs.existsSync(filePath)) {
                    throw new Error('File not found')
                }
                const stats = fs.statSync(filePath)
                return { success: true, size: stats.size }
            } catch (error) {
                console.error('Error getting file size:', error)
                return { success: false, error: error.message }
            }
        })

        // Read file chunk (streaming approach - memory efficient)
        ipcMain.handle('read-file-chunk', async (event, { filePath, start, length }) => {
            try {
                if (!fs.existsSync(filePath)) {
                    throw new Error('File not found')
                }
                
                const fd = fs.openSync(filePath, 'r')
                const buffer = Buffer.alloc(length)
                const bytesRead = fs.readSync(fd, buffer, 0, length, start)
                fs.closeSync(fd)
                
                // Return as regular array for IPC compatibility
                const chunk = Array.from(buffer.slice(0, bytesRead))
                return { success: true, chunk, bytesRead }
            } catch (error) {
                console.error('Error reading file chunk:', error)
                return { success: false, error: error.message }
            }
        })

        // Cleanup temp files
        ipcMain.handle('cleanup-temp-files', async (event, filePaths) => {
            try {
                for (const filePath of filePaths) {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath)
                        console.log('Cleaned up temp file:', filePath)
                    }
                }
                return { success: true }
            } catch (error) {
                console.error('Error cleaning up temp files:', error)
                return { success: false, error: error.message }
            }
        })
    }
}

export default FFmpegService

