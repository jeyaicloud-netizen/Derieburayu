import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type RelayKind = 'ntfy' | 'firebase' | 'jsonblob' | 'server';

export interface ResolvedRelayConfig {
  kind: RelayKind;
  displayUrl: string;
  cmdPostUrl: string;
  cmdPollUrl: string;
  cmdSseUrl: string;
  resPostUrl: string;
  resPollUrl: string;
  resSseUrl: string;
}

export const BRIDGE_ROOM_RE = /^[a-zA-Z0-9_-]{12,64}$/;
export const SHORT_CODE_RE = /^[a-zA-Z0-9_-]{6,64}$/;

const SHORT_LINKS_FILE = path.join(os.tmpdir(), 'tinyconnect-short-links.json');
const customShortLinks = new Map<string, string>();

function loadCustomShortLinks() {
  try {
    if (fs.existsSync(SHORT_LINKS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SHORT_LINKS_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (SHORT_CODE_RE.test(k) && typeof v === 'string') {
            customShortLinks.set(k, v);
          }
        }
      }
    }
  } catch {}
}

loadCustomShortLinks();

function saveCustomShortLinks() {
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of customShortLinks.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SHORT_LINKS_FILE, JSON.stringify(obj), 'utf8');
  } catch {}
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function parseExternalRelayUrl(rawUrl: string): ResolvedRelayConfig | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 512) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }

  if (host === 'ntfy.sh' || host.endsWith('.ntfy.sh')) {
    const seg = parsed.pathname
      .split('/')
      .filter(Boolean)[0]
      ?.replace(/-(cmd|res)$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (!seg || seg.length < 6 || seg.length > 80) return null;
    const base = `https://${host}/${seg}`;
    return {
      kind: 'ntfy',
      displayUrl: base,
      cmdPostUrl: `${base}-cmd`,
      cmdPollUrl: `${base}-cmd/json?poll=1&since=30m`,
      cmdSseUrl: `${base}-cmd/sse?since=30m`,
      resPostUrl: `${base}-res`,
      resPollUrl: `${base}-res/json?poll=1&since=30m`,
      resSseUrl: `${base}-res/sse?since=30m`,
    };
  }

  if (host.endsWith('.firebaseio.com') || host.endsWith('.firebasedatabase.app')) {
    let cleanPath = parsed.pathname.replace(/\.json$/i, '').replace(/\/+$/, '');
    if (!cleanPath || cleanPath === '/') {
      cleanPath = '/tinyconnect';
    }
    const base = `https://${host}${cleanPath}`;
    return {
      kind: 'firebase',
      displayUrl: base,
      cmdPostUrl: `${base}/command.json`,
      cmdPollUrl: `${base}/command.json`,
      cmdSseUrl: `${base}/command.json`,
      resPostUrl: `${base}/result.json`,
      resPollUrl: `${base}/result.json`,
      resSseUrl: `${base}/result.json`,
    };
  }

  if (
    (host === 'jsonblob.com' || host === 'www.jsonblob.com') &&
    /^\/api\/jsonBlob\/[a-zA-Z0-9_-]{8,80}$/.test(parsed.pathname)
  ) {
    const blobUrl = `https://${host}${parsed.pathname}`;
    return {
      kind: 'jsonblob',
      displayUrl: blobUrl,
      cmdPostUrl: blobUrl,
      cmdPollUrl: blobUrl,
      cmdSseUrl: blobUrl,
      resPostUrl: blobUrl,
      resPollUrl: blobUrl,
      resSseUrl: blobUrl,
    };
  }

  return null;
}

export function registerCustomShortRelay(rawUrl: string): string | null {
  const valid = parseExternalRelayUrl(rawUrl);
  if (!valid) return null;

  if (valid.displayUrl.startsWith('https://ntfy.sh/tinyconnect-')) {
    const suffix = valid.displayUrl.slice('https://ntfy.sh/tinyconnect-'.length);
    if (SHORT_CODE_RE.test(suffix)) return suffix;
  }

  for (const [code, storedUrl] of customShortLinks.entries()) {
    if (storedUrl === valid.displayUrl) return code;
  }

  const hashPart = crypto
    .createHash('sha256')
    .update(valid.displayUrl)
    .digest('base64url')
    .slice(0, 8);
  const code = `c_${hashPart}`;
  let candidate = code;
  let n = 1;
  while (customShortLinks.has(candidate) && customShortLinks.get(candidate) !== valid.displayUrl) {
    candidate = `${code}${n++}`;
  }
  if (customShortLinks.size >= 500) {
    const firstKey = customShortLinks.keys().next().value;
    if (firstKey) customShortLinks.delete(firstKey);
  }
  customShortLinks.set(candidate, valid.displayUrl);
  saveCustomShortLinks();
  return candidate;
}

export function resolveShortCodeRelay(
  rawCode: string | null | undefined,
  fallbackOrigin: string
): ResolvedRelayConfig | null {
  if (!rawCode) return null;
  const code = rawCode.trim();
  if (!SHORT_CODE_RE.test(code)) return null;

  const custom = customShortLinks.get(code);
  if (custom) {
    return parseExternalRelayUrl(custom);
  }

  if (code.startsWith('r_')) {
    const roomId = code.slice(2);
    if (BRIDGE_ROOM_RE.test(roomId)) {
      return resolveServerSideRelay(null, fallbackOrigin, roomId);
    }
  }

  const ntfyUrl = `https://ntfy.sh/tinyconnect-${code}`;
  return parseExternalRelayUrl(ntfyUrl);
}

export function resolveServerSideRelay(
  externalRelayUrl: string | null | undefined,
  fallbackOrigin: string,
  roomId: string | null | undefined
): ResolvedRelayConfig {
  const external = externalRelayUrl ? parseExternalRelayUrl(externalRelayUrl) : null;
  if (external) return external;

  const safeOrigin = fallbackOrigin.replace(/\/+$/, '');
  const safeRoom = roomId && BRIDGE_ROOM_RE.test(roomId) ? roomId : 'tinyconnect-default-room1';
  return {
    kind: 'server',
    displayUrl: `${safeOrigin}/note?room=${safeRoom}`,
    cmdPostUrl: `${safeOrigin}/api/bridge/${safeRoom}/command`,
    cmdPollUrl: `${safeOrigin}/api/bridge/${safeRoom}/state`,
    cmdSseUrl: `${safeOrigin}/api/bridge/${safeRoom}/events`,
    resPostUrl: `${safeOrigin}/api/bridge/${safeRoom}/result`,
    resPollUrl: `${safeOrigin}/api/bridge/${safeRoom}/state`,
    resSseUrl: `${safeOrigin}/api/bridge/${safeRoom}/events`,
  };
}
