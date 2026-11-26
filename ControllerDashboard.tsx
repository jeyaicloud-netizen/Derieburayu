/**
 * ControllerDashboard.tsx
 * Unified Controller UI with App 1 + Tiny App tabs, zero-lag WebRTC screen viewer,
 * interactive step-by-step Web UI guided setup, live laser touch pointer,
 * and remote native Android AutoClick / Back / Home triggers.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  Copy,
  Eraser,
  ExternalLink,
  Hand,
  Home,
  Monitor,
  RefreshCw,
  Send,
  Smartphone,
} from 'lucide-react';
import { WebRtcEngine } from './WebRtcEngine';
import { ReliableCommandBus } from './ReliableCommandBus';
import { TinyAppBridge } from './TinyAppBridge';
import { BridgeMessage } from './types';

interface ControllerDashboardProps {
  roomId: string;
}

const GUIDE_STEPS = [
  {
    step: 1,
    buttonLabel: '1. Install PWA (0% Play Protect)',
    phoneLabel: 'Install App ይንኩ',
    phoneText: 'ከስልኩ ላይ "Install App (0% Play Protect)" የሚለውን ይንኩ።',
  },
  {
    step: 2,
    buttonLabel: '2. Allow Screen Cast',
    phoneLabel: 'Start Screen Cast -> Allow ይንኩ',
    phoneText: '"Start Screen Cast" ነክተው "Entire screen / Allow" ይንኩ።',
  },
  {
    step: 3,
    buttonLabel: '3. Activate Keep-Alive',
    phoneLabel: 'Keep-Alive "Activate" ይንኩ',
    phoneText: 'ስልኩ ከበስተጀርባ እንዳይቆም Keep-Alive "Activate" ይንኩ።',
  },
  {
    step: 4,
    buttonLabel: '4. Tap USSD / Action',
    phoneLabel: 'USSD (*804#) ይንኩ',
    phoneText: 'የተጠቆመውን USSD ቁልፍ ነክተው ውጤቱን ይላኩ።',
  },
];

const POINTER_PRESETS = [
  'Allow ይንኩ',
  'Entire screen ይምረጡ',
  'Install / ጫን ይንኩ',
  'Continue / ቀጥል',
  'እዚህ ይንኩ',
];

export const ControllerDashboard: React.FC<ControllerDashboardProps> = ({ roomId }) => {
  const [activeTab, setActiveTab] = useState<'controller' | 'app1' | 'tiny'>('controller');
  const [ussdCode, setUssdCode] = useState('*804#');
  const [urlCallInput, setUrlCallInput] = useState('tel:*804#');
  const [pointerLabel, setPointerLabel] = useState('Allow ይንኩ');
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [hasStream, setHasStream] = useState(false);
  const [fallbackFrameUrl, setFallbackFrameUrl] = useState<string | null>(null);
  const [pinnedScreenshotUrl, setPinnedScreenshotUrl] = useState<string | null>(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastTap, setLastTap] = useState<{ x: number; y: number } | null>(null);
  const [remoteResult, setRemoteResult] = useState<string>(
    'Waiting for mobile phone connection...'
  );
  const [tinyNotes, setTinyNotes] = useState<string>('');

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackImgRef = useRef<HTMLImageElement | null>(null);
  const engineRef = useRef<WebRtcEngine | null>(null);
  const busRef = useRef<ReliableCommandBus | null>(null);

  const [customDomain, setCustomDomain] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('ussd_cast_custom_domain') ||
        'https://nativeappderieburayu.vercel.app'
      );
    } catch {
      return 'https://nativeappderieburayu.vercel.app';
    }
  });

  const getPublicBaseUrl = () => {
    if (customDomain.trim()) {
      return customDomain.trim().replace(/\/+$/, '');
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // Automatically convert private dev workspace URL to public shared preview URL
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };

  const senderUrl = `${getPublicBaseUrl()}/#mode=sender&room=${roomId}`;

  useEffect(() => {
    TinyAppBridge.setRoomId(roomId);

    const bus = new ReliableCommandBus(roomId, (msg) => {
      if (msg && msg.text) {
        const time = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setRemoteResult((prev) => `[${time}] ${msg.text}\n${prev}`);
      }
    });
    bus.startListening();
    busRef.current = bus;

    const engine = new WebRtcEngine(roomId, false);
    engineRef.current = engine;
    engine.init(
      (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          void remoteVideoRef.current.play().catch(() => {});
        }
        setHasStream(true);
        setRemoteResult((prev) => `Live screen stream connected!\n${prev}`);
      },
      (msg) => {
        if (msg?.action === 'screenshot' && typeof msg.screenshotUrl === 'string') {
          setPinnedScreenshotUrl(msg.screenshotUrl);
          setRemoteResult((prev) => `📷 Dialer/USSD screenshot received!\n${prev}`);
          return;
        }
        bus.handleIncomingMessage(msg, false);
      },
      (connected) => {
        setPeerConnected(connected);
      },
      undefined,
      (dataUrl) => {
        setFallbackFrameUrl(dataUrl);
      }
    );

    const unsubTiny = TinyAppBridge.subscribe((msg) => {
      if (msg.action === 'append' && msg.text) {
        setTinyNotes((prev) => (prev ? `${prev}\n${msg.text}` : msg.text!));
      } else if (msg.action === 'replace' && msg.text !== undefined) {
        setTinyNotes(msg.text);
      }
    });

    return () => {
      unsubTiny();
      engine.destroy();
      bus.destroy();
    };
  }, [roomId]);

  const sendViaDc = (msg: BridgeMessage): boolean => {
    return engineRef.current ? engineRef.current.sendData(msg) : false;
  };

  const sendGuideStep = async (item: (typeof GUIDE_STEPS)[number]) => {
    if (!busRef.current) return;
    setActiveStep(item.step);
    await busRef.current.sendCommand(
      'guide',
      {
        step: item.step,
        label: item.phoneLabel,
        text: item.phoneText,
      },
      sendViaDc
    );
    setRemoteResult((prev) => `Sent Guide Step ${item.step}: ${item.phoneLabel}\n${prev}`);
  };

  const clearGuideOnPhone = async () => {
    if (!busRef.current) return;
    setActiveStep(null);
    setLastTap(null);
    await busRef.current.sendCommand('clear', {}, sendViaDc);
  };

  const sendNativeAction = async (
    action: 'back' | 'home' | 'autoclick',
    enabled?: boolean
  ) => {
    if (!busRef.current) return;
    await busRef.current.sendCommand(action, { enabled }, sendViaDc);
    const label =
      action === 'autoclick'
        ? `Auto Clicker ${enabled ? 'START' : 'STOP'}`
        : action.toUpperCase();
    setRemoteResult((prev) => `Sent Native Action: ${label}\n${prev}`);
  };

  const sendUssdCommand = async () => {
    if (!ussdCode.trim() || !busRef.current) return;
    await busRef.current.sendCommand('ussd', { code: ussdCode.trim() }, sendViaDc);
    setRemoteResult((prev) => `Sent USSD ${ussdCode.trim()} to phone\n${prev}`);
  };

  const sendUrlCall = async (targetUrl?: string, callLabel?: string) => {
    const finalUrl = (targetUrl ?? urlCallInput).trim();
    if (!finalUrl || !busRef.current) return;
    await busRef.current.sendCommand(
      'launch',
      { url: finalUrl, label: callLabel || finalUrl },
      sendViaDc
    );
    setRemoteResult((prev) => `Sent Background WS URL Call: ${finalUrl}\n${prev}`);
  };

  const sendScrollCommand = async (deltaY: number) => {
    if (!busRef.current) return;
    await busRef.current.sendCommand('scroll', { deltaY }, sendViaDc);
  };

  const requestCastRefresh = async (castMode: 'auto' | 'camera' = 'auto') => {
    if (!busRef.current) return;
    await busRef.current.sendCommand('cast', { castMode }, sendViaDc);
    setRemoteResult((prev) => `Requested ${castMode} stream from phone\n${prev}`);
  };

  const handleVideoClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const containerRect = e.currentTarget.getBoundingClientRect();
    let mediaRect = {
      left: containerRect.left,
      top: containerRect.top,
      width: containerRect.width,
      height: containerRect.height,
    };

    const vid = remoteVideoRef.current;
    const img = fallbackImgRef.current;
    const mediaW =
      hasStream && vid && vid.videoWidth > 0
        ? vid.videoWidth
        : img && img.naturalWidth > 0
        ? img.naturalWidth
        : 0;
    const mediaH =
      hasStream && vid && vid.videoHeight > 0
        ? vid.videoHeight
        : img && img.naturalHeight > 0
        ? img.naturalHeight
        : 0;

    if (mediaW > 0 && mediaH > 0) {
      const containerRatio = containerRect.width / containerRect.height;
      const mediaRatio = mediaW / mediaH;
      if (mediaRatio > containerRatio) {
        const renderedH = containerRect.width / mediaRatio;
        mediaRect = {
          left: containerRect.left,
          top: containerRect.top + (containerRect.height - renderedH) / 2,
          width: containerRect.width,
          height: renderedH,
        };
      } else {
        const renderedW = containerRect.height * mediaRatio;
        mediaRect = {
          left: containerRect.left + (containerRect.width - renderedW) / 2,
          top: containerRect.top,
          width: renderedW,
          height: containerRect.height,
        };
      }
    }

    const x = Math.max(
      0,
      Math.min(100, Math.round(((e.clientX - mediaRect.left) / mediaRect.width) * 100))
    );
    const y = Math.max(
      0,
      Math.min(100, Math.round(((e.clientY - mediaRect.top) / mediaRect.height) * 100))
    );
    const dotX = Math.max(
      0,
      Math.min(100, Math.round(((e.clientX - containerRect.left) / containerRect.width) * 100))
    );
    const dotY = Math.max(
      0,
      Math.min(100, Math.round(((e.clientY - containerRect.top) / containerRect.height) * 100))
    );
    setLastTap({ x: dotX, y: dotY });
    setTimeout(() => setLastTap(null), 1500);

    if (busRef.current) {
      await busRef.current.sendCommand(
        'touch',
        { touchX: x, touchY: y, label: pointerLabel.trim() || 'እዚህ ይንኩ' },
        sendViaDc
      );
      setRemoteResult(
        (prev) => `Tap/Click (${x}%, ${y}%) "${pointerLabel || 'እዚህ ይንኩ'}" sent\n${prev}`
      );
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2.5">
              <Monitor className="h-6 w-6 text-teal-400 shrink-0" />
              <span className="truncate">Unified Controller Dashboard</span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <span>Room</span>
              <code className="text-teal-400 font-mono tabular-nums">{roomId}</code>
              <span aria-hidden="true">·</span>
              <span>{peerConnected ? 'Peer Connected' : 'Listening via ntfy + PeerJS'}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('controller')}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'controller'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Controller
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('app1')}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'app1'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              App 1 Bridge
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tiny')}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === 'tiny'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tiny App
            </button>
          </div>
        </div>

        {activeTab === 'controller' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Hand className="h-4 w-4 text-red-400" />
                    የስልክ ስክሪን ላይ ሲነኩ የሚታይ መልዕክት (Tap / Pointer Label)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {POINTER_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPointerLabel(preset)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        pointerLabel === preset
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={pointerLabel}
                  onChange={(e) => setPointerLabel(e.target.value)}
                  placeholder="Custom pointer text..."
                  className="w-full min-h-[40px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div
                onClick={handleVideoClick}
                className="bg-slate-950 rounded-2xl border border-slate-800 aspect-[9/16] max-h-[540px] w-full relative overflow-hidden flex items-center justify-center cursor-crosshair select-none"
                title="Click anywhere on the cast screen to tap on the phone"
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-contain ${hasStream ? 'block' : 'hidden'}`}
                />
                {!hasStream && fallbackFrameUrl && !pinnedScreenshotUrl && (
                  <img
                    ref={fallbackImgRef}
                    src={fallbackFrameUrl}
                    alt="Live phone screen mirror"
                    className="w-full h-full object-contain"
                  />
                )}
                {pinnedScreenshotUrl && (
                  <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
                    <img
                      src={pinnedScreenshotUrl}
                      alt="Uploaded Dialer/USSD Screenshot"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setPinnedScreenshotUrl(null);
                      }}
                      className="absolute top-3 right-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow"
                    >
                      ✕ Live Cast
                    </button>
                  </div>
                )}
                {(hasStream || fallbackFrameUrl) && !pinnedScreenshotUrl && (
                  <span className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md pointer-events-none shadow">
                    ● LIVE CAST (ይንኩት)
                  </span>
                )}
                {lastTap && (
                  <div
                    className="absolute w-10 h-10 rounded-full border-2 border-red-400 bg-red-500/30 pointer-events-none animate-ping"
                    style={{
                      left: `${lastTap.x}%`,
                      top: `${lastTap.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}
                {!hasStream && !fallbackFrameUrl && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 bg-slate-950/90 p-6 text-center pointer-events-none">
                    <Smartphone className="h-10 w-10 text-teal-400" />
                    <div className="space-y-1.5 max-w-sm">
                      <p className="text-sm font-semibold text-slate-200">
                        የቀጥታ ስክሪን ካስት (Live Screen Cast) ይጠብቃል
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        ከታች ያለውን ሊንክ በስልኩ ላይ ሲከፍቱት ወዲያውኑ 0% Play Protect Live Screen Mirror እዚህ ይታያል፤ ከዚያ እዚህ ላይ ሲነኩ ስልኩ ላይ በቀጥታ ይነካል።
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => sendScrollCommand(-260)}
                  className="min-h-[42px] bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1"
                >
                  <ArrowUp className="h-4 w-4" />
                  <span>Up</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendScrollCommand(260)}
                  className="min-h-[42px] bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1"
                >
                  <ArrowDown className="h-4 w-4" />
                  <span>Down</span>
                </button>
                <button
                  type="button"
                  onClick={() => requestCastRefresh('auto')}
                  className="min-h-[42px] bg-teal-700 hover:bg-teal-600 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Cast</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendNativeAction('back')}
                  className="min-h-[42px] bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendNativeAction('home')}
                  className="min-h-[42px] bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1"
                >
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </button>
                <button
                  type="button"
                  onClick={() => requestCastRefresh('camera')}
                  className="min-h-[42px] bg-emerald-700 hover:bg-emerald-600 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1"
                  title="Switch phone stream to Camera"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Cam</span>
                </button>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-teal-300">
                    Mobile Sender PWA Link (Public / Zero Cookie Check)
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {customDomain ? 'Custom Vercel Domain' : 'Public Shared URL'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={senderUrl}
                    className="flex-1 min-h-[44px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(senderUrl)}
                    className="min-h-[44px] px-3.5 bg-teal-600 hover:bg-teal-500 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(senderUrl)}&text=${encodeURIComponent(`Mobile Sender Link: ${senderUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap shrink-0"
                    title="Send directly to Telegram"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Telegram</span>
                  </a>
                  <a
                    href={senderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open</span>
                  </a>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ይህ ሊንክ በሌላ ስልክ ወይም በTelegram ሲከፈት <strong>Action required / Cookie check</strong> ሳይጠይቅ በቀጥታ ይከፈታል።
                </p>
                <div className="pt-2 border-t border-slate-900 flex flex-col sm:flex-row gap-2 items-center">
                  <span className="text-[11px] text-slate-400 shrink-0">የVercel ዶሜይን ካለዎት:</span>
                  <input
                    type="text"
                    value={customDomain}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomDomain(val);
                      try {
                        localStorage.setItem('ussd_cast_custom_domain', val);
                      } catch {}
                    }}
                    placeholder="e.g. https://your-app.vercel.app"
                    className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold text-slate-300">
                    የደረጃ-በደረጃ Web UI ጥቆማ (Step Guide)
                  </h2>
                  <button
                    type="button"
                    onClick={clearGuideOnPhone}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 min-h-[28px] px-2"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {GUIDE_STEPS.map((item) => (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => sendGuideStep(item)}
                      className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl text-left text-xs font-semibold transition-colors border ${
                        activeStep === item.step
                          ? 'bg-amber-600 text-white border-amber-400'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                      }`}
                    >
                      {item.buttonLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
                <h2 className="text-xs font-semibold text-slate-300">
                  USSD Command Console
                </h2>
                <input
                  type="text"
                  value={ussdCode}
                  onChange={(e) => setUssdCode(e.target.value)}
                  placeholder="e.g. *804#"
                  className="w-full min-h-[44px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={sendUssdCommand}
                  className="w-full min-h-[44px] bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  <span>Send Reliable USSD</span>
                </button>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
                <h2 className="text-xs font-semibold text-slate-300">
                  Background WebSocket URL Call (0% Play Protect)
                </h2>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void sendUrlCall('tel:*804#', 'Dial *804#')}
                    className="min-h-[36px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono font-semibold text-teal-300"
                  >
                    tel:*804#
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendUrlCall('tel:*111#', 'Dial *111#')}
                    className="min-h-[36px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-mono font-semibold text-teal-300"
                  >
                    tel:*111#
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendUrlCall('sms:?body=OK', 'Open SMS')}
                    className="min-h-[36px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200"
                  >
                    💬 Open SMS
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void sendUrlCall(
                        'intent:#Intent;action=android.settings.SETTINGS;end',
                        'Android Settings'
                      )
                    }
                    className="min-h-[36px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200"
                  >
                    ⚙️ Settings
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlCallInput}
                    onChange={(e) => setUrlCallInput(e.target.value)}
                    placeholder="tel:*804#, sms:, intent://, https://"
                    className="flex-1 min-h-[40px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => void sendUrlCall()}
                    className="min-h-[40px] px-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold text-white whitespace-nowrap shrink-0"
                  >
                    URL Call
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 flex-1 flex flex-col">
                <h2 className="text-xs font-semibold text-slate-300 mb-2">
                  Live Result & Progress Log
                </h2>
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono tabular-nums text-teal-300 overflow-y-auto min-h-[160px] max-h-[240px] whitespace-pre-wrap">
                  {remoteResult}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'app1' && (
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-100">App 1 Module Integration</h2>
            <p className="text-sm text-slate-400">
              App 1 dispatches USSD commands, step-by-step phone guides, and native Accessibility touch coordinates over PeerJS DataChannel + ntfy.sh into Tiny App and Mobile Sender PWA / Native Android Service.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  TinyAppBridge.dispatchCommand({
                    action: 'append',
                    text: `[App 1] Synced room ${roomId} at ${new Date().toLocaleTimeString()}`,
                  });
                  setActiveTab('tiny');
                }}
                className="min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-semibold text-white"
              >
                Push Sync Note to Tiny App
              </button>
            </div>
          </div>
        )}

        {activeTab === 'tiny' && (
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-100">Tiny App Module Bridge</h2>
            <p className="text-sm text-slate-400">
              Shared Tiny App workspace synchronized via BroadcastChannel & TinyAppBridge.
            </p>
            <textarea
              value={tinyNotes}
              onChange={(e) => {
                setTinyNotes(e.target.value);
                TinyAppBridge.dispatchCommand({ action: 'replace', text: e.target.value });
              }}
              placeholder="Live synced notes and USSD responses appear here..."
              className="w-full min-h-[180px] bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>
        )}
      </div>
    </div>
  );
};
