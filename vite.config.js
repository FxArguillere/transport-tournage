import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const stamp = new Date().toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', dateStyle: 'short', timeStyle: 'short' })

export default defineConfig({
  base: '/transport-tournage/',
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version} · ${stamp}`) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Transport tournage',
        short_name: 'Transport',
        description: 'Déclaration des trajets des équipes de tournage',
        lang: 'fr',
        theme_color: '#1d4ed8',
        background_color: '#f3f4f6',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
