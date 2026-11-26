/**
 * WebScreenMirror.ts
 * Zero-PlayProtect Phone Screen Mirror & MediaProjection Canvas Streamer (Android 8-16).
 * Works even when mobile Chrome blocks getDisplayMedia() by rendering the live DOM viewport
 * or Native Localhost MediaProjection frames onto an HTMLCanvasElement -> captureStream(15) -> WebRTC.
 */

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function isTransparentColor(c: string | null | undefined): boolean {
  if (!c) return true;
  const s = c.trim().toLowerCase();
  return s === 'transparent' || s === 'rgba(0, 0, 0, 0)' || s === 'oklch(0 0 0 / 0)';
}

function getDirectText(el: HTMLElement): string {
  let out = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      out += node.textContent;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export class WebScreenMirror {
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private nativeImgBusy = false;

  public startDomMirror(
    rootSelector = '[data-mirror-root="true"]',
    onBackupFrame?: (dataUrl: string) => void
  ): MediaStream | null {
    this.stop();
    if (typeof document === 'undefined') return null;

    const vw = Math.max(320, window.innerWidth || 390);
    const vh = Math.max(480, window.innerHeight || 844);
    const targetW = 450;
    const targetH = Math.max(560, Math.min(960, Math.round(targetW * (vh / vw))));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    this.active = true;

    const renderFrame = () => {
      if (!this.active || !this.canvas) return;
      const curVw = Math.max(320, window.innerWidth || 390);
      const curVh = Math.max(480, window.innerHeight || 844);
      const desiredH = Math.max(560, Math.min(960, Math.round(targetW * (curVh / curVw))));
      if (canvas.height !== desiredH) {
        canvas.height = desiredH;
      }

      const scaleX = canvas.width / curVw;
      const scaleY = canvas.height / curVh;

      // Base background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const rootEl =
        (document.querySelector(rootSelector) as HTMLElement | null) || document.body;
      const nodes = rootEl.querySelectorAll(
        'div, section, button, a, input, textarea, h1, h2, h3, p, span, code, strong, video'
      );

      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i] as HTMLElement;
        if (el.dataset.mirrorIgnore === 'true') continue;

        const rect = el.getBoundingClientRect();
        if (
          rect.width < 2 ||
          rect.height < 2 ||
          rect.bottom <= 0 ||
          rect.top >= curVh ||
          rect.right <= 0 ||
          rect.left >= curVw
        ) {
          continue;
        }

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          continue;
        }

        const x = rect.left * scaleX;
        const y = rect.top * scaleY;
        const w = rect.width * scaleX;
        const h = rect.height * scaleY;
        const borderR = (parseFloat(style.borderRadius) || 0) * scaleX;

        const bg = style.backgroundColor;
        const borderW = parseFloat(style.borderTopWidth) || 0;
        const borderColor = style.borderTopColor;

        if (!isTransparentColor(bg) || borderW > 0) {
          ctx.save();
          drawRoundedRect(ctx, x, y, w, h, Math.max(0, borderR));
          if (!isTransparentColor(bg)) {
            ctx.fillStyle = '#0f172a';
            ctx.fillStyle = bg;
            ctx.fill();
          }
          if (borderW > 0 && !isTransparentColor(borderColor)) {
            ctx.lineWidth = Math.max(1, borderW * scaleX);
            ctx.strokeStyle = '#1e293b';
            ctx.strokeStyle = borderColor;
            ctx.stroke();
          }
          ctx.restore();
        }

        if (el.tagName === 'VIDEO') {
          const vid = el as HTMLVideoElement;
          if (vid.readyState >= 2) {
            try {
              ctx.save();
              drawRoundedRect(ctx, x, y, w, h, Math.max(0, borderR));
              ctx.clip();
              ctx.drawImage(vid, x, y, w, h);
              ctx.restore();
            } catch {}
          }
          continue;
        }

        const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
        const text = isInput
          ? ((el as HTMLInputElement).value || (el as HTMLInputElement).placeholder || '').trim()
          : getDirectText(el);

        if (text) {
          const isPlaceholder =
            isInput && !(el as HTMLInputElement).value && Boolean((el as HTMLInputElement).placeholder);
          const fontPx = Math.max(10, Math.min(26, (parseFloat(style.fontSize) || 12) * scaleY));
          const isBold =
            Number(style.fontWeight) >= 600 ||
            style.fontWeight === 'bold' ||
            el.tagName === 'BUTTON' ||
            el.tagName === 'H1' ||
            el.tagName === 'H2' ||
            el.tagName === 'STRONG';

          ctx.save();
          drawRoundedRect(ctx, x, y, w, h, Math.max(0, borderR));
          ctx.clip();

          ctx.font = `${isBold ? '600 ' : ''}${fontPx.toFixed(1)}px system-ui, -apple-system, sans-serif`;
          ctx.fillStyle = isPlaceholder ? '#64748b' : '#f1f5f9';
          if (!isPlaceholder && !isTransparentColor(style.color)) {
            ctx.fillStyle = style.color;
          }
          ctx.textBaseline = 'middle';

          const padL = (parseFloat(style.paddingLeft) || (isInput ? 10 : 4)) * scaleX;
          const padR = (parseFloat(style.paddingRight) || (isInput ? 10 : 4)) * scaleX;
          const maxTextW = Math.max(16, w - padL - padR);
          const textAlign = style.textAlign;

          // Simple word wrap if tall element, otherwise single-line middle aligned
          if (h > fontPx * 2.2 && text.length > 24 && el.tagName !== 'BUTTON') {
            const words = text.split(' ');
            let line = '';
            let lineY = y + fontPx * 0.9;
            ctx.textBaseline = 'top';
            for (let wi = 0; wi < words.length; wi++) {
              const test = line ? `${line} ${words[wi]}` : words[wi];
              if (ctx.measureText(test).width > maxTextW && line) {
                ctx.fillText(line, x + padL, lineY);
                line = words[wi];
                lineY += fontPx * 1.28;
                if (lineY > y + h - fontPx * 0.5) break;
              } else {
                line = test;
              }
            }
            if (line && lineY <= y + h) {
              ctx.fillText(line, x + padL, lineY);
            }
          } else {
            let drawText = text;
            while (drawText.length > 3 && ctx.measureText(drawText).width > maxTextW) {
              drawText = `${drawText.slice(0, -2)}…`;
            }
            if (textAlign === 'center' || el.tagName === 'BUTTON') {
              ctx.textAlign = 'center';
              ctx.fillText(drawText, x + w / 2, y + h / 2);
            } else {
              ctx.textAlign = 'left';
              ctx.fillText(drawText, x + padL, y + h / 2);
            }
          }
          ctx.restore();
        }
      }

      // Draw remote pointer if currently active
      const pointerEl = document.querySelector('[data-remote-pointer="true"]') as HTMLElement | null;
      if (pointerEl) {
        const pRect = pointerEl.getBoundingClientRect();
        const px = (pRect.left + pRect.width / 2) * scaleX;
        const py = (pRect.top + pRect.height / 2) * scaleY;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ef4444';
        ctx.stroke();
        ctx.restore();
      }

      // Subtle top-right live indicator + clock tick so video encoder stays alive
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      drawRoundedRect(ctx, canvas.width - 144, 8, 136, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#2dd4bf';
      ctx.beginPath();
      ctx.arc(canvas.width - 132, 19, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 10px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(`CAST ${new Date().toLocaleTimeString([], { hour12: false })}`, canvas.width - 122, 19);
      ctx.restore();
    };

    renderFrame();
    this.renderTimer = setInterval(renderFrame, 90);

    if (onBackupFrame) {
      this.frameTimer = setInterval(() => {
        if (!this.active || !this.canvas) return;
        try {
          const url = this.canvas.toDataURL('image/jpeg', 0.42);
          onBackupFrame(url);
        } catch {}
      }, 1100);
    }

    try {
      const cap = canvas as HTMLCanvasElement & {
        captureStream?: (fps?: number) => MediaStream;
        mozCaptureStream?: (fps?: number) => MediaStream;
      };
      const stream = cap.captureStream
        ? cap.captureStream(15)
        : cap.mozCaptureStream
        ? cap.mozCaptureStream(15)
        : null;
      this.stream = stream;
      return stream;
    } catch {
      return null;
    }
  }

  public startNativeBridgeMirror(
    bridgeBaseUrl: string,
    onBackupFrame?: (dataUrl: string) => void
  ): MediaStream | null {
    this.stop();
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 800;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    this.active = true;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pollNativeFrame = () => {
      if (!this.active || this.nativeImgBusy || !this.canvas) return;
      this.nativeImgBusy = true;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (this.active && this.canvas) {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            const maxDim = 800;
            const ratio = img.naturalWidth / img.naturalHeight;
            const targetW = ratio >= 1 ? maxDim : Math.max(240, Math.round(maxDim * ratio));
            const targetH = ratio >= 1 ? Math.max(240, Math.round(maxDim / ratio)) : maxDim;
            if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
              this.canvas.width = targetW;
              this.canvas.height = targetH;
            }
          }
          const c = this.canvas.getContext('2d');
          if (c) {
            c.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
          }
        }
        this.nativeImgBusy = false;
      };
      img.onerror = () => {
        this.nativeImgBusy = false;
      };
      img.src = `${bridgeBaseUrl}/frame.jpg?t=${Date.now()}`;
    };

    pollNativeFrame();
    this.renderTimer = setInterval(pollNativeFrame, 90);

    if (onBackupFrame) {
      this.frameTimer = setInterval(() => {
        if (!this.active || !this.canvas) return;
        try {
          onBackupFrame(this.canvas.toDataURL('image/jpeg', 0.45));
        } catch {}
      }, 1000);
    }

    try {
      const cap = canvas as HTMLCanvasElement & {
        captureStream?: (fps?: number) => MediaStream;
      };
      this.stream = cap.captureStream ? cap.captureStream(15) : null;
      return this.stream;
    } catch {
      return null;
    }
  }

  public stop() {
    this.active = false;
    this.nativeImgBusy = false;
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.canvas = null;
  }
}
