import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: [
                // Mark FFmpeg packages as external (don't bundle them)
                'fluent-ffmpeg',
                '@ffmpeg-installer/ffmpeg',
                '@ffprobe-installer/ffprobe',
                /^@ffmpeg-installer\/.*/,
                /^@ffprobe-installer\/.*/
            ]
        }
    }
});
