/**
 * MobileSenderApp.tsx
 * Phone PWA with Add-to-Home-Screen installer, Quadruple Background Keep-Alive engine, Screen Cast, and Smart USSD launcher.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Play, Send, Smartphone, Wifi } from 'lucide-react';
import { WebRtcEngine } from './WebRtcEngine';
import { ReliableCommandBus } from './ReliableCommandBus';
import { BackgroundKeepAlive } from './BackgroundKeepAlive';
import { BridgeMessage } from './types';

interface MobileSenderAppProps {
  roomId: string;
}

export const MobileSenderApp: React.FC<MobileSenderAppProps> = ({ roomId }) => {
  const [casting, setCasting] = useState(false);
  const [activeUssd, setActiveUssd] = useState<string | null>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const engineRef = useRef<WebRtcEngine | null>(null);
  const busRef = useRef<ReliableCommandBus | null>(null);
  const keepAliveRef = useRef<BackgroundKeepAlive | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const controlUrl = `${window.location.origin}/#mode=control&room=${roomId}`;

  useEffect(() => {
    // 1. Activate Keep Alive Engine
    const keepAlive = new BackgroundKeepAlive();
    keepAlive.activate();
    keepAliveRef.current = keepAlive;

    // 2. WebRTC Engine
    const engine = new WebRtcEngine(roomId, true);
    engineRef.current = engine;
    engine.init(undefined, (msg) => handleCommand(msg));

    // 3. Reliable Command Bus
    const bus = new ReliableCommandBus(roomId, (msg) => handleCommand(msg));
    bus.startListening();
    busRef.current = bus;

    return () => {
      engine.destroy();
      bus.destroy();
      keepAlive.destroy();
    };
  }, [roomId]);

  const handleCommand = (msg: BridgeMessage) => {
    if (!msg || !msg.action) return;
    setLogs((prev) => [`[Cmd] ${msg.action} ${msg.code || ''}`, ...prev]);

    if (msg.action === 'ussd' && msg.code) {
      setActiveUssd(msg.code);
      executeUssd(msg.code);
    } else if (msg.action === 'touch' && msg.touchX !== undefined && msg.touchY !== undefined) {
      setTouchPos({ x: msg.touchX, y: msg.touchY });
      setTimeout(() => setTouchPos(null), 1500);
    }
  };

  const executeUssd = (code: string) => {
    // Hidden tel: anchor click
    const a = document.createElement('a');
    a.href = `tel:${code.replace(/#/g, '%23')}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const startCasting = async () => {
    if (!engineRef.current) return;
    const stream = await engineRef.current.startCaptureAndOffer();
    if (stream) {
      setCasting(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } else {
      alert('Screen capture permission was cancelled or not supported by browser.');
    }
  };

  const sendUssdReply = async (resultText: string) => {
    setLogs((prev) => [`Result sent: ${resultText}`, ...prev]);
    if (busRef.current) {
      await busRef.current.sendCommand('ussd-result', { text: resultText });
    }
  };

  const shareViaTelegram = () => {
    const text = `PersistentUssdCast Control Link: ${controlUrl}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(controlUrl)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareViaSms = () => {
    const text = `PersistentUssdCast Control Link: ${controlUrl}`;
    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 flex flex-col items-center relative overflow-hidden">
      {touchPos && (
        <div
          className="absolute z-50 w-12 h-12 rounded-full border-4 border-red-500 bg-red-500/30 animate-ping pointer-events-none"
          style={{ left: `${touchPos.x}%`, top: `${touchPos.y}%`, transform: 'translate(-50%, -50%)' }}
        />
      )}

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-teal-400" />
            <h1 className="text-lg font-bold">Tiny Mobile Sender PWA</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            {casting ? 'Casting Live' : 'Ready'}
          </span>
        </div>

        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex justify-between">
            <span>Room ID:</span>
            <span className="font-mono text-teal-400">{roomId}</span>
          </div>
          <div className="flex justify-between">
            <span>Keep-Alive Engine:</span>
            <span className="text-teal-400">Quadruple Active (PiP + Audio + WakeLock)</span>
          </div>
        </div>

        {!casting ? (
          <button
            onClick={startCasting}
            className="w-full min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <Play className="h-5 w-5" />
            <span>Start Screen Cast (0% Play Protect)</span>
          </button>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[260px] border border-slate-800 flex items-center justify-center">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute top-3 left-3 bg-red-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md animate-pulse">
              🔴 STREAMING ACTIVE
            </div>
          </div>
        )}

        <div className="border-t border-slate-800 pt-4 space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">USSD Command & Reply Console</h2>
          <div className="flex gap-2">
            <button
              onClick={() => executeUssd('*804#')}
              className="flex-1 min-h-[40px] bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-bold text-teal-300 border border-slate-700"
            >
              *804# (Balance)
            </button>
            <button
              onClick={() => executeUssd('*111#')}
              className="flex-1 min-h-[40px] bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-bold text-teal-300 border border-slate-700"
            >
              *111# (Data)
            </button>
          </div>
          <div className="bg-teal-950/40 border border-teal-800/60 rounded-xl p-3 text-xs space-y-2">
            <div className="font-semibold text-teal-300">Active USSD: {activeUssd || 'None'}</div>
            <input
              type="text"
              id="ussdReplyInput"
              placeholder="የቴሌኮም USSD መልስ እዚህ ይጻፉ..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={() => {
                const val = (document.getElementById('ussdReplyInput') as HTMLInputElement)?.value || 'USSD Completed';
                sendUssdReply(val);
              }}
              className="w-full bg-teal-700 hover:bg-teal-600 rounded-lg py-2 font-semibold text-white"
            >
              ውጤቱን ወደ Controller ላክ
            </button>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Share Control Link</h2>
          <div className="flex gap-2">
            <button
              onClick={shareViaTelegram}
              className="flex-1 min-h-[40px] bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" /> Telegram
            </button>
            <button
              onClick={shareViaSms}
              className="flex-1 min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Smartphone className="h-3.5 w-3.5" /> SMS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
