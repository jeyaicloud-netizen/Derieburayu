/**
 * MobileSenderApp.tsx
 * Zero-PlayProtect Phone PWA with Add-to-Home-Screen installer, Background Keep-Alive,
 * Screen Cast, Smart USSD launcher, Live Guided Pointer, and Localhost Bridge to Native APK (127.0.0.1:8765).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
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
  const [keepAliveReady, setKeepAliveReady] = useState(false);
  const [nativeBridgeOnline, setNativeBridgeOnline] = useState(false);
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

  const engineRef = useRef<WebRtcEngine | null>(null);
  const busRef = useRef<ReliableCommandBus | null>(null);
  const keepAliveRef = useRef<BackgroundKeepAlive | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const checkNativeBridge = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${NATIVE_BRIDGE_URL}/ping`, { mode: 'cors' });
      const ok = res.ok;
      setNativeBridgeOnline(ok);
      return ok;
    } catch {
      setNativeBridgeOnline(false);
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
    }, 8000);

    const keepAlive = new BackgroundKeepAlive();
    keepAliveRef.current = keepAlive;

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
      undefined,
      () => {
        setCasting(false);
        setStatusNotice('Screen Cast ተቋርጧል — እንደገና ለመጀመር "Start Screen Cast" ይንኩ።');
      }
    );

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      clearInterval(bridgePoll);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
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

  const notifyInBackground = async (title: string, body: string) => {
    await keepAliveRef.current?.playAttentionTone();
    try {
      navigator.vibrate?.([80, 40, 80]);
    } catch {}

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            tag: 'ussdcast-bg-cmd',
          });
        } else if (document.hidden) {
          new Notification(title, { body, icon: '/pwa-192x192.png' });
        }
      } catch {}
    }
  };

  const ensureBackgroundActive = async () => {
    if (!keepAliveReady && keepAliveRef.current) {
      await keepAliveRef.current.activate();
      setKeepAliveReady(true);
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotifReady(perm === 'granted');
      } catch {}
    }
  };

  const handleCommand = (msg: BridgeMessage) => {
    if (!msg || !msg.action) return;

    if (msg.action === 'ussd' && msg.code) {
      setActiveUssd(msg.code);
      executeUssd(msg.code);
      void notifyInBackground(`USSD ${msg.code}`, 'መደወያው ተከፍቷል — ለመደወል ይንኩ');
    } else if (
      msg.action === 'touch' &&
      msg.touchX !== undefined &&
      msg.touchY !== undefined
    ) {
      const label = msg.label || 'እዚህ ይንኩ';
      setTouchPos({ x: msg.touchX, y: msg.touchY, label });
      void forwardToNativeBridge(`/tap?xp=${msg.touchX}&yp=${msg.touchY}`);
      void notifyInBackground('የWeb UI ጥቆማ', label);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(() => setTouchPos(null), 5000);
    } else if (msg.action === 'back') {
      void forwardToNativeBridge('/back');
    } else if (msg.action === 'home') {
      void forwardToNativeBridge('/home');
    } else if (msg.action === 'autoclick') {
      void forwardToNativeBridge(msg.enabled ? '/start' : '/stop');
    } else if (msg.action === 'guide') {
      const label = msg.label || 'መመሪያ';
      const text = msg.text || 'የተጠቆመውን ቁልፍ ይንኩ።';
      setGuidedStep({ step: msg.step || 1, label, text });
      void notifyInBackground(`ደረጃ ${msg.step || 1}: ${label}`, text);
    } else if (msg.action === 'clear') {
      setGuidedStep(null);
      setTouchPos(null);
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

  const executeUssd = (code: string) => {
    setActiveUssd(code);
    const a = document.createElement('a');
    a.href = `tel:${code.replace(/#/g, '%23')}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    void reportProgress(`📞 USSD ${code} ተጀምሯል።`);
  };

  const startCasting = async () => {
    if (!engineRef.current) return;
    await ensureBackgroundActive();
    const stream = await engineRef.current.startCaptureAndOffer();
    if (stream) {
      setCasting(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      await reportProgress('✅ Step 2: Screen Cast Allow ተፈቅዶ በቀጥታ እየተላለፈ ነው።');
    } else {
      setStatusNotice(
        supportsScreenCast
          ? 'የScreen Cast ፍቃድ አልተሰጠም — በድጋሚ ነክተው Allow ይንኩ።'
          : 'ይህ Browser Screen Cast አይደግፍም፤ ነገር ግን USSD፣ Background Keep-Alive እና Touch Pointer በመደበኛው ይሰራሉ።'
      );
    }
  };

  const requestAllPermissionsAndStart = async () => {
    await ensureBackgroundActive();
    if (supportsScreenCast && !casting) {
      await startCasting();
    } else {
      await reportProgress(
        '✅ የሚፈቀዱት የWeb ፍቃዶች (Notifications + Keep-Alive' +
          (casting ? ' + Screen Cast' : '') +
          ') ተጀምረዋል።'
      );
    }
  };

  const sendUssdReply = async () => {
    const textToSend = ussdReplyText.trim() || 'USSD ተጠናቋል';
    await reportProgress(`📩 ${textToSend}`);
    setUssdReplyText('');
  };

  const shareViaSms = () => {
    const text = `PersistentUssdCast Control Link: ${controlUrl}`;
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 flex flex-col items-center relative overflow-x-hidden"
      onClick={() => {
        if (touchPos) setTouchPos(null);
      }}
    >
      {touchPos && (
        <div
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
                  ? '✅ በርቷል'
                  : supportsScreenCast
                  ? '⏳ ይጠብቃል'
                  : '— በዚህ Browser የለም'}
              </span>
              <span>• Native App: {nativeBridgeOnline ? '✅ ተገናኝቷል' : '— Web ብቻ'}</span>
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
            <div className="text-xs font-semibold text-slate-200">
              ደረጃ 2: Screen Cast እና Allow ፍቃድ
            </div>
            {!supportsScreenCast ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                ይህ Browser Screen Cast (`getDisplayMedia`) አያቀርብም፤ ነገር ግን USSD፣ Background Keep-Alive፣ Notifications እና የWeb UI ቀይ ጠቋሚ ሙሉ በሙሉ ይሰራሉ። (Screen Cast ከፈለጉ በSamsung Internet / Edge / Brave ይክፈቱ።)
              </p>
            ) : !casting ? (
              <button
                type="button"
                onClick={startCasting}
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 px-4"
              >
                <Play className="h-5 w-5 shrink-0" />
                <span>Start Screen Cast (Allow ይንኩ)</span>
              </button>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[240px] border border-slate-800 flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
                <span className="absolute top-2.5 left-2.5 bg-red-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
                  Streaming Active
                </span>
              </div>
            )}
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

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => executeUssd('*804#')}
                className="min-h-[44px] bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-mono font-bold text-teal-300 border border-slate-700"
              >
                *804# Balance
              </button>
              <button
                type="button"
                onClick={() => executeUssd('*111#')}
                className="min-h-[44px] bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-mono font-bold text-teal-300 border border-slate-700"
              >
                *111# Data
              </button>
            </div>

            <input
              type="text"
              value={ussdReplyText}
              onChange={(e) => setUssdReplyText(e.target.value)}
              placeholder="የቴሌኮም USSD መልስ እዚህ ይጻፉ..."
              className="w-full min-h-[44px] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-teal-500"
            />
            <button
              type="button"
              onClick={sendUssdReply}
              className="w-full min-h-[44px] bg-teal-600 hover:bg-teal-500 rounded-xl text-xs font-semibold text-white"
            >
              ውጤቱን ወደ Controller ላክ
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
