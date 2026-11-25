/**
 * BackgroundKeepAlive.ts
 * Quadruple Background Keep-Alive Engine: Auto PiP, Web Audio, WakeLock & Web Worker
 */

export class BackgroundKeepAlive {
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private audioCtx: AudioContext | null = null;
  private wakeLock: any = null;
  private worker: Worker | null = null;

  public async activate() {
    // 1. Wake Lock API
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch {}
    }

    // 2. Zero-Volume Web Audio Loop
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(0);
    } catch {}

    // 3. Auto Picture-in-Picture (PiP) canvas heartbeater
    try {
      this.canvasEl = document.createElement('canvas');
      this.canvasEl.width = 300;
      this.canvasEl.height = 300;
      const ctx = this.canvasEl.getContext('2d');
      if (ctx) {
        setInterval(() => {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 300, 300);
          ctx.fillStyle = '#2dd4bf';
          ctx.font = 'bold 24px sans-serif';
          ctx.fillText('UssdCast Active', 40, 150);
          ctx.fillStyle = '#ffffff';
          ctx.font = '16px sans-serif';
          ctx.fillText(new Date().toLocaleTimeString(), 90, 190);
        }, 1000);

        const stream = this.canvasEl.captureStream(10);
        this.videoEl = document.createElement('video');
        this.videoEl.srcObject = stream;
        this.videoEl.muted = true;
        this.videoEl.playsInline = true;
        await this.videoEl.play();
        if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
          await this.videoEl.requestPictureInPicture();
        }
      }
    } catch {}

    // 4. Web Worker watchdog
    try {
      const blob = new Blob([
        `setInterval(() => { postMessage('heartbeat'); }, 500);`
      ], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = () => {};
    } catch {}
  }

  public destroy() {
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch {}
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
    }
    if (this.worker) {
      this.worker.terminate();
    }
  }
}
