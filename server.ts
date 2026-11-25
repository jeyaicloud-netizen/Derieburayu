import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { getSigningCertInfo, signApkBuffer } from './server/apkSigner.ts';
import {
  BRIDGE_ROOM_RE as SHARED_BRIDGE_ROOM_RE,
  escapeHtml as sharedEscapeHtml,
  parseExternalRelayUrl,
  registerCustomShortRelay,
  resolveServerSideRelay,
  resolveShortCodeRelay,
  SHORT_CODE_RE,
} from './server/relayUtils.ts';
import {
  buildStandaloneApp1Html,
  buildStandaloneTinyHtml,
} from './server/standaloneApps.ts';

const PORT = 3000;
const MAX_APK_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CACHED_DOWNLOADS = 30;
const MAX_TOTAL_CACHE_BYTES = 250 * 1024 * 1024;

interface CachedDownload {
  buffer: Buffer;
  filename: string;
  packageName: string | null;
  targetSdk: number | null;
  minSdk: number | null;
  sha256Fingerprint: string;
  createdAt: number;
}

const downloadStore = new Map<string, CachedDownload>();
const APK_DISK_DIR = path.join(os.tmpdir(), 'tinyconnect-signed-apks');
const PREBUILT_APK_DIR = path.resolve(process.cwd(), 'server', 'prebuilt');
const PREBUILT_APK_PATH = path.join(PREBUILT_APK_DIR, 'TinyNote.apk');
const PREBUILT_META_PATH = path.join(PREBUILT_APK_DIR, 'TinyNote.json');
const APK_SHORT_ID_RE = /^[a-z0-9]{4,16}$/i;

interface PersistedApkMeta {
  shortId: string;
  filename: string;
  packageName: string | null;
  targetSdk: number | null;
  minSdk: number | null;
  sha256Fingerprint: string;
  createdAt: number;
}

