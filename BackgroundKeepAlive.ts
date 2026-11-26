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

  public async activate() {
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
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          navigator.mediaSession.playbackState = 'playing';
        });
      } catch {}
    }

    // 3. Auto Picture-in-Picture (PiP) canvas heartbeater
    try {
      if (!this.canvasEl) {
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.width = 300;
        this.canvasEl.height = 160;
      }
      const ctx = this.canvasEl.getContext('2d');
      if (ctx) {
        if (this.canvasTimer) clearInterval(this.canvasTimer);
        const drawFrame = () => {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 300, 160);
          ctx.fillStyle = '#2dd4bf';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText('UssdCast Background', 36, 72);
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '14px monospace';
          ctx.fillText(new Date().toLocaleTimeString(), 96, 108);
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
