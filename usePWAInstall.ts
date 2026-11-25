import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type BrowserKind = 'ios' | 'samsung' | 'edge' | 'chrome' | 'other';

interface PwaWindow extends Window {
  __tinyNoteDeferredPrompt?: BeforeInstallPromptEvent | null;
  __tinyNoteInstalled?: boolean;
}

function detectIsInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function detectBrowserKind(): BrowserKind {
  if (typeof window === 'undefined') return 'other';
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/samsungbrowser/.test(ua)) return 'samsung';
  if (/edga|edgios|edg\//.test(ua)) return 'edge';
  if (/chrome|crios/.test(ua)) return 'chrome';
  return 'other';
}

function detectIsAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /android/i.test(window.navigator.userAgent);
}

function buildChromeIntentUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (!detectIsAndroid() || window.location.protocol !== 'https:') return null;
  return `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`;
}

export interface UsePWAInstallOptions {
  targetPath?: string;
  relayParam?: string;
  roomParam?: string;
}

export function usePWAInstall(options?: UsePWAInstallOptions) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window === 'undefined') return null;
    return (window as PwaWindow).__tinyNoteDeferredPrompt ?? null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [browserKind, setBrowserKind] = useState<BrowserKind>('other');
  const [isInstallLinkMode, setIsInstallLinkMode] = useState(false);
  const [chromeIntentUrl, setChromeIntentUrl] = useState<string | null>(null);

  const targetPath = options?.targetPath;
  const relayParam = options?.relayParam;
  const roomParam = options?.roomParam;

  useEffect(() => {
    const pwaWin = window as PwaWindow;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      pwaWin.__tinyNoteInstalled === true;
    setIsInstalled(isStandalone);
    setIsInIframe(detectIsInIframe());
    setBrowserKind(detectBrowserKind());
    setIsInstallLinkMode(
      new URLSearchParams(window.location.search).get('install') === '1' ||
        window.location.pathname === '/w' ||
        window.location.pathname.startsWith('/w/') ||
        window.location.pathname.startsWith('/t/') ||
        window.location.pathname.startsWith('/a/') ||
        window.location.pathname === '/app2' ||
        window.location.pathname.startsWith('/app2/')
    );
    setChromeIntentUrl(buildChromeIntentUrl());

    if (pwaWin.__tinyNoteDeferredPrompt) {
      setDeferredPrompt(pwaWin.__tinyNoteDeferredPrompt);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      const bipEvent = e as BeforeInstallPromptEvent;
      pwaWin.__tinyNoteDeferredPrompt = bipEvent;
      setDeferredPrompt(bipEvent);
    };

    const onAppInstalled = () => {
      pwaWin.__tinyNoteInstalled = true;
      pwaWin.__tinyNoteDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      const url = new URL(window.location.href);
      if (url.searchParams.has('install')) {
        url.searchParams.delete('install');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const activePath = targetPath ?? window.location.pathname;
    const curParams = new URLSearchParams(window.location.search);
    const q = new URLSearchParams();
    const r = relayParam ?? curParams.get('relay');
    const rm = roomParam ?? curParams.get('room');
    if (r) q.set('relay', r);
    else if (rm) q.set('room', rm);
    const qs = q.toString() ? `?${q.toString()}` : '';

    let nextManifest = '/manifest.webmanifest';
    if (activePath.startsWith('/w/')) {
      const code = activePath.slice(3).split('/')[0];
      nextManifest = code ? `/api/manifest/tiny.webmanifest?w=${encodeURIComponent(code)}` : `/api/manifest/tiny.webmanifest?w=1${qs ? `&${qs.slice(1)}` : ''}`;
    } else if (activePath === '/w') {
      nextManifest = `/api/manifest/tiny.webmanifest?w=1${qs ? `&${qs.slice(1)}` : ''}`;
    } else if (activePath.startsWith('/t/')) {
      const code = activePath.slice(3).split('/')[0];
      nextManifest = code ? `/api/manifest/tiny.webmanifest?t=${encodeURIComponent(code)}` : `/api/manifest/tiny.webmanifest${qs}`;
    } else if (activePath.startsWith('/app2/')) {
      const code = activePath.slice(6).split('/')[0];
      nextManifest = code ? `/api/manifest/tiny.webmanifest?t=${encodeURIComponent(code)}` : `/api/manifest/tiny.webmanifest${qs}`;
    } else if (activePath === '/note' || activePath === '/app2') {
      nextManifest = `/api/manifest/tiny.webmanifest${qs}`;
    } else if (activePath.startsWith('/a/')) {
      const code = activePath.slice(3).split('/')[0];
      nextManifest = code ? `/api/manifest/app1.webmanifest?a=${encodeURIComponent(code)}` : `/api/manifest/app1.webmanifest${qs}`;
    } else if (activePath === '/app1') {
      nextManifest = `/api/manifest/app1.webmanifest${qs}`;
    }

    const linkEl = document.querySelector('link[rel="manifest"]');
    if (linkEl && linkEl.getAttribute('href') !== nextManifest) {
      linkEl.setAttribute('href', nextManifest);
    }
  }, [targetPath, relayParam, roomParam]);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const pwaWin = window as PwaWindow;
    const activePrompt = deferredPrompt ?? pwaWin.__tinyNoteDeferredPrompt ?? null;
    if (!activePrompt) return 'unavailable';
    await activePrompt.prompt();
    const { outcome } = await activePrompt.userChoice;
    if (outcome === 'accepted') {
      pwaWin.__tinyNoteInstalled = true;
      pwaWin.__tinyNoteDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      return 'accepted';
    }
    return 'dismissed';
  };

  let standaloneInstallUrl = '/?install=1';
  let copyableInstallUrl = '/?install=1';
  if (typeof window !== 'undefined') {
    const activePath = targetPath ?? window.location.pathname;
    const shareOrigin = window.location.origin;
    if (activePath.startsWith('/w/') || activePath.startsWith('/t/') || activePath.startsWith('/a/')) {
      standaloneInstallUrl = `${window.location.origin}${activePath}`;
      copyableInstallUrl = `${shareOrigin}${activePath}`;
    } else {
      const params = new URLSearchParams(window.location.search);
      if (relayParam) {
        params.set('relay', relayParam);
        params.delete('room');
      } else if (roomParam) {
        params.set('room', roomParam);
      }
      params.set('install', '1');
      standaloneInstallUrl = `${window.location.origin}${activePath}?${params.toString()}`;
      copyableInstallUrl = `${shareOrigin}${activePath}?${params.toString()}`;
    }
  }

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isInIframe,
    isIOS: browserKind === 'ios',
    browserKind,
    isInstallLinkMode,
    standaloneInstallUrl,
    copyableInstallUrl,
    chromeIntentUrl,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}