function loadPrebuiltApkMeta(): PersistedApkMeta | null {
  try {
    if (!fs.existsSync(PREBUILT_APK_PATH) || !fs.existsSync(PREBUILT_META_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(PREBUILT_META_PATH, 'utf8')) as Partial<PersistedApkMeta>;
    return {
      shortId: typeof raw.shortId === 'string' && APK_SHORT_ID_RE.test(raw.shortId) ? raw.shortId : 'tiny',
      filename: 'TinyNote.apk',
      packageName: typeof raw.packageName === 'string' ? raw.packageName : 'com.amh.tinynote',
      targetSdk: typeof raw.targetSdk === 'number' ? raw.targetSdk : 35,
      minSdk: typeof raw.minSdk === 'number' ? raw.minSdk : 21,
      sha256Fingerprint: typeof raw.sha256Fingerprint === 'string' ? raw.sha256Fingerprint : '',
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function loadPrebuiltApk(): { meta: PersistedApkMeta; buffer: Buffer } | null {
  try {
    const meta = loadPrebuiltApkMeta();
    if (!meta || !fs.existsSync(PREBUILT_APK_PATH)) return null;
    const buffer = fs.readFileSync(PREBUILT_APK_PATH);
    return { meta, buffer };
  } catch {
    return null;
  }
}

function ensureApkDiskDir() {
  try {
    fs.mkdirSync(APK_DISK_DIR, { recursive: true });
  } catch {}
}

function savePersistedApk(shortId: string, item: CachedDownload) {
  try {
    ensureApkDiskDir();
    const meta: PersistedApkMeta = {
      shortId,
      filename: item.filename,
      packageName: item.packageName,
      targetSdk: item.targetSdk,
      minSdk: item.minSdk,
      sha256Fingerprint: item.sha256Fingerprint,
      createdAt: item.createdAt,
    };
    fs.writeFileSync(path.join(APK_DISK_DIR, `${shortId}.apk`), item.buffer);
    fs.writeFileSync(path.join(APK_DISK_DIR, `${shortId}.json`), JSON.stringify(meta), 'utf8');
    fs.writeFileSync(path.join(APK_DISK_DIR, 'latest.json'), JSON.stringify(meta), 'utf8');
    if (item.packageName === 'com.amh.tinynote') {
      fs.writeFileSync(path.join(APK_DISK_DIR, 'tiny.json'), JSON.stringify(meta), 'utf8');
    }
  } catch {}
}

function loadPersistedApk(idOrAlias: string): { meta: PersistedApkMeta; buffer: Buffer } | null {
  try {
    ensureApkDiskDir();
    const cleaned = idOrAlias.replace(/\.apk$/i, '');
    let metaPath: string | null = null;
    if (cleaned === 'latest' || cleaned === 'tiny') {
      const aliasPath = path.join(APK_DISK_DIR, `${cleaned}.json`);
      const fallbackPath = path.join(APK_DISK_DIR, 'latest.json');
      metaPath = fs.existsSync(aliasPath) ? aliasPath : fs.existsSync(fallbackPath) ? fallbackPath : null;
    } else if (APK_SHORT_ID_RE.test(cleaned)) {
      const directPath = path.join(APK_DISK_DIR, `${cleaned}.json`);
      if (fs.existsSync(directPath)) metaPath = directPath;
    }
    if (metaPath) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as PersistedApkMeta;
      if (meta && APK_SHORT_ID_RE.test(meta.shortId)) {
        const apkPath = path.join(APK_DISK_DIR, `${meta.shortId}.apk`);
        if (fs.existsSync(apkPath)) {
          const buffer = fs.readFileSync(apkPath);
          return {
            meta: cleaned === 'tiny' ? { ...meta, filename: 'TinyNote.apk' } : meta,
            buffer,
          };
        }
      }
    }
  } catch {}

  const prebuiltMeta = loadPrebuiltApkMeta();
  const cleaned = idOrAlias.replace(/\.apk$/i, '');
  if (
    prebuiltMeta &&
    (cleaned === 'tiny' || cleaned === 'latest' || cleaned === prebuiltMeta.shortId)
  ) {
    return loadPrebuiltApk();
  }
  return null;
}

function loadLatestApkMeta(): PersistedApkMeta | null {
  try {
    ensureApkDiskDir();
    const tinyPath = path.join(APK_DISK_DIR, 'tiny.json');
    const latestPath = path.join(APK_DISK_DIR, 'latest.json');
    const chosen = fs.existsSync(tinyPath) ? tinyPath : fs.existsSync(latestPath) ? latestPath : null;
    if (chosen) {
      const meta = JSON.parse(fs.readFileSync(chosen, 'utf8')) as PersistedApkMeta;
      if (
        meta &&
        APK_SHORT_ID_RE.test(meta.shortId) &&
        fs.existsSync(path.join(APK_DISK_DIR, `${meta.shortId}.apk`))
      ) {
        return meta;
      }
    }
  } catch {}

  return loadPrebuiltApkMeta();
}

interface CachedScreenshot {
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  createdAt: number;
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_SCREENSHOTS = 20;
const MAX_SCREENSHOT_CACHE_BYTES = 40 * 1024 * 1024;
const screenshotStore = new Map<string, CachedScreenshot>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function detectImageMimeType(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function pruneScreenshots() {
  const now = Date.now();
  let totalBytes = 0;
  for (const [token, item] of screenshotStore.entries()) {
    if (now - item.createdAt > SCREENSHOT_TTL_MS) {
      screenshotStore.delete(token);
    } else {
      totalBytes += item.buffer.length;
    }
  }
  while (screenshotStore.size >= MAX_CACHED_SCREENSHOTS || totalBytes > MAX_SCREENSHOT_CACHE_BYTES) {
    const oldestKey = screenshotStore.keys().next().value;
    if (!oldestKey) break;
    const removed = screenshotStore.get(oldestKey);
    if (removed) totalBytes -= removed.buffer.length;
    screenshotStore.delete(oldestKey);
  }
}

type BridgeAction = 'append' | 'replace' | 'clear' | 'edit' | 'screenshot' | 'ussd' | 'home' | 'launch' | 'cast' | 'stop';
const BRIDGE_ACTIONS = new Set<BridgeAction>([
  'append',
  'replace',
  'clear',
  'edit',
  'screenshot',
  'ussd',
  'home',
  'launch',
  'cast',
  'stop',
]);
const BRIDGE_ROOM_RE = /^[a-zA-Z0-9_-]{12,64}$/;
const USSD_CODE_RE = /^[0-9*#+]{2,32}$/;
const BRIDGE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BRIDGE_ROOMS = 200;

interface BridgeCommand {
  id: string;
  action: BridgeAction;
  text: string;
  code?: string;
  createdAt: number;
}

interface BridgeResult {
  id: string;
  status: 'ok' | 'denied' | 'cancelled' | 'cast-live';
  text: string;
  screenshotUrl?: string;
  createdAt: number;
}

interface BridgeRoom {
  roomId: string;
  createdAt: number;
  updatedAt: number;
  latestCommand: BridgeCommand | null;
  latestResult: BridgeResult | null;
  listeners: Set<express.Response>;
}

const bridgeRooms = new Map<string, BridgeRoom>();

function pruneBridgeRooms() {
  const now = Date.now();
  for (const [roomId, room] of bridgeRooms.entries()) {
    if (now - room.updatedAt > BRIDGE_TTL_MS && room.listeners.size === 0) {
      bridgeRooms.delete(roomId);
    }
  }
  while (bridgeRooms.size >= MAX_BRIDGE_ROOMS) {
    const oldestKey = bridgeRooms.keys().next().value;
    if (!oldestKey) break;
    const oldRoom = bridgeRooms.get(oldestKey);
    if (oldRoom) {
      for (const listener of oldRoom.listeners) {
        try {
          listener.end();
        } catch {}
      }
      oldRoom.listeners.clear();
    }
    bridgeRooms.delete(oldestKey);
  }
}

function getOrCreateBridgeRoom(roomId: string): BridgeRoom {
  pruneBridgeRooms();
  let room = bridgeRooms.get(roomId);
  if (!room) {
    const now = Date.now();
    room = {
      roomId,
      createdAt: now,
      updatedAt: now,
      latestCommand: null,
      latestResult: null,
      listeners: new Set(),
    };
    bridgeRooms.set(roomId, room);
  }
  return room;
}

function broadcastBridgeEvent(room: BridgeRoom, eventName: string, payload: unknown) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of room.listeners) {
    try {
      res.write(data);
    } catch {
      room.listeners.delete(res);
    }
  }
}

function sanitizeOptionalScreenshotUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return undefined;
  if (/^\/api\/screenshot\/[0-9a-f-]{36}$/i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' && /^\/api\/screenshot\/[0-9a-f-]{36}$/i.test(parsed.pathname)) {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function pruneDownloads() {
  const now = Date.now();
  let totalBytes = 0;
  for (const [token, item] of downloadStore.entries()) {
    if (now - item.createdAt > DOWNLOAD_TTL_MS) {
      downloadStore.delete(token);
    } else {
      totalBytes += item.buffer.length;
    }
  }
  while (downloadStore.size >= MAX_CACHED_DOWNLOADS || totalBytes > MAX_TOTAL_CACHE_BYTES) {
    const oldestKey = downloadStore.keys().next().value;
    if (!oldestKey) break;
    const removed = downloadStore.get(oldestKey);
    if (removed) totalBytes -= removed.buffer.length;
    downloadStore.delete(oldestKey);
  }
}

function sanitizeApkFilename(raw: unknown): string {
  const str = typeof raw === 'string' ? raw : 'app.apk';
  const base = path.basename(str).replace(/[^a-zA-Z0-9._-]/g, '_');
  const stem = base.replace(/\.apk$/i, '').replace(/^-+/, '') || 'app';
  return `${stem.slice(0, 64)}-v2-signed.apk`;
}

function renderFastDownloadPage(token: string, item: CachedDownload): string {
  const safeName = escapeHtml(item.filename);
  const safePkg = escapeHtml(item.packageName || 'Android Package');
  const safeSize = escapeHtml(formatBytes(item.buffer.length));
  const safeSdk =
    item.minSdk !== null || item.targetSdk !== null
      ? `API ${item.minSdk ?? '?'} – ${item.targetSdk ?? '?'}`
      : 'Android 11–16';
  const safeFp = escapeHtml(item.sha256Fingerprint);
  const dlHref = `/api/download/${encodeURIComponent(token)}`;

  return `<!doctype html>
<html lang="am">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeName}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;padding:20px}
.wrap{max-width:460px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px}
h1{margin:0 0 6px;font-size:20px;line-height:1.3;word-break:break-word}
.sub{margin:0 0 18px;font-size:13px;color:#475569;font-family:ui-monospace,monospace}
.rows{border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;margin:0 0 20px}
.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;font-size:13px;border-bottom:1px solid #f8fafc}
.row:last-child{border-bottom:0}
.k{color:#64748b}
.v{color:#0f172a;font-weight:600;text-align:right;font-family:ui-monospace,monospace}
.fp{font-size:11px;color:#475569;word-break:break-all;font-family:ui-monospace,monospace;margin:0 0 20px;line-height:1.5}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;font-size:15px;border-radius:12px}
.btn:active{background:#115e59}
.hint{margin:14px 0 0;font-size:13px;color:#475569;line-height:1.5}
</style>
</head>
<body>
<main class="wrap">
<h1>${safeName}</h1>
<p class="sub">${safePkg} · ${escapeHtml(safeSdk)}</p>
<div class="rows">
  <div class="row"><span class="k">መጠን / Size</span><span class="v">${safeSize}</span></div>
  <div class="row"><span class="k">ፊርማ / Signatures</span><span class="v">v1 · v2 · v3</span></div>
</div>
<p class="fp">SHA-256: ${safeFp}</p>
<a class="btn" href="${dlHref}" download="${safeName}">Install APK (${safeSize})</a>
<p class="hint">ማውረዱ ራሱ ካልጀመረ ከላይ ያለውን ቁልፍ ይንኩ፤ ከወረደ በኋላ <strong>Open</strong> ሲነኩ ቀጥታ ወደ Android Install ይሄዳል።</p>
</main>
<script>setTimeout(function(){window.location.href=${JSON.stringify(dlHref)};},150);</script>
</body>
</html>`;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  function resolveRequestOrigin(req: express.Request): string {
    const xfProto = req.header('x-forwarded-proto');
    const proto = xfProto ? xfProto.split(',')[0].trim() : req.protocol || 'https';
    const host = req.get('host') || `127.0.0.1:${PORT}`;
    return `${proto}://${host}`;
  }

  function buildManifestQuery(req: express.Request): string {
    const params = new URLSearchParams();
    const rawRelay = typeof req.query.relay === 'string' ? req.query.relay : '';
    const rawRoom = typeof req.query.room === 'string' ? req.query.room : '';
    const validRelay = rawRelay ? parseExternalRelayUrl(rawRelay) : null;
    if (validRelay) {
      params.set('relay', validRelay.displayUrl);
    } else if (rawRoom && SHARED_BRIDGE_ROOM_RE.test(rawRoom.trim())) {
      params.set('room', rawRoom.trim());
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  app.post('/api/short-link', express.json({ limit: '16kb' }), (req, res) => {
    const rawUrl = req.body && typeof req.body.relayUrl === 'string' ? req.body.relayUrl : '';
    const code = registerCustomShortRelay(rawUrl);
    if (!code) {
      res.status(400).json({ error: 'Invalid external relay URL.' });
      return;
    }
    res.json({ code });
  });

  app.get('/api/short-link/:code', (req, res) => {
    const origin = resolveRequestOrigin(req);
    const relay = resolveShortCodeRelay(req.params.code, origin);
    if (!relay) {
      res.status(404).json({ error: 'Short link code not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ relayUrl: relay.displayUrl, kind: relay.kind });
  });

  app.get('/api/manifest/app1.webmanifest', (req, res) => {
    const rawA = typeof req.query.a === 'string' && SHORT_CODE_RE.test(req.query.a) ? req.query.a : null;
    const qs = buildManifestQuery(req);
    const startUrl = rawA ? `/a/${rawA}` : `/app1${qs}`;
    const scope = rawA ? '/a/' : '/app1';
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      id: rawA ? `/a/${rawA}` : '/app1',
      name: 'App 1 Controller',
      short_name: 'App 1',
      description: 'Remote controller to send USSD (*804#), text edits, and screenshot commands to Tiny Note (>20km).',
      theme_color: '#0f766e',
      background_color: '#f8fafc',
      display: 'standalone',
      start_url: startUrl,
      scope,
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });

  app.get('/api/manifest/tiny.webmanifest', (req, res) => {
    const rawW = typeof req.query.w === 'string' ? req.query.w : null;
    const validWCode = rawW && SHORT_CODE_RE.test(rawW) ? rawW : null;
    const rawT = typeof req.query.t === 'string' && SHORT_CODE_RE.test(req.query.t) ? req.query.t : null;
    const qs = buildManifestQuery(req);
    const startUrl = validWCode
      ? `/w/${validWCode}`
      : rawW
      ? `/w${qs}`
      : rawT
      ? `/t/${rawT}`
      : `/note${qs}`;
    const scope = validWCode || rawW ? '/w' : rawT ? '/t/' : '/note';
    const appId = validWCode ? `/w/${validWCode}` : rawW ? '/w' : rawT ? `/t/${rawT}` : '/note';
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      id: appId,
      name: 'Tiny Note',
      short_name: 'Tiny Note',
      description: 'Offline note & >20km remote receiver with explicit USSD and screenshot permission prompts.',
      theme_color: '#0f766e',
      background_color: '#f8fafc',
      display: 'standalone',
      start_url: startUrl,
      scope,
      share_target: {
        action: '/note',
        method: 'GET',
        params: { title: 'title', text: 'text' },
      },
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });

  app.get('/d/:code', (req, res) => {
    const origin = resolveRequestOrigin(req);
    const relay = resolveShortCodeRelay(req.params.code, origin) ?? resolveServerSideRelay(null, origin, null);
    const html = buildStandaloneTinyHtml(relay, origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Tiny.html"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  app.get('/d1/:code', (req, res) => {
    const origin = resolveRequestOrigin(req);
    const relay = resolveShortCodeRelay(req.params.code, origin) ?? resolveServerSideRelay(null, origin, null);
    const safeCode = SHORT_CODE_RE.test(req.params.code) ? req.params.code : '';
    const tinyUrl = safeCode ? `${origin}/t/${safeCode}` : `${origin}/note`;
    const html = buildStandaloneApp1Html(relay, tinyUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="App1.html"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  app.get('/api/download-app1', (req, res) => {
    const origin = resolveRequestOrigin(req);
    const rawRelay = typeof req.query.relay === 'string' ? req.query.relay : null;
    const rawRoom = typeof req.query.room === 'string' ? req.query.room : null;
    const rawCode = typeof req.query.c === 'string' ? req.query.c : null;
    const relay =
      (rawCode ? resolveShortCodeRelay(rawCode, origin) : null) ??
      resolveServerSideRelay(rawRelay, origin, rawRoom);
    const shortCode = registerCustomShortRelay(relay.displayUrl);
    const qs = buildManifestQuery(req);
    const tinyInstallUrl = shortCode
      ? `${origin}/t/${shortCode}`
      : `${origin}/note${qs ? `${qs}&install=1` : '?install=1'}`;
    const html = buildStandaloneApp1Html(relay, tinyInstallUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="App1.html"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  app.get('/api/download-tiny', (req, res) => {
    const origin = resolveRequestOrigin(req);
    const rawRelay = typeof req.query.relay === 'string' ? req.query.relay : null;
    const rawRoom = typeof req.query.room === 'string' ? req.query.room : null;
    const rawCode = typeof req.query.c === 'string' ? req.query.c : null;
    const relay =
      (rawCode ? resolveShortCodeRelay(rawCode, origin) : null) ??
      resolveServerSideRelay(rawRelay, origin, rawRoom);
    const html = buildStandaloneTinyHtml(relay, origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Tiny.html"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  app.get('/.well-known/assetlinks.json', (_req, res) => {
    try {
      const { sha256Fingerprint } = getSigningCertInfo();
      const prebuiltMeta = loadPrebuiltApkMeta();
      const fingerprints = Array.from(
        new Set(
          [sha256Fingerprint, prebuiltMeta?.sha256Fingerprint].filter(
            (fp): fp is string => typeof fp === 'string' && fp.length > 0
          )
        )
      );
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.amh.tinynote',
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]);
    } catch {
      res.status(500).json({ error: 'Unable to load certificate fingerprint.' });
    }
  });

  app.get('/api/cert-info', (_req, res) => {
    try {
      res.json(getSigningCertInfo());
    } catch {
      res.status(500).json({ error: 'Unable to initialize signing certificate.' });
    }
  });

  app.post(
    '/api/screenshot',
    express.raw({
      type: ['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'],
      limit: MAX_SCREENSHOT_BYTES,
    }),
    (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length < 16) {
        res.status(400).json({ error: 'Please provide a valid PNG, JPEG, or WebP screenshot.' });
        return;
      }
      const mimeType = detectImageMimeType(req.body);
      if (!mimeType) {
        res.status(400).json({ error: 'Unsupported image format. Only PNG, JPEG, and WebP are allowed.' });
        return;
      }

      pruneScreenshots();
      const token = crypto.randomUUID();
      screenshotStore.set(token, {
        buffer: req.body,
        mimeType,
        createdAt: Date.now(),
      });

      res.json({
        token,
        screenshotUrl: `/api/screenshot/${token}`,
        mimeType,
        size: req.body.length,
        expiresInSeconds: Math.floor(SCREENSHOT_TTL_MS / 1000),
      });
    }
  );

  app.get('/api/screenshot/:token', (req, res) => {
    pruneScreenshots();
    const { token } = req.params;
    if (!UUID_RE.test(token)) {
      res.status(404).json({ error: 'Screenshot not found or expired.' });
      return;
    }
    const item = screenshotStore.get(token);
    if (!item) {
      res.status(404).json({ error: 'Screenshot not found or expired.' });
      return;
    }
    res.setHeader('Content-Type', item.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(item.buffer.length));
    res.send(item.buffer);
  });

  app.use('/api/bridge', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.post('/api/bridge/create', (_req, res) => {
    const roomId = crypto.randomBytes(12).toString('hex');
    const room = getOrCreateBridgeRoom(roomId);
    res.json({
      roomId: room.roomId,
      tinyConnectPath: `/note?room=${room.roomId}`,
      commandPath: `/api/bridge/${room.roomId}/command`,
      resultPath: `/api/bridge/${room.roomId}/result`,
      statePath: `/api/bridge/${room.roomId}/state`,
      eventsPath: `/api/bridge/${room.roomId}/events`,
      expiresInSeconds: Math.floor(BRIDGE_TTL_MS / 1000),
    });
  });

  app.get('/api/bridge/:roomId/state', (req, res) => {
    const { roomId } = req.params;
    if (!BRIDGE_ROOM_RE.test(roomId)) {
      res.status(400).json({ error: 'Invalid bridge room ID.' });
      return;
    }
    const room = getOrCreateBridgeRoom(roomId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      roomId: room.roomId,
      updatedAt: room.updatedAt,
      latestCommand: room.latestCommand,
      latestResult: room.latestResult,
    });
  });

  app.get('/api/bridge/:roomId/events', (req, res) => {
    const { roomId } = req.params;
    if (!BRIDGE_ROOM_RE.test(roomId)) {
      res.status(400).json({ error: 'Invalid bridge room ID.' });
      return;
    }
    const room = getOrCreateBridgeRoom(roomId);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    room.listeners.add(res);
    res.write(
      `event: state\ndata: ${JSON.stringify({
        roomId: room.roomId,
        updatedAt: room.updatedAt,
        latestCommand: room.latestCommand,
        latestResult: room.latestResult,
      })}\n\n`
    );

    const pingId = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingId);
        room.listeners.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(pingId);
      room.listeners.delete(res);
    });
  });

  app.post(
    '/api/bridge/:roomId/command',
    express.json({ limit: '128kb' }),
    (req, res) => {
      const { roomId } = req.params;
      if (!BRIDGE_ROOM_RE.test(roomId)) {
        res.status(400).json({ error: 'Invalid bridge room ID.' });
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const action = typeof body.action === 'string' ? (body.action as BridgeAction) : 'edit';
      if (!BRIDGE_ACTIONS.has(action)) {
        res.status(400).json({ error: 'Unsupported bridge action.' });
        return;
      }
      const text = typeof body.text === 'string' ? body.text.slice(0, 65535) : '';
      let code: string | undefined;
      if (action === 'ussd') {
        const rawCode = typeof body.code === 'string' ? body.code.trim() : text.trim();
        if (!USSD_CODE_RE.test(rawCode)) {
          res.status(400).json({ error: 'Invalid USSD code format (digits, *, #, + only).' });
          return;
        }
        code = rawCode;
      }

      const room = getOrCreateBridgeRoom(roomId);
      const now = Date.now();
      const command: BridgeCommand = {
        id: crypto.randomUUID(),
        action,
        text,
        code,
        createdAt: now,
      };
      room.latestCommand = command;
      room.updatedAt = now;
      broadcastBridgeEvent(room, 'command', command);
      res.json({ ok: true, command });
    }
  );

  app.post(
    '/api/bridge/:roomId/result',
    express.json({ limit: '128kb' }),
    (req, res) => {
      const { roomId } = req.params;
      if (!BRIDGE_ROOM_RE.test(roomId)) {
        res.status(400).json({ error: 'Invalid bridge room ID.' });
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawStatus = typeof body.status === 'string' ? body.status : 'ok';
      const status: 'ok' | 'denied' | 'cancelled' | 'cast-live' =
        rawStatus === 'denied' || rawStatus === 'cancelled' || rawStatus === 'cast-live'
          ? rawStatus
          : 'ok';
      const text = typeof body.text === 'string' ? body.text.slice(0, 65535) : '';
      const screenshotUrl = sanitizeOptionalScreenshotUrl(body.screenshotUrl);

      const room = getOrCreateBridgeRoom(roomId);
      const now = Date.now();
      const resultPayload: BridgeResult = {
        id: crypto.randomUUID(),
        status,
        text,
        screenshotUrl,
        createdAt: now,
      };
      room.latestResult = resultPayload;
      room.updatedAt = now;
      broadcastBridgeEvent(room, 'result', resultPayload);
      res.json({ ok: true, result: resultPayload });
    }
  );

  app.post(
    '/api/sign-apk',
    express.raw({
      type: ['application/octet-stream', 'application/vnd.android.package-archive'],
      limit: MAX_APK_BYTES,
    }),
    (req, res) => {
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length < 22) {
          res.status(400).json({ error: 'Please upload a valid .apk file.' });
          return;
        }

        const result = signApkBuffer(req.body);
        pruneDownloads();

        const token = crypto.randomUUID();
        const shortId = crypto.randomBytes(4).toString('hex');
        const filename = sanitizeApkFilename(req.header('x-file-name'));
        const cachedItem: CachedDownload = {
          buffer: result.signedBuffer,
          filename,
          packageName: result.packageName,
          targetSdk: result.targetSdk,
          minSdk: result.minSdk,
          sha256Fingerprint: result.certInfo.sha256Fingerprint,
          createdAt: Date.now(),
        };
        downloadStore.set(token, cachedItem);
        savePersistedApk(shortId, cachedItem);

        res.json({
          token,
          shortId,
          downloadUrl: `/api/download/${token}`,
          sharePageUrl: `/app/${token}`,
          directApkInstallUrl: `/i/${shortId}.apk`,
          filename,
          originalSize: result.originalSize,
          signedSize: result.signedSize,
          entryCount: result.entryCount,
          hadOldSignature: result.hadOldSignature,
          resourcesAligned: result.resourcesAligned,
          packageName: result.packageName,
          targetSdk: result.targetSdk,
          minSdk: result.minSdk,
          schemesApplied: result.schemesApplied,
          certInfo: result.certInfo,
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to sign the uploaded APK file.';
        res.status(400).json({ error: message });
      }
    }
  );

  app.get('/api/latest-apk', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const meta = loadLatestApkMeta();
    if (!meta) {
      res.json({ available: false });
      return;
    }
    const isTiny = meta.packageName === 'com.amh.tinynote' || meta.shortId === 'tiny';
    res.json({
      available: true,
      shortId: isTiny ? 'tiny' : meta.shortId,
      filename: isTiny ? 'TinyNote.apk' : meta.filename,
      packageName: meta.packageName,
      directApkInstallUrl: isTiny ? '/i/tiny.apk' : `/i/${meta.shortId}.apk`,
    });
  });

  app.get('/i/:shortId', (req, res) => {
    const loaded = loadPersistedApk(req.params.shortId);
    if (!loaded) {
      res.status(404).type('html').send('<p>APK not found. Sign the APK first in TinyAPK Signer.</p>');
      return;
    }
    const { meta, buffer } = loaded;
    const total = buffer.length;
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');

    const rangeHeader = req.headers.range;
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const [startStr, endStr] = rangeHeader.slice(6).split('-');
      const start = startStr ? Number.parseInt(startStr, 10) : 0;
      const end = endStr ? Number.parseInt(endStr, 10) : total - 1;
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end >= total ||
        start > end
      ) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      const chunk = buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.send(chunk);
      return;
    }

    res.setHeader('Content-Length', String(total));
    res.send(buffer);
  });

  app.get('/app/:token', (req, res) => {
    pruneDownloads();
    const { token } = req.params;
    if (!UUID_RE.test(token)) {
      res.status(404).type('html').send('<p>Download link not found.</p>');
      return;
    }
    const item = downloadStore.get(token);
    if (!item) {
      res
        .status(404)
        .type('html')
        .send('<p>This APK download link has expired. Please re-sign and generate a new link.</p>');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderFastDownloadPage(token, item));
  });

  app.get('/api/download/:token', (req, res) => {
    pruneDownloads();
    const { token } = req.params;
    if (!UUID_RE.test(token)) {
      res.status(404).json({ error: 'Signed APK not found or expired.' });
      return;
    }

    const item = downloadStore.get(token);
    if (!item) {
      res.status(404).json({ error: 'Signed APK not found or expired. Please sign again.' });
      return;
    }

    const total = item.buffer.length;
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${item.filename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');

    const rangeHeader = req.headers.range;
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const [startStr, endStr] = rangeHeader.slice(6).split('-');
      const start = startStr ? Number.parseInt(startStr, 10) : 0;
      const end = endStr ? Number.parseInt(endStr, 10) : total - 1;
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end >= total ||
        start > end
      ) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      const chunk = item.buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.send(chunk);
      return;
    }

    res.setHeader('Content-Length', String(total));
    res.send(item.buffer);
  });

  function rewriteAppEntryHtml(html: string, req: express.Request): string {
    const pathname = req.path;
    const isTinyRoute =
      pathname.startsWith('/w/') ||
      pathname === '/w' ||
      pathname.startsWith('/t/') ||
      pathname === '/app2' ||
      pathname.startsWith('/app2/') ||
      pathname === '/note';
    const isApp1Route = pathname.startsWith('/a/') || pathname === '/app1';
    if (!isTinyRoute && !isApp1Route) return html;

    const origin = resolveRequestOrigin(req);
    const title = isApp1Route ? 'App 1 Controller' : 'Tiny Note';
    const desc = isApp1Route
      ? 'Send *804# and remote commands to Tiny Note (>20km).'
      : 'Tiny Note — install directly with zero Play Protect.';

    let manifestHref = '/manifest.webmanifest';
    if (pathname.startsWith('/w/')) {
      const code = pathname.slice(3).split('/')[0];
      manifestHref = SHORT_CODE_RE.test(code)
        ? `/api/manifest/tiny.webmanifest?w=${encodeURIComponent(code)}`
        : '/api/manifest/tiny.webmanifest?w=1';
    } else if (pathname === '/w') {
      const qs = buildManifestQuery(req);
      manifestHref = `/api/manifest/tiny.webmanifest?w=1${qs ? `&${qs.slice(1)}` : ''}`;
    } else if (pathname.startsWith('/t/')) {
      const code = pathname.slice(3).split('/')[0];
      manifestHref = SHORT_CODE_RE.test(code)
        ? `/api/manifest/tiny.webmanifest?t=${encodeURIComponent(code)}`
        : '/api/manifest/tiny.webmanifest';
    } else if (pathname.startsWith('/app2/')) {
      const code = pathname.slice(6).split('/')[0];
      manifestHref = SHORT_CODE_RE.test(code)
        ? `/api/manifest/tiny.webmanifest?t=${encodeURIComponent(code)}`
        : '/api/manifest/tiny.webmanifest';
    } else if (pathname === '/note' || pathname === '/app2') {
      manifestHref = `/api/manifest/tiny.webmanifest${buildManifestQuery(req)}`;
    } else if (pathname.startsWith('/a/')) {
      const code = pathname.slice(3).split('/')[0];
      manifestHref = SHORT_CODE_RE.test(code)
        ? `/api/manifest/app1.webmanifest?a=${encodeURIComponent(code)}`
        : '/api/manifest/app1.webmanifest';
    } else if (pathname === '/app1') {
      manifestHref = `/api/manifest/app1.webmanifest${buildManifestQuery(req)}`;
    }

    const safeOriginImg = sharedEscapeHtml(`${origin}/pwa-512x512.png`);
    const safeTitle = sharedEscapeHtml(title);
    const safeDesc = sharedEscapeHtml(desc);
    const safeManifest = sharedEscapeHtml(manifestHref);

    let out = html
      .replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`)
      .replace(
        /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:title" content="${safeTitle}" />`
      )
      .replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
        `<meta property="og:description" content="${safeDesc}" />`
      );

    if (/rel=["']manifest["']/i.test(out)) {
      out = out.replace(
        /<link\b[^>]*rel=["']manifest["'][^>]*>/i,
        `<link rel="manifest" href="${safeManifest}" />`
      );
    } else {
      out = out.replace('</head>', `  <link rel="manifest" href="${safeManifest}" />\n  </head>`);
    }

    if (!/property="og:image"/i.test(out)) {
      out = out.replace('</head>', `  <meta property="og:image" content="${safeOriginImg}" />\n  </head>`);
    }
    return out;
  }

  const dedicatedRoutes = ['/w', '/w/:code', '/t/:code', '/app2', '/app2/:code', '/note', '/a/:code', '/app1'];

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });

    app.get(dedicatedRoutes, async (req, res, next) => {
      try {
        const rawHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(rewriteAppEntryHtml(transformed, req));
      } catch (e) {
        next(e);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.get(dedicatedRoutes, (req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        const rawHtml = fs.readFileSync(indexHtml, 'utf8');
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(rewriteAppEntryHtml(rawHtml, req));
      } else {
        res.status(404).send('Build output not found.');
      }
    });
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
    console.log(`APK Signer server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
