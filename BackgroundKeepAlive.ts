/**
 * BackgroundKeepAlive.ts
 * Android 11-16 Zero-ADB, Zero-Root Background Keep-Alive Engine:
 * 1. MediaSession API + Active AudioContext loop (treats PWA as foreground media service)
 * 2. Auto Picture-in-Picture (PiP) live canvas stream
 * 3. Screen Wake Lock API with automatic visibilitychange re-acquisition
 * 4. Web Worker 500ms heartbeat timer
 */

export class BackgroundKeepAlive {
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private canvasTimer: ReturnType<typeof setInterval> | null = null;
  private audioCtx: AudioContext | null = null;
  private oscNode: OscillatorNode | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private active = false;
  private bannerLine1 = 'UssdCast Live';
  private bannerLine2 = 'Ready on Dialer / BG';
  private onFloatingAction?: (action: 'prev' | 'next' | 'toggle') => void;
  private docPipWindow: Window | null = null;

  public setBannerText(line1: string, line2 = '') {
    this.bannerLine1 = line1.slice(0, 26);
    this.bannerLine2 = line2.slice(0, 32);
    if (this.docPipWindow && !this.docPipWindow.closed) {
      const l1 = this.docPipWindow.document.getElementById('pip-l1');
      const l2 = this.docPipWindow.document.getElementById('pip-l2');
      if (l1) l1.textContent = this.bannerLine1;
      if (l2) l2.textContent = this.bannerLine2 || 'Active in Background';
    }
  }

  private handleVisibilityChange = () => {
    if (!this.active) return;
    if (document.visibilityState === 'visible') {
      void this.requestWakeLock();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
      if (this.videoEl && this.videoEl.paused) {
        void this.videoEl.play().catch(() => {});
      }
    }
  };

