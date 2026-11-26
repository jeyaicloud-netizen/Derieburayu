import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const ROOT_STATIC_ASSETS: Record<string, string> = {
  'manifest.json': 'application/manifest+json; charset=utf-8',
  'icon.svg': 'image/svg+xml',
  'apple-touch-icon.png': 'image/png',
  'pwa-192x192.png': 'image/png',
  'pwa-512x512.png': 'image/png',
  'pwa-maskable-512x512.png': 'image/png',
};

export default defineConfig(() => {
  return {
    base: '/',
    publicDir: false,
    build: {
      outDir: 'dist',
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'serve-and-copy-root-pwa-assets',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const urlPath = (req.url || '').split('?')[0].replace(/^\/+/, '');
            const contentType = ROOT_STATIC_ASSETS[urlPath];
            if (!contentType) {
              next();
              return;
            }
            const filePath = path.resolve(__dirname, urlPath);
            if (!fs.existsSync(filePath)) {
              next();
              return;
            }
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'no-cache');
            res.end(fs.readFileSync(filePath));
          });
        },
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) {
            return;
          }
          for (const filename of Object.keys(ROOT_STATIC_ASSETS)) {
            const srcFile = path.resolve(__dirname, filename);
            const destFile = path.resolve(distDir, filename);
            if (fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, destFile);
            }
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        useCredentials: false,
        manifest: {
          id: '/',
          name: 'PersistentUssdCast PWA',
          short_name: 'UssdCast',
          description:
            'Zero-APK Installable PWA with Background Keep-Alive & WebRTC Screen Cast for Android 8-16.',
          theme_color: '#0f766e',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
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
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],
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
          navigateFallbackAllowlist: [/^\/$/],
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
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
