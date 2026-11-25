import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    build: {
      outDir: 'dist',
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        useCredentials: true,
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Tiny Note & APK Signer',
          short_name: 'Tiny Note',
          description:
            'Offline-capable notepad PWA and Android 11-16 APK v1/v2/v3 signer.',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          share_target: {
            action: '/note',
            method: 'GET',
            params: {
              title: 'title',
              text: 'text',
            },
          },
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/app\//, /^\/i\//, /^\/d\//, /^\/d1\//, /^\/\.well-known\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallbackAllowlist: [/^\/$/, /^\/note/, /^\/app1/, /^\/app2/, /^\/t\//, /^\/w/, /^\/a\//],
        },
      }),
      {
        name: 'fix-vite8-pwa-dev-sw',
        apply: 'serve',
        enforce: 'post',
        transform(code: string, id: string) {
          if (!id.includes('pwa-entry-point-loaded')) {
            return null;
          }
          const guardedCode = code
            .replace(/import\.meta\.hot\.on\(/g, 'import.meta.hot?.on(')
            .replace(
              /function registerDevSW\(\)\s*\{[\s\S]*?\n\}/,
              `function registerDevSW() {
  if (!import.meta.hot) return;
  let sent = false;
  import.meta.hot.on('vite:ws:connect', (data) => {
    if (sent) return;
    const socket = data && data.webSocket;
    if (!socket || socket.readyState !== 1) return;
    sent = true;
    setTimeout(() => {
      try {
        if (socket.readyState === 1) {
          import.meta.hot?.send('vite-pwa-plugin:dev-ready');
        }
      } catch {
        // Ignore if socket closes before send runs
      }
    }, 0);
  });
}`,
            );
          return guardedCode === code ? null : {code: guardedCode, map: null};
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