  public async activate(onFloatingAction?: (action: 'prev' | 'next' | 'toggle') => void) {
    if (onFloatingAction) {
      this.onFloatingAction = onFloatingAction;
    }
    this.active = true;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // 1. Screen Wake Lock API
    await this.requestWakeLock();

    // 2. Active Web Audio Loop + MediaSession (keeps Android Chrome alive in background)
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioCtx) {
          this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }
        if (!this.oscNode) {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          gain.gain.value = 0.0001;
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(0);
          this.oscNode = osc;
        }
      }
    } catch {}

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'UssdCast Live Session',
          artist: 'Background Keep-Alive Active',
          album: 'Zero-APK PWA',
        });
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.setActionHandler('play', () => {
          if (this.audioCtx?.state === 'suspended') {
            void this.audioCtx.resume().catch(() => {});
          }
          if (this.videoEl?.paused) {
            void this.videoEl.play().catch(() => {});
          }
          navigator.mediaSession.playbackState = 'playing';
          this.onFloatingAction?.('toggle');
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          navigator.mediaSession.playbackState = 'playing';
          this.onFloatingAction?.('toggle');
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          navigator.mediaSession.playbackState = 'playing';
          this.onFloatingAction?.('prev');
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          navigator.mediaSession.playbackState = 'playing';
          this.onFloatingAction?.('next');
        });
      } catch {}
    }

    // 3A. Interactive Document Picture-in-Picture (where supported, e.g. Desktop Chromium)
    try {
      const docPip = (window as Window & {
        documentPictureInPicture?: {
          requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
        };
      }).documentPictureInPicture;
      if (docPip && (!this.docPipWindow || this.docPipWindow.closed)) {
        const pipWin = await docPip.requestWindow({ width: 300, height: 220 });
        this.docPipWindow = pipWin;
        pipWin.document.body.style.cssText =
          'margin:0;padding:12px;background:#020617;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;gap:8px;';
        pipWin.document.body.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:#2dd4bf;">● USSDCAST FLOATING</div>
          <div id="pip-l1" style="font-size:15px;font-weight:700;color:#fff;"></div>
          <div id="pip-l2" style="font-size:12px;color:#fbbf24;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;">
            <button id="pip-prev" style="padding:10px;border:none;border-radius:8px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer;">📞 Dial / Paste</button>
            <button id="pip-next" style="padding:10px;border:none;border-radius:8px;background:#059669;color:#fff;font-weight:700;cursor:pointer;">✅ Done (Send)</button>
          </div>
          <button id="pip-toggle" style="padding:8px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#cbd5e1;font-size:12px;font-weight:600;cursor:pointer;">🔔 Ping Controller</button>
        `;
        const l1 = pipWin.document.getElementById('pip-l1');
        const l2 = pipWin.document.getElementById('pip-l2');
        if (l1) l1.textContent = this.bannerLine1;
        if (l2) l2.textContent = this.bannerLine2 || 'Active in Background';
        pipWin.document.getElementById('pip-prev')?.addEventListener('click', () => {
          this.onFloatingAction?.('prev');
        });
        pipWin.document.getElementById('pip-next')?.addEventListener('click', () => {
          this.onFloatingAction?.('next');
        });
        pipWin.document.getElementById('pip-toggle')?.addEventListener('click', () => {
          this.onFloatingAction?.('toggle');
        });
      }
    } catch {}

    // 3B. Android Video Picture-in-Picture (PiP) Interactive MediaSession Controls
    try {
      if (!this.canvasEl) {
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.width = 320;
        this.canvasEl.height = 180;
      }
      const ctx = this.canvasEl.getContext('2d');
      if (ctx) {
        if (this.canvasTimer) clearInterval(this.canvasTimer);
        const drawFrame = () => {
          ctx.fillStyle = '#020617';
          ctx.fillRect(0, 0, 320, 180);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(8, 8, 304, 164);
          ctx.fillStyle = '#2dd4bf';
          ctx.font = 'bold 12px monospace';
          ctx.fillText('● USSDCAST FLOATING', 18, 30);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 18px sans-serif';
          ctx.fillText(this.bannerLine1, 18, 66);
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(this.bannerLine2 || 'Active in Background', 18, 96);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(14, 122, 292, 36);
          ctx.fillStyle = '#e2e8f0';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('⏮ Dial/Paste   ⏯ Ping   ⏭ Done', 24, 144);
        };
        drawFrame();
        this.canvasTimer = setInterval(drawFrame, 1000);

        if (!this.videoEl) {
          const stream = this.canvasEl.captureStream(5);
          this.videoEl = document.createElement('video');
          this.videoEl.srcObject = stream;
          this.videoEl.muted = true;
          this.videoEl.playsInline = true;
          this.videoEl.loop = true;
          this.videoEl.setAttribute('playsinline', 'true');
          this.videoEl.setAttribute('webkit-playsinline', 'true');
          this.videoEl.style.position = 'fixed';
          this.videoEl.style.width = '1px';
          this.videoEl.style.height = '1px';
          this.videoEl.style.opacity = '0.01';
          this.videoEl.style.pointerEvents = 'none';
        }
        await this.videoEl.play();
        if (
          document.pictureInPictureEnabled &&
          !document.pictureInPictureElement &&
          this.videoEl.requestPictureInPicture
        ) {
          await this.videoEl.requestPictureInPicture();
        }
      }
    } catch {}

    // 4. Web Worker background heartbeat
    if (!this.worker) {
      try {
        const blob = new Blob([`setInterval(() => { postMessage('heartbeat'); }, 500);`], {
          type: 'application/javascript',
        });
        this.workerUrl = URL.createObjectURL(blob);
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = () => {};
      } catch {}
    }
  }

  public async playAttentionTone() {
    try {
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.14);
    } catch {}
  }

  private async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }
  }

  public destroy() {
    this.active = false;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.canvasTimer) {
      clearInterval(this.canvasTimer);
      this.canvasTimer = null;
    }
    if (this.docPipWindow && !this.docPipWindow.closed) {
      try {
        this.docPipWindow.close();
      } catch {}
      this.docPipWindow = null;
    }
    if (document.pictureInPictureElement === this.videoEl) {
      void document.exitPictureInPicture().catch(() => {});
    }
    if (this.videoEl) {
      const stream = this.videoEl.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    if (this.wakeLock) {
      try {
        void this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
    if (this.oscNode) {
      try {
        this.oscNode.stop();
      } catch {}
      this.oscNode = null;
    }
    if (this.audioCtx) {
      try {
        void this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
  }
}
