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
      },
    }),
  ],
});
