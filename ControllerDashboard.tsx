/**
 * ControllerDashboard.tsx
 * AI Studio Preview & Remote Control UI with App 1 + Tiny App tabs, zero-lag video viewer, and USSD command bus.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Monitor, Send, Smartphone } from 'lucide-react';
import { WebRtcEngine } from './WebRtcEngine';
import { ReliableCommandBus } from './ReliableCommandBus';
import { TinyAppBridge } from './TinyAppBridge';

interface ControllerDashboardProps {
  roomId: string;
}

export const ControllerDashboard: React.FC<ControllerDashboardProps> = ({ roomId }) => {
  const [activeTab, setActiveTab] = useState<'controller' | 'app1' | 'tiny'>('controller');
  const [ussdCode, setUssdCode] = useState('*804#');
  const [remoteResult, setRemoteResult] = useState<string>('Waiting for mobile phone connection...');
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<WebRtcEngine | null>(null);
  const busRef = useRef<ReliableCommandBus | null>(null);

  const senderUrl = `${window.location.origin}/#mode=sender&room=${roomId}`;

  useEffect(() => {
    TinyAppBridge.setRoomId(roomId);

    // WebRTC engine
    const engine = new WebRtcEngine(roomId, false);
    engineRef.current = engine;
    engine.init((stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      setRemoteResult('Live screen stream connected successfully!');
    });

    // Reliable Command Bus
    const bus = new ReliableCommandBus(roomId, (msg) => {
      if (msg && msg.text) {
        setRemoteResult(`[Result] ${msg.text}`);
      }
    });
    bus.startListening();
    busRef.current = bus;

    return () => {
      engine.destroy();
      bus.destroy();
    };
  }, [roomId]);

  const sendUssdCommand = async () => {
    if (!ussdCode || !busRef.current) return;
    setRemoteResult(`Sending USSD command ${ussdCode}...`);
    await busRef.current.sendCommand('ussd', { code: ussdCode });
    setRemoteResult(`USSD command ${ussdCode} sent via ReliableCommandBus.`);
  };

  const handleVideoClick = async (e: React.MouseEvent<HTMLVideoElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    if (busRef.current) {
      await busRef.current.sendCommand('touch', { touchX: x, touchY: y });
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Monitor className="h-6 w-6 text-teal-400" />
              Unified Controller Dashboard (App 1 + Tiny App)
            </h1>
            <p className="text-xs text-slate-400 mt-1">Room ID: <code className="text-teal-400 font-mono">{roomId}</code></p>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('controller')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'controller' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Live Controller
            </button>
            <button
              onClick={() => setActiveTab('app1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'app1' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              App 1 Bridge
            </button>
            <button
              onClick={() => setActiveTab('tiny')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'tiny' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Tiny App
            </button>
          </div>
        </div>

        {activeTab === 'controller' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 aspect-[9/16] max-h-[550px] relative overflow-hidden flex items-center justify-center cursor-crosshair">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  onClick={handleVideoClick}
                  className="w-full h-full object-contain rounded-xl"
                  title="Click to send touch pointer to phone"
                />
                {!remoteVideoRef.current?.srcObject && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 bg-slate-950/80 p-6 text-center">
                    <Smartphone className="h-12 w-12 text-slate-600 animate-bounce" />
                    <p className="text-sm">Open the Mobile Sender PWA on your phone using the link below. Click anywhere on the video stream to project laser touch pointers.</p>
                  </div>
                )}
              </div>
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mobile Sender PWA Link</h3>
                <div className="flex gap-2">
                  <input type="text" readOnly value={senderUrl} className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300" />
                  <button onClick={() => copyLink(senderUrl)} className="px-3 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-xs font-semibold text-white flex items-center gap-1">
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">USSD Command Console</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={ussdCode}
                    onChange={(e) => setUssdCode(e.target.value)}
                    placeholder="e.g. *804#"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={sendUssdCommand}
                    className="w-full min-h-[44px] bg-teal-600 hover:bg-teal-500 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
                  >
                    <Send className="h-4 w-4" /> Send Reliable USSD
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 flex-1 flex flex-col">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Live Result / Response</h3>
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-teal-300 overflow-y-auto max-h-[220px] whitespace-pre-wrap">
                  {remoteResult}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'app1' && (
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-100">App 1 Module Integration</h2>
            <p className="text-sm text-slate-400">App 1 orchestrates commands over permanent public relays (ntfy.sh / PeerJS) to Tiny App and Mobile Sender PWA.</p>
          </div>
        )}

        {activeTab === 'tiny' && (
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800 space-y-4">
            <h2 className="text-base font-bold text-slate-100">Tiny App Module Bridge</h2>
            <p className="text-sm text-slate-400">Tiny App embeds lightweight bridge features, local offline notes, instant USSD reply pasting, and WebRTC streaming preview.</p>
          </div>
        )}
      </div>
    </div>
  );
};
