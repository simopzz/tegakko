import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest is served statically from public/manifest.webmanifest
      // (linked directly from index.html) rather than generated here.
      manifest: false,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,webmanifest,png,svg}'],
        runtimeCaching: [
          {
            // The reference font (Yuji Syuku) is sliced by Google Fonts, so
            // whatever slices a device has already loaded online keep
            // working offline. shortcut: a kanji whose font slice was never
            // loaded online falls back to a system font offline; self-host
            // a subset of the reference font if that looks wrong in practice.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts' },
          },
        ],
      },
    }),
  ],
});
