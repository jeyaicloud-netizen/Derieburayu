/**
 * App.tsx
 * Master Hash Router switching seamlessly between Mobile Sender PWA and Controller Dashboard.
 */

import React, { useEffect, useState } from 'react';
import { MobileSenderApp } from './MobileSenderApp';
import { ControllerDashboard } from './ControllerDashboard';
import { AppMode } from './types';

export function App() {
  const [mode, setMode] = useState<AppMode>('control');
  const [roomId, setRoomId] = useState<string>('demo1234');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const m = params.get('mode');
      const r = params.get('room');

      if (m === 'sender' || m === 'control') {
        setMode(m);
      }
      if (r && r.length >= 6) {
        setRoomId(r);
        try {
          localStorage.setItem('ussd_cast_room', r);
        } catch {}
      } else {
        try {
          const saved = localStorage.getItem('ussd_cast_room');
          if (saved) setRoomId(saved);
        } catch {}
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div>
      {mode === 'sender' ? (
        <MobileSenderApp roomId={roomId} />
      ) : (
        <ControllerDashboard roomId={roomId} />
      )}
    </div>
  );
}

export default App;
