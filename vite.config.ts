import {defineConfig} from 'vite'

export default defineConfig({
    build: {
        target: 'esnext',
        minify: false,
        outDir: 'dist'
    },
    base: './'
})
