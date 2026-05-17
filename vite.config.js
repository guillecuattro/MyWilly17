import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'MyWilly — Panel de inversiones',
        short_name: 'MyWilly',
        description: 'Tu panel de inversiones personal',
        theme_color: '#0F1117',
        background_color: '#0F1117',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon_app_192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon_app_512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon_app_1024.png', sizes: '1024x1024', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ]
})
