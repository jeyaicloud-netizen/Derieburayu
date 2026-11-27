import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';

import * as archiver from 'archiver';

const PORT = 3000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/download-bridge', (_req, res) => {
    const bridgeDir = path.resolve(process.cwd(), 'android-bridge');
    if (!fs.existsSync(bridgeDir)) {
      res.status(404).send('Android bridge directory not found');
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=ussdcast-android-bridge.zip');

    const archive = (archiver as any)('zip', { zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
      res.status(500).send({ error: err.message });
    });
    archive.pipe(res);
    archive.directory(bridgeDir, 'android-bridge');
    archive.finalize();
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
