import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  plugins: [tailwindcss()],
  define: {
    __LOCAL_WINDOWS_DOWNLOAD__: JSON.stringify(existsSync(new URL('./public/downloads/Lone-X-Windows.zip', import.meta.url)))
  }
})
