/**
 * MobileSenderApp.tsx
 * Zero-PlayProtect Phone PWA with Add-to-Home-Screen installer, Background Keep-Alive,
 * Screen Cast, Smart USSD launcher, Live Guided Pointer, and Localhost Bridge to Native APK (127.0.0.1:8765).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  Hand,
  Play,
  Send,
  ShieldCheck,
  Smartphone,
  Volume2,
} from 'lucide-react';
import { WebRtcEngine } from './WebRtcEngine';
import { ReliableCommandBus } from './ReliableCommandBus';
import { BackgroundKeepAlive } from './BackgroundKeepAlive';
import { WebScreenMirror } from './WebScreenMirror';
import { BridgeMessage } from './types';

interface MobileSenderAppProps {
  roomId: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __tinyNoteDeferredPrompt?: BeforeInstallPromptEvent | null;
    __tinyNoteInstalled?: boolean;
  }
}

const NATIVE_BRIDGE_URL = 'http://127.0.0.1:8765';

export const MobileSenderApp: React.FC<MobileSenderAppProps> = ({ roomId }) => {
  const [casting, setCasting] = useState(false);
  const [streamType, setStreamType] = useState<'screen' | 'mirror' | 'native' | 'camera' | null>(null);
  const [keepAliveReady, setKeepAliveReady] = useState(false);
  const [nativeBridgeOnline, setNativeBridgeOnline] = useState(false);
  const [nativeAccessibilityOn, setNativeAccessibilityOn] = useState(false);
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string>(() => {
    try {
      const sp = new URLSearchParams(window.location.search).get('apk');
      if (sp && /^https?:\/\//i.test(sp.trim())) {
        localStorage.setItem('ussd_cast_apk_url', sp.trim());
        return sp.trim();
      }
      return localStorage.getItem('ussd_cast_apk_url') || '';
    } catch {
      return '';
    }
  });
  const [notifReady, setNotifReady] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [activeUssd, setActiveUssd] = useState<string | null>(null);
  const [ussdReplyText, setUssdReplyText] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [guidedStep, setGuidedStep] = useState<{
    step: number;
    label: string;
    text: string;
  } | null>(null);
  const [touchPos, setTouchPos] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);

  const [showDialer, setShowDialer] = useState(false);
  const [dialerDigits, setDialerDigits] = useState('*804#');
  const [pendingUrlCall, setPendingUrlCall] = useState<{ url: string; label: string } | null>(
    null
  );
  const engineRef = useRef<WebRtcEngine | null>(null);
  const busRef = useRef<ReliableCommandBus | null>(null);
  const keepAliveRef = useRef<BackgroundKeepAlive | null>(null);
  const mirrorRef = useRef<WebScreenMirror | null>(null);
  const streamTypeRef = useRef<'screen' | 'mirror' | 'native' | 'camera' | null>(null);
  const nativeBridgeOnlineRef = useRef<boolean>(false);
  const activeUssdRef = useRef<string | null>(null);
  const pendingUrlCallRef = useRef<{ url: string; label: string } | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    streamTypeRef.current = streamType;
  }, [streamType]);

  useEffect(() => {
    nativeBridgeOnlineRef.current = nativeBridgeOnline;
  }, [nativeBridgeOnline]);

  useEffect(() => {
    activeUssdRef.current = activeUssd;
  }, [activeUssd]);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isInAppBrowser = /\bwv\b|Telegram|FBAN|FBAV|Instagram|WhatsApp/i.test(ua);
  const supportsScreenCast =
    typeof navigator !== 'undefined' &&
    typeof (navigator.mediaDevices as MediaDevices & { getDisplayMedia?: unknown })
      ?.getDisplayMedia === 'function';

  const getPublicBaseOrigin = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (origin.includes('ais-dev-')) {
      return 'https://nativeappderieburayu.vercel.app';
    }
    return origin || 'https://nativeappderieburayu.vercel.app';
  };

  const currentSenderUrl = `${getPublicBaseOrigin()}/#mode=sender&room=${roomId}`;
  const publicHostAndPath = typeof window !== 'undefined' ? `${window.location.host.replace('ais-dev-', 'ais-pre-')}${window.location.pathname}${window.location.search}${window.location.hash}` : '';
  const openExternalBrowserHref =
    typeof window !== 'undefined'
      ? `intent://${publicHostAndPath}#Intent;scheme=https;action=android.intent.action.VIEW;end`
      : '#';

  const controlUrl = `${getPublicBaseOrigin()}/#mode=control&room=${roomId}`;
  const telegramShareHref = `https://t.me/share/url?url=${encodeURIComponent(
    controlUrl
  )}&text=${encodeURIComponent(`PersistentUssdCast Control Link: ${controlUrl}`)}`;

  const launchNativeBridgeHref = apkDownloadUrl
    ? `intent://open?room=${encodeURIComponent(
        roomId
      )}&autostart=1#Intent;scheme=ussdcast;package=com.ussdcast.bridge;S.browser_fallback_url=${encodeURIComponent(
        apkDownloadUrl
      )};end`
    : `intent://open?room=${encodeURIComponent(
        roomId
      )}&autostart=1#Intent;scheme=ussdcast;package=com.ussdcast.bridge;end`;

  const checkNativeBridge = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${NATIVE_BRIDGE_URL}/ping`, { mode: 'cors' });
      const ok = res.ok;
      let a11y = false;
      if (ok) {
        try {
          const info = await res.json();
          a11y = Boolean(info?.accessibility);
        } catch {}
      }
      setNativeBridgeOnline(ok);
      setNativeAccessibilityOn(a11y);
      if (
        ok &&
        streamTypeRef.current !== 'native' &&
        streamTypeRef.current !== 'camera' &&
        mirrorRef.current &&
        engineRef.current
      ) {
        const sendFrameFallback = (dataUrl: string) => {
          engineRef.current?.sendMirrorFrame(dataUrl);
        };
        const stream = mirrorRef.current.startNativeBridgeMirror(
          NATIVE_BRIDGE_URL,
          sendFrameFallback
        );
        if (stream) {
          engineRef.current.startProvidedStreamOffer(stream);
          setCasting(true);
          setStreamType('native');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          void reportProgress(
            a11y
              ? '✅ Native MediaProjection + Remote Touch (Accessibility) ተገናኝቶ ሙሉ ስልኩን እያሳየ ነው።'
              : '✅ Native MediaProjection (127.0.0.1:8765) ተገናኝቶ ሙሉ ስልኩን እያሳየ ነው።'
          );
        }
      } else if (
        !ok &&
        streamTypeRef.current === 'native' &&
        mirrorRef.current &&
        engineRef.current
      ) {
        const sendFrameFallback = (dataUrl: string) => {
          engineRef.current?.sendMirrorFrame(dataUrl);
        };
        const stream = mirrorRef.current.startDomMirror(
          '[data-mirror-root="true"]',
          sendFrameFallback
        );
        if (stream) {
          engineRef.current.startProvidedStreamOffer(stream);
          setCasting(true);
          setStreamType('mirror');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          void reportProgress('⚠️ Native MediaProjection ተቋርጧል፤ ወደ Web Mirror ተመልሷል።');
        }
      }
      return ok;
    } catch {
      setNativeBridgeOnline(false);
      setNativeAccessibilityOn(false);
      if (
        streamTypeRef.current === 'native' &&
        mirrorRef.current &&
        engineRef.current
      ) {
        const sendFrameFallback = (dataUrl: string) => {
          engineRef.current?.sendMirrorFrame(dataUrl);
        };
        const stream = mirrorRef.current.startDomMirror(
          '[data-mirror-root="true"]',
          sendFrameFallback
        );
        if (stream) {
          engineRef.current.startProvidedStreamOffer(stream);
          setCasting(true);
          setStreamType('mirror');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }
      }
      return false;
    }
  };

  const forwardToNativeBridge = async (path: string): Promise<boolean> => {
    try {
      const res = await fetch(`${NATIVE_BRIDGE_URL}${path}`, { mode: 'cors' });
      if (res.ok) {
        setNativeBridgeOnline(true);
        return true;
      }
    } catch {}
    setNativeBridgeOnline(false);
    return false;
  };

  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone) ||
      Boolean(window.__tinyNoteInstalled);
    setIsInstalled(standalone);
    if (window.__tinyNoteDeferredPrompt) {
      setCanPromptInstall(true);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      window.__tinyNoteDeferredPrompt = e as BeforeInstallPromptEvent;
      setCanPromptInstall(true);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setCanPromptInstall(false);
      setShowInstallHint(false);
      setStatusNotice('PWA በተሳካ ሁኔታ ወደ Home Screen ተጭኗል (0% Play Protect)።');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    void checkNativeBridge();
    const bridgePoll = setInterval(() => {
      void checkNativeBridge();
    }, 3500);

    const keepAlive = new BackgroundKeepAlive();
    keepAliveRef.current = keepAlive;

    const mirror = new WebScreenMirror();
    mirrorRef.current = mirror;

    const bus = new ReliableCommandBus(roomId, (msg) => handleCommand(msg));
    bus.startListening();
    busRef.current = bus;

    const engine = new WebRtcEngine(roomId, true);
    engineRef.current = engine;
    engine.init(
      undefined,
      (msg) => {
        bus.handleIncomingMessage(msg, false);
      },
      (connected) => {
        if (connected) {
          void reportProgress('🔗 ስልኩ ከController ጋር በቀጥታ ተገናኝቷል (Screen Mirror Active)።');
        }
      },
      () => {
        setCasting(false);
        setStreamType(null);
        setStatusNotice('Screen Cast ተቋርጧል — እንደገና ለመጀመር "Start Screen Cast" ይንኩ።');
      }
    );

    // Auto-start 0%-PlayProtect Live Screen Mirror so Controller sees the phone screen immediately
    const autoCastTimer = setTimeout(() => {
      void startMirrorStream(true);
    }, 600);

    // Web Share Target intake (Screenshot or USSD text shared via Android Share Sheet)
    const intakeSharedPayload = async () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const sharedText = sp.get('sharedText');
        if (sharedText && sharedText.trim()) {
          setUssdReplyText(sharedText.trim());
          setTimeout(() => {
            void reportProgress(`📩 Shared Text: ${sharedText.trim()}`);
          }, 900);
        }
        if ('caches' in window) {
          const cache = await caches.open('ussdcast-shared-v1');
          const matched = await cache.match('/_shared-image');
          if (matched) {
            const blob = await matched.blob();
            await cache.delete('/_shared-image');
            const reader = new FileReader();
            reader.onload = () => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const targetW = 450;
                const targetH = Math.max(
                  400,
                  Math.round(targetW * (img.height / Math.max(1, img.width)))
                );
                canvas.width = targetW;
                canvas.height = targetH;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0, targetW, targetH);
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                  keepAliveRef.current?.setSharedPreview(dataUrl);
                  setTimeout(() => {
                    engineRef.current?.sendData({ type: 'uploaded-screenshot', dataUrl });
                    void reportProgress('📷 Shared Screenshot ወደ Controller ተልኳል።');
                  }, 1200);
                }
              };
              if (typeof reader.result === 'string') {
                img.src = reader.result;
              }
            };
            reader.readAsDataURL(blob);
          }
        }
        if (sp.has('shared') || sp.has('sharedText')) {
          window.history.replaceState(null, '', `/#mode=sender&room=${roomId}`);
        }
      } catch {}
    };
    void intakeSharedPayload();

    const spUrl = new URLSearchParams(window.location.search).get('urlCall');
    if (spUrl) {
      void executeUrlCall(spUrl, 'Notification URL Call');
      window.history.replaceState(null, '', `/#mode=sender&room=${roomId}`);
    }

    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'EXECUTE_URL_CALL' && typeof ev.data.url === 'string') {
        void executeUrlCall(ev.data.url, 'Background Notification Call');
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    const onReturnVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkNativeBridge();
        if (pendingUrlCallRef.current) {
          const queued = pendingUrlCallRef.current;
          pendingUrlCallRef.current = null;
          setPendingUrlCall(null);
          triggerAnchorCall(queued.url);
          void reportProgress(`🔗 Queued URL Call ተከፍቷል: ${queued.label || queued.url}`);
        }
      }
    };
    document.addEventListener('visibilitychange', onReturnVisible);

    return () => {
      clearTimeout(autoCastTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      document.removeEventListener('visibilitychange', onReturnVisible);
      clearInterval(bridgePoll);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      mirror.stop();
      engine.destroy();
      bus.destroy();
      keepAlive.destroy();
    };
  }, [roomId]);

  const sendViaDc = (msg: BridgeMessage): boolean => {
    return engineRef.current ? engineRef.current.sendData(msg) : false;
  };

  const reportProgress = async (summary: string) => {
    setStatusNotice(summary);
    if (busRef.current) {
      await busRef.current.sendCommand('ussd-result', { text: summary }, sendViaDc);
    }
  };

  const normalizeSafeUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^[#*0-9+]+$/.test(trimmed)) {
      return `tel:${trimmed.replace(/#/g, '%23')}`;
    }
    if (/^(tel:|sms:|mailto:|intent:|https?:|ussdcast:)/i.test(trimmed)) {
      return trimmed.startsWith('tel:') ? `tel:${trimmed.slice(4).replace(/#/g, '%23')}` : trimmed;
    }
    return null;
  };

  const triggerAnchorCall = (safeUrl: string) => {
    try {
      const a = document.createElement('a');
      a.href = safeUrl;
      if (/^https?:/i.test(safeUrl)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  };

  const executeUrlCall = async (rawUrl: string, label?: string) => {
    const safeUrl = normalizeSafeUrl(rawUrl);
    if (!safeUrl) {
      await reportProgress(`⚠️ Invalid URL Call skipped: ${rawUrl}`);
      return;
    }
    const callLabel = label || safeUrl;
    keepAliveRef.current?.setBannerText('URL Call', callLabel);

    if (document.hidden) {
      const queued = { url: safeUrl, label: callLabel };
      pendingUrlCallRef.current = queued;
      setPendingUrlCall(queued);
      await notifyInBackground(
        `📞 URL Call: ${callLabel}`,
        'ከበስተጀርባ ትዕዛዝ ደርሷል — "📞 Run URL" ይንኩ',
        safeUrl
      );
      await reportProgress(`⏳ Background WebSocket URL Call (${callLabel}) ተቀምጧል (Notification ይንኩ)።`);
      return;
    }

    pendingUrlCallRef.current = null;
    setPendingUrlCall(null);
    triggerAnchorCall(safeUrl);
    await notifyInBackground(`🔗 URL Call: ${callLabel}`, `${safeUrl} ተከፍቷል`, safeUrl);
    await reportProgress(`🔗 URL Call ተከፍቷል: ${safeUrl}`);
  };

  const notifyInBackground = async (title: string, body: string, actionUrl?: string) => {
    await keepAliveRef.current?.playAttentionTone();
    try {
      navigator.vibrate?.([80, 40, 80]);
    } catch {}

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg && reg.showNotification) {
          try {
            const actions: Array<{
              action: string;
              title: string;
              type?: string;
              placeholder?: string;
            }> = [];
            if (actionUrl) {
              actions.push({ action: 'run-url', title: '📞 Run URL' });
            }
            actions.push(
              { action: 'reply', type: 'text', title: 'መልስ ላክ', placeholder: 'USSD መልስ...' },
              { action: 'done', title: '✅ ተከናውኗል' }
            );
            const richOptions: NotificationOptions & {
              actions?: typeof actions;
            } = {
              body,
              icon: '/pwa-192x192.png',
              tag: 'ussdcast-bg-cmd',
              data: { roomId, url: actionUrl || '' },
              actions,
            };
            await reg.showNotification(title, richOptions);
          } catch {
            await reg.showNotification(title, {
              body,
              icon: '/pwa-192x192.png',
              tag: 'ussdcast-bg-cmd',
              data: { roomId, url: actionUrl || '' },
            });
          }
        } else if (document.hidden) {
          new Notification(title, { body, icon: '/pwa-192x192.png' });
        }
      } catch {}
    }
  };

  const handleFloatingPipAction = (action: 'prev' | 'next' | 'toggle') => {
    void keepAliveRef.current?.playAttentionTone();
    if (action === 'next') {
      void reportProgress('✅ [Floating PiP] ተከናውኗል (Done)');
      keepAliveRef.current?.setBannerText('Sent: Done ✅', activeUssdRef.current || 'Ready');
    } else if (action === 'prev') {
      if (pendingUrlCallRef.current) {
        const queued = pendingUrlCallRef.current;
        pendingUrlCallRef.current = null;
        setPendingUrlCall(null);
        triggerAnchorCall(queued.url);
        void reportProgress(`🔗 [Floating PiP] ${queued.url}`);
        return;
      }
      const code = activeUssdRef.current || '*804#';
      void (async () => {
        try {
          const clip = await navigator.clipboard?.readText();
          if (clip && clip.trim()) {
            setUssdReplyText(clip.trim());
            await reportProgress(`📋 [Floating PiP] ${clip.trim()}`);
            return;
          }
        } catch {}
        await executeUssd(code);
      })();
    } else {
      void reportProgress('🔔 [Floating PiP] ስልኩ ንቁ ነው');
    }
  };

  const ensureBackgroundActive = async () => {
    if (!keepAliveReady && keepAliveRef.current) {
      await keepAliveRef.current.activate(handleFloatingPipAction);
      setKeepAliveReady(true);
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotifReady(perm === 'granted');
      } catch {}
    }
  };

  const executeRemoteDomTap = (xPct: number, yPct: number) => {
    const vw = window.innerWidth || 390;
    const vh = window.innerHeight || 844;
    const clientX = Math.max(1, Math.min(vw - 1, (xPct / 100) * vw));
    const clientY = Math.max(1, Math.min(vh - 1, (yPct / 100) * vh));

    try {
      const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const target =
        (hit?.closest('button, a, input, textarea, [role="button"]') as HTMLElement | null) || hit;

      if (
        target &&
        target !== document.body &&
        target !== document.documentElement &&
        target.dataset.mirrorIgnore !== 'true'
      ) {
        const prevOutline = target.style.outline;
        target.style.outline = '2px solid #2dd4bf';
        setTimeout(() => {
          target.style.outline = prevOutline;
        }, 550);

        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          target.focus();
        }
        target.click();
        const tagText =
          (target.innerText || (target as HTMLInputElement).placeholder || target.tagName)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 32);
        void reportProgress(`👆 Remote Tap (${xPct}%, ${yPct}%) -> "${tagText}"`);
        return;
      }
    } catch {}
    void reportProgress(`👆 Pointer (${xPct}%, ${yPct}%) ተነክቷል።`);
  };

  const handleCommand = (msg: BridgeMessage) => {
    if (!msg || !msg.action) return;

    if (msg.action === 'ussd' && msg.code) {
      setActiveUssd(msg.code);
      setDialerDigits(msg.code);
      setShowDialer(true);
      keepAliveRef.current?.setBannerText(`USSD: ${msg.code}`, 'Dialer ላይ Call ይንኩ');
      void executeUssd(msg.code);
      const telUrl = `tel:${msg.code.replace(/#/g, '%23')}`;
      void notifyInBackground(
        `USSD ${msg.code}`,
        'መደወያው ዝግጁ ነው — "📞 Run URL" ወይም "መልስ ላክ" ይንኩ',
        telUrl
      );
    } else if (msg.action === 'launch') {
      const targetUrl =
        msg.url || msg.text || (msg.code ? `tel:${msg.code.replace(/#/g, '%23')}` : '');
      if (targetUrl) {
        void executeUrlCall(targetUrl, msg.label);
      }
    } else if (
      msg.action === 'touch' &&
      msg.touchX !== undefined &&
      msg.touchY !== undefined
    ) {
      const label = msg.label || 'እዚህ ይንኩ';
      setTouchPos({ x: msg.touchX, y: msg.touchY, label });
      keepAliveRef.current?.setTapOverlay(msg.touchX, msg.touchY, label);
      executeRemoteDomTap(msg.touchX, msg.touchY);
      void forwardToNativeBridge(`/tap?xp=${msg.touchX}&yp=${msg.touchY}`);
      // Stay completely silent & undisturbed when Native Bridge is handling Cast/Touch in background
      if (!nativeBridgeOnlineRef.current) {
        if (document.hidden) {
          keepAliveRef.current?.speakGuidance(label);
        }
        void notifyInBackground('የWeb UI ጥቆማ', label);
      }
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(() => setTouchPos(null), 4000);
    } else if (msg.action === 'scroll') {
      const dy = msg.deltaY ?? 240;
      try {
        window.scrollBy({ top: dy, behavior: 'smooth' });
      } catch {
        window.scrollBy(0, dy);
      }
      void forwardToNativeBridge(`/scroll?dy=${dy}`);
    } else if (msg.action === 'cast') {
      if (msg.castMode === 'camera') {
        void startCameraCasting('user');
      } else {
        void startMirrorStream(false);
      }
    } else if (msg.action === 'edit' && msg.text !== undefined) {
      setUssdReplyText(msg.text);
    } else if (msg.action === 'back') {
      setGuidedStep(null);
      setTouchPos(null);
      setShowInstallHint(false);
      void forwardToNativeBridge('/back');
    } else if (msg.action === 'home') {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        window.scrollTo(0, 0);
      }
      void forwardToNativeBridge('/home');
    } else if (msg.action === 'autoclick') {
      void forwardToNativeBridge(msg.enabled ? '/start' : '/stop');
    } else if (msg.action === 'guide') {
      const label = msg.label || 'መመሪያ';
      const text = msg.text || 'የተጠቆመውን ቁልፍ ይንኩ።';
      const stepNum = msg.step || 1;
      setGuidedStep({ step: stepNum, label, text });
      if (stepNum === 5 || stepNum === 6) {
        keepAliveRef.current?.setTapOverlay(50, 68, label);
      } else {
        keepAliveRef.current?.setBannerText(`ደረጃ ${stepNum}`, label);
      }
      if (document.hidden) {
        keepAliveRef.current?.speakGuidance(label);
      }
      void notifyInBackground(`ደረጃ ${stepNum}: ${label}`, text);
    } else if (msg.action === 'clear') {
      setGuidedStep(null);
      setTouchPos(null);
      keepAliveRef.current?.setBannerText('UssdCast Live', 'Ready on Dialer / BG');
    }
  };

  const prepareInstallAnywayOverlay = async (mode: 'open' | 'download') => {
    await ensureBackgroundActive();
    if (mode === 'download') {
      keepAliveRef.current?.setTapOverlay(50, 68, 'More details → Install anyway');
      keepAliveRef.current?.setBannerText('More details →', 'Install anyway ይንኩ');
      void notifyInBackground(
        'APK Install Anyway',
        'Play Protect ከመጣ More details → Install anyway ይንኩ፤ ከዚያ Allow restricted settings'
      );
      void reportProgress('📦 APK Download ተጀምሯል — Floating PiP + WebSocket ከPlay Protect Popup ጋር አብሮ በርቷል።');
    } else {
      keepAliveRef.current?.setTapOverlay(50, 48, '1. Touch ON → 2. Start Bridge');
      keepAliveRef.current?.setBannerText('UssdCast Bridge', '1. Touch ON → 2. Start');
      void notifyInBackground(
        'Native Bridge ተከፍቷል',
        '1. Remote Touch (Accessibility) እና 2. Start MediaProjection ይንኩ'
      );
      void reportProgress('🚀 Native Bridge ተከፍቷል — Floating PiP + WebSocket በመጠባበቅ ላይ ነው።');
    }
  };

  const handleInstallPwa = async () => {
    await ensureBackgroundActive();
    const promptEvent = window.__tinyNoteDeferredPrompt;
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      window.__tinyNoteDeferredPrompt = null;
      setCanPromptInstall(false);
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        await reportProgress('✅ Step 1: PWA ወደ Home Screen ተጭኗል።');
      }
      return;
    }
    setShowInstallHint((prev) => !prev);
    await reportProgress('ℹ️ Step 1: Chrome ⋮ -> Add to Home screen / Install app መመሪያ ተከፍቷል።');
  };

  const activateKeepAlive = async () => {
    await ensureBackgroundActive();
    setKeepAliveReady(true);
    await reportProgress(
      '✅ Background Keep-Alive (MediaSession + Audio + WakeLock + PiP) በርቷል።'
    );
  };

  const executeUssd = async (code: string) => {
    setActiveUssd(code);
    try {
      const res = await fetch(`${NATIVE_BRIDGE_URL}/ussd?code=${encodeURIComponent(code)}`, {
        mode: 'cors',
      });
      if (res.ok) {
        const text = (await res.text()).trim();
        setNativeBridgeOnline(true);
        void reportProgress(`✅ Native USSD ${code}: ${text || 'ተልኳል'}`);
        return;
      }
    } catch {}

    const a = document.createElement('a');
    a.href = `tel:${code.replace(/#/g, '%23')}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    void reportProgress(`📞 USSD ${code} በDialer ተጀምሯል።`);
  };

  const startMirrorStream = async (silent = false) => {
    if (!engineRef.current || !mirrorRef.current) return;
    const isNativeOk = await checkNativeBridge();
    const sendFrameFallback = (dataUrl: string) => {
      engineRef.current?.sendMirrorFrame(dataUrl);
    };

    const stream = isNativeOk
      ? mirrorRef.current.startNativeBridgeMirror(NATIVE_BRIDGE_URL, sendFrameFallback)
      : mirrorRef.current.startDomMirror('[data-mirror-root="true"]', sendFrameFallback);

    if (stream) {
      engineRef.current.startProvidedStreamOffer(stream);
      const mode = isNativeOk ? 'native' : 'mirror';
      setCasting(true);
      setStreamType(mode);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      if (!silent) {
        await reportProgress(
          isNativeOk
            ? '✅ Native MediaProjection Screen Cast (127.0.0.1:8765) ተጀምሯል።'
            : '✅ Live Interactive Screen Cast (0% Play Protect Mirror) ወደ Controller እየተላለፈ ነው።'
        );
      }
    }
  };

  const startCasting = async () => {
    if (!engineRef.current) return;
    await ensureBackgroundActive();

    // 1. Try native browser OS screen cast if browser supports getDisplayMedia
    if (supportsScreenCast) {
      mirrorRef.current?.stop();
      const osStream = await engineRef.current.startCaptureAndOffer();
      if (osStream) {
        setCasting(true);
        setStreamType('screen');
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = osStream;
        }
        await reportProgress('✅ Step 2: OS Screen Cast Allow ተፈቅዶ በቀጥታ እየተላለፈ ነው።');
        return;
      }
    }

    // 2. Fallback / Android Chrome 0% Play Protect Screen Mirror or Localhost MediaProjection
    await startMirrorStream(false);
  };

  const startCameraCasting = async (facing: 'user' | 'environment' = 'user') => {
    if (!engineRef.current) return;
    await ensureBackgroundActive();
    mirrorRef.current?.stop();
    const stream = await engineRef.current.startCameraCaptureAndOffer(facing);
    if (stream) {
      setCasting(true);
      setStreamType('camera');
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      await reportProgress('✅ Step 2: Camera Stream ተፈቅዶ የቀጥታ ቪዲዮ እየተላለፈ ነው።');
    } else {
      setStatusNotice('የካሜራ ፍቃድ አልተሰጠም — በብሮውዘሩ ላይ Camera Allow ይንኩ።');
    }
  };

  const stopCasting = () => {
    mirrorRef.current?.stop();
    engineRef.current?.stopLocalStream();
    setCasting(false);
    setStreamType(null);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    void reportProgress('⏹️ የቀጥታ ቪዲዮ ተቋርጧል።');
  };

  const requestAllPermissionsAndStart = async () => {
    await ensureBackgroundActive();
    await startCasting();
  };

  const sendUssdReply = async () => {
    const textToSend = ussdReplyText.trim() || 'USSD ተጠናቋል';
    await reportProgress(`📩 ${textToSend}`);
    setUssdReplyText('');
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetW = 450;
        const targetH = Math.max(400, Math.round(targetW * (img.height / Math.max(1, img.width))));
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          keepAliveRef.current?.setSharedPreview(dataUrl);
          engineRef.current?.sendData({ type: 'uploaded-screenshot', dataUrl });
          void reportProgress('📷 የDialer / USSD Screenshot ወደ Controller ተልኳል።');
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const shareViaSms = () => {
    const text = `PersistentUssdCast Control Link: ${controlUrl}`;
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
  };

  return (
    <div
      data-mirror-root="true"
      className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 flex flex-col items-center relative overflow-x-hidden"
      onClick={() => {
        if (touchPos) setTouchPos(null);
      }}
    >
      {touchPos && (
        <div
          data-remote-pointer="true"
          data-mirror-ignore="true"
          className="fixed z-50 pointer-events-none flex flex-col items-center"
          style={{
            left: `${touchPos.x}%`,
            top: `${touchPos.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="relative flex items-center justify-center">
            <span className="absolute w-16 h-16 rounded-full border-4 border-red-500 bg-red-500/20 animate-ping" />
            <span className="w-10 h-10 rounded-full border-2 border-white bg-red-600/90 flex items-center justify-center shadow-lg">
              <Hand className="h-5 w-5 text-white" />
            </span>
          </div>
          <div className="mt-2 px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-bold whitespace-nowrap shadow-xl border border-red-300">
            👆 {touchPos.label}
          </div>
        </div>
      )}

      <div className="w-full max-w-lg lg:max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <Smartphone className="h-6 w-6 text-teal-400 shrink-0" />
              <h1 className="text-lg font-bold truncate">Mobile Sender PWA</h1>
            </div>
            <span className="text-xs font-medium text-teal-300 whitespace-nowrap shrink-0">
              {nativeBridgeOnline
                ? 'Native Bridge Connected'
                : casting
                ? 'Casting Live'
                : '0% Play Protect'}
            </span>
          </div>

          {isInAppBrowser && (
            <div className="rounded-xl p-4 border border-sky-700/70 bg-sky-950/40 space-y-2.5">
              <p className="text-xs text-sky-100 leading-relaxed">
                በTelegram/In-App Browser ውስጥ ስለተከፈተ ሙሉ የPWA Install እና Background ፍቃዶች እንዲሰሩ በስልክዎ Browser (Samsung Internet, Edge, Brave, Firefox ወዘተ) ይክፈቱት፦
              </p>
              <div className="flex gap-2">
                <a
                  href={openExternalBrowserHref}
                  className="flex-1 min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 px-3"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <span>በስልኩ Browser ክፈት</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(currentSenderUrl);
                    setStatusNotice('ሊንኩ ተቀድቷል — የስልክዎ Browser ላይ Paste ያድርጉ።');
                  }}
                  className="min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3"
                >
                  Copy Link
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-4 border border-teal-800/70 bg-teal-950/30 space-y-3">
            <button
              type="button"
              onClick={requestAllPermissionsAndStart}
              className="w-full min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center justify-center gap-2 px-4"
            >
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span>ሁሉንም ፍቃዶች ጠይቅና ጀምር</span>
            </button>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <span>• Keep-Alive: {keepAliveReady ? '✅ በርቷል' : '⏳ ይጠብቃል'}</span>
              <span>• Notifications: {notifReady ? '✅ ተፈቅዷል' : '⏳ ይጠብቃል'}</span>
              <span>
                • Screen Cast:{' '}
                {casting
                  ? streamType === 'screen'
                    ? '✅ OS Screen Live'
                    : streamType === 'native'
                    ? '✅ Native MediaProjection'
                    : streamType === 'camera'
                    ? '✅ Camera Live'
                    : '✅ Screen Mirror Live'
                  : '⏳ በመጀመር ላይ...'}
              </span>
              <span>
                • Native App:{' '}
                {nativeBridgeOnline
                  ? nativeAccessibilityOn
                    ? '✅ Cast + Touch ON'
                    : '✅ Cast ON (Touch OFF)'
                  : '— Web ብቻ'}
              </span>
            </div>
          </div>

          {guidedStep && (
            <div className="rounded-xl border border-amber-500/70 bg-amber-500/15 p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-300">
                  የWeb UI መሪ — ደረጃ {guidedStep.step}
                </span>
                <button
                  type="button"
                  onClick={() => setGuidedStep(null)}
                  className="text-xs text-amber-200 underline min-h-[28px] px-2"
                >
                  ዝጋ
                </button>
              </div>
              <p className="text-sm font-bold text-white">{guidedStep.label}</p>
              <p className="text-xs text-amber-100 leading-relaxed">{guidedStep.text}</p>
            </div>
          )}

          {!isInstalled && (
            <div
              className={`rounded-xl p-4 border space-y-3 transition-all ${
                guidedStep?.step === 1
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-400'
                  : 'border-slate-800 bg-slate-950'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0" />
                  ደረጃ 1: ወደ Home Screen ጫን (Zero APK)
                </span>
                {canPromptInstall && (
                  <span className="text-[11px] text-teal-300 font-medium">ዝግጁ</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleInstallPwa}
                className="w-full min-h-[46px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap px-4"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>Install App (0% Play Protect)</span>
              </button>
              {showInstallHint && (
                <p className="text-xs text-slate-300 leading-relaxed">
                  በማንኛውም Browser (Samsung Internet, Edge, Brave, Firefox, Opera) የMenu ምልክቱን (<strong>⋮</strong> ወይም <strong>≡</strong>) ነክተው{' '}
                  <strong>Add page to / Add to Home screen / Install</strong> የሚለውን ይንኩ።
                </p>
              )}
            </div>
          )}

          <div
            className={`rounded-xl p-4 border space-y-3 transition-all ${
              guidedStep?.step === 2
                ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-400'
                : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200">
                ደረጃ 2: Screen Cast እና Allow ፍቃድ
              </span>
              {casting && (
                <span className="text-[11px] font-bold text-emerald-400">
                  ● LIVE (
                  {streamType === 'screen'
                    ? 'OS Screen'
                    : streamType === 'native'
                    ? 'MediaProjection'
                    : streamType === 'camera'
                    ? 'Camera'
                    : '0% PP Mirror'}
                  )
                </span>
              )}
            </div>

            {!casting ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={startCasting}
                  className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 px-4 shadow-lg shadow-emerald-950/40"
                >
                  <Play className="h-5 w-5 shrink-0" />
                  <span>Start Screen Cast (Allow ይንኩ)</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => void startCameraCasting('user')}
                    className="flex-1 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center justify-center gap-2 px-4"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>📷 Camera Stream</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCameraCasting('environment')}
                    className="min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 flex items-center justify-center"
                  >
                    <span>የጀርባ ካሜራ</span>
                  </button>
                </div>

                {!nativeBridgeOnline ? (
                  <a
                    href={launchNativeBridgeHref}
                    className="w-full min-h-[42px] rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 px-4 border border-indigo-400/40"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span>Open Native MediaProjection (127.0.0.1:8765)</span>
                  </a>
                ) : (
                  <div className="rounded-xl p-2.5 bg-emerald-950/50 border border-emerald-700/60 text-[11px] text-emerald-300 font-medium text-center">
                    ✅ Android MediaProjection Bridge (127.0.0.1:8765) ተገናኝቷል — Start Screen Cast ይንኩ
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {streamType === 'mirror' ? (
                  <div className="rounded-xl p-3 bg-emerald-950/40 border border-emerald-800/70 space-y-1.5">
                    <p className="text-xs font-semibold text-emerald-300">
                      ✅ Live Interactive Screen Cast እየተላለፈ ነው
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Controller ላይ ይህ የWeb ገጽ በቀጥታ እየታየ ነው፤ Controller ሲነካ እዚህ ስልክ ላይ ቁልፎች በቀጥታ ይነካሉ።
                    </p>
                    <p className="text-[11px] text-amber-300/90 leading-relaxed">
                      ማሳሰቢያ፦ Chrome ከድረ-ገጹ ውጭ (Dialer / Home Screen) ማሳየት ስለሚከለክል ሙሉ ስልኩን ለማሳየት Localhost MediaProjection Bridge (<code>127.0.0.1:8765</code>) ማብራት ወይም ከታች Screenshot መላክ ያስፈልጋል።
                    </p>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[240px] border border-slate-800 flex items-center justify-center">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    <span className="absolute top-2.5 left-2.5 bg-red-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow">
                      Streaming {streamType === 'camera' ? 'Camera' : 'MediaProjection'} Active
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      streamType === 'camera' ? void startMirrorStream(false) : void startCameraCasting('user')
                    }
                    className="min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold flex items-center justify-center gap-1.5 px-3"
                  >
                    <Camera className="h-3.5 w-3.5 shrink-0" />
                    <span>{streamType === 'camera' ? 'Screen Mirror' : 'Camera Mode'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCasting}
                    className="min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 px-3"
                  >
                    <span>Stop Cast</span>
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl p-3 bg-slate-900/90 border border-indigo-800/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-indigo-200">
                  Native Bridge (Home / Dialer Cast + Touch)
                </span>
                <span className="text-[11px] font-mono text-indigo-300">
                  {nativeBridgeOnline
                    ? nativeAccessibilityOn
                      ? 'Cast+Touch ON'
                      : 'Cast Only'
                    : 'Offline'}
                </span>
              </div>
              {!nativeBridgeOnline ? (
                <div className="space-y-2">
                  <a
                    href={launchNativeBridgeHref}
                    onClick={() => void prepareInstallAnywayOverlay('open')}
                    className="w-full min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 px-4"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span>Open Native Bridge (127.0.0.1:8765)</span>
                  </a>
                  {apkDownloadUrl && (
                    <a
                      href={apkDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void prepareInstallAnywayOverlay('download')}
                      className="w-full min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 text-xs font-semibold flex items-center justify-center gap-2 px-4"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span>Download Bridge APK (Install anyway)</span>
                    </a>
                  )}
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    APK ሲጫን <strong>More details → Install anyway</strong> ይንኩ፤ Android 13–16 ከሆነ <strong>App Info → ⋮ → Allow restricted settings</strong> ፈቅደው Native App ውስጥ 1 እና 2 ን ይንኩ።
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-emerald-300 font-medium">
                    ✅ MediaProjection ON {nativeAccessibilityOn ? '· ✅ Remote Touch ON' : '· ⚠️ Remote Touch OFF'}
                  </div>
                  {!nativeAccessibilityOn && (
                    <a
                      href={launchNativeBridgeHref}
                      onClick={() => void prepareInstallAnywayOverlay('open')}
                      className="w-full min-h-[38px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 px-3"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span>Enable Remote Touch (Accessibility)</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className={`rounded-xl p-4 border flex items-center justify-between gap-3 transition-all ${
              guidedStep?.step === 3
                ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-400'
                : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-200">
                ደረጃ 3: Background Keep-Alive
              </div>
              <div className="text-xs text-slate-400">
                {keepAliveReady
                  ? `MediaSession + WakeLock + PiP${notifReady ? ' + Alerts' : ''}`
                  : 'ከበስተጀርባ እንዲሰራ አንዴ ይንኩ'}
              </div>
            </div>
            <button
              type="button"
              onClick={activateKeepAlive}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                keepAliveReady
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
              }`}
            >
              {keepAliveReady ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Active</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4" />
                  <span>Activate</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-4">
            <span>Room ID</span>
            <span className="font-mono text-teal-400 tabular-nums">{roomId}</span>
          </div>

          {statusNotice && (
            <div className="rounded-xl border border-teal-800 bg-teal-950/50 px-3.5 py-2.5 text-xs text-teal-200">
              {statusNotice}
            </div>
          )}

          {pendingUrlCall && (
            <button
              type="button"
              onClick={() => {
                const queued = pendingUrlCall;
                pendingUrlCallRef.current = null;
                setPendingUrlCall(null);
                triggerAnchorCall(queued.url);
                void reportProgress(`🔗 Queued URL Call ተከፍቷል: ${queued.url}`);
              }}
              className="w-full min-h-[46px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-2 px-4 shadow"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>📞 Run Queued URL: {pendingUrlCall.label}</span>
            </button>
          )}

          <div
            className={`rounded-xl p-4 border space-y-3 transition-all ${
              guidedStep?.step === 4
                ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-400'
                : 'border-slate-800 bg-slate-950'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-300">
                ደረጃ 4: USSD መላኪያ እና መልስ
              </h2>
              <span className="text-xs font-mono text-teal-400">
                {activeUssd || 'Ready'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => executeUssd('*804#')}
                className="min-h-[44px] bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-mono font-bold text-teal-300 border border-slate-700"
              >
                *804#
              </button>
              <button
                type="button"
                onClick={() => executeUssd('*111#')}
                className="min-h-[44px] bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-mono font-bold text-teal-300 border border-slate-700"
              >
                *111#
              </button>
              <button
                type="button"
                onClick={() => setShowDialer((p) => !p)}
                className={`min-h-[44px] rounded-xl text-xs font-semibold border ${
                  showDialer
                    ? 'bg-teal-700 text-white border-teal-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                {showDialer ? 'Dialer ዝጋ' : '⌨️ Dialer Pad'}
              </button>
            </div>

            {showDialer && (
              <div className="rounded-xl p-3 bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dialerDigits}
                    onChange={(e) => setDialerDigits(e.target.value)}
                    className="flex-1 min-h-[38px] bg-slate-950 border border-slate-800 rounded-lg px-3 font-mono text-sm text-teal-300 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setDialerDigits((d) => d.slice(0, -1))}
                    className="min-h-[38px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
                  >
                    ⌫
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDialerDigits((d) => d + key)}
                      className="min-h-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 font-mono text-sm font-bold text-white"
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void executeUssd(dialerDigits)}
                  className="w-full min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  📞 Dial {dialerDigits || '*804#'}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={ussdReplyText}
                onChange={(e) => setUssdReplyText(e.target.value)}
                placeholder="የቴሌኮም USSD መልስ እዚህ ይጻፉ..."
                className="flex-1 min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-teal-500"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const clip = await navigator.clipboard?.readText();
                    if (clip && clip.trim()) {
                      setUssdReplyText(clip.trim());
                      await reportProgress(`📩 ${clip.trim()}`);
                    } else {
                      setStatusNotice('Clipboard ባዶ ነው — መጀመሪያ የUSSD መልሱን Copy ያድርጉ።');
                    }
                  } catch {
                    setStatusNotice('Paste ፍቃድ አልተሰጠም — እዚህ ሳጥን ውስጥ በእጅ Paste ያድርጉ።');
                  }
                }}
                className="min-h-[44px] px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-teal-300 shrink-0"
              >
                📋 Paste & Send
              </button>
            </div>
            <button
              type="button"
              onClick={sendUssdReply}
              className="w-full min-h-[44px] bg-teal-600 hover:bg-teal-500 rounded-xl text-xs font-semibold text-white"
            >
              ውጤቱን ወደ Controller ላክ
            </button>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/*"
              onChange={handleScreenshotUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => screenshotInputRef.current?.click()}
              className="w-full min-h-[42px] bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-teal-300 flex items-center justify-center gap-2"
            >
              <Camera className="h-4 w-4 shrink-0" />
              <span>📷 የDialer / USSD Screenshot ወደ Controller ላክ</span>
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h2 className="text-xs font-semibold text-slate-400">
              Share Control Link
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={telegramShareHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Telegram</span>
              </a>
              <button
                type="button"
                onClick={shareViaSms}
                className="min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>SMS</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
