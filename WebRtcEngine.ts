/**
 * WebRtcEngine.ts
 * Zero-Lag, Anti-Freeze WebRTC Screen Cast via PeerJS Public Cloud & DataChannel
 * Includes automatic background PeerJS reconnect & stream track end handling.
 */

import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { BRIDGE_CONFIG } from './BridgeConfig';

export class WebRtcEngine {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private activeCall: MediaConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteControllerPeerId: string | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private streamReceived = false;
  private roomId: string;
  private isSender: boolean;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onDataMessage?: (msg: any) => void;
  private onConnectionChange?: (connected: boolean) => void;
  private onStreamEnded?: () => void;
  private onFrameReceived?: (dataUrl: string) => void;

  constructor(roomId: string, isSender: boolean) {
    this.roomId = roomId;
    this.isSender = isSender;
  }

  public async init(
    onRemoteStream?: (stream: MediaStream) => void,
    onDataMessage?: (msg: any) => void,
    onConnectionChange?: (connected: boolean) => void,
    onStreamEnded?: () => void,
    onFrameReceived?: (dataUrl: string) => void
  ) {
    this.onRemoteStream = onRemoteStream;
    this.onDataMessage = onDataMessage;
    this.onConnectionChange = onConnectionChange;
    this.onStreamEnded = onStreamEnded;
    this.onFrameReceived = onFrameReceived;

    const peerId = this.isSender
      ? `tb-agent-${this.roomId}`
      : `tb-ctrl-${this.roomId}-${Math.random().toString(36).slice(2, 6)}`;

    this.peer = new Peer(peerId, {
      host: BRIDGE_CONFIG.peerjs.host,
      port: BRIDGE_CONFIG.peerjs.port,
      secure: BRIDGE_CONFIG.peerjs.secure,
      path: BRIDGE_CONFIG.peerjs.path,
      config: { iceServers: BRIDGE_CONFIG.iceServers },
    });

    this.peer.on('open', () => {
      if (!this.isSender) {
        this.connectToSender();
        if (this.reconnectTimer) clearInterval(this.reconnectTimer);
        this.reconnectTimer = setInterval(() => {
          if (this.destroyed) return;
          if (!this.conn || !this.conn.open) {
            this.connectToSender();
          } else if (!this.streamReceived && this.peer?.id) {
            this.sendData({ type: 'request-stream', peerId: this.peer.id });
          }
        }, 3500);
      }
    });

    this.peer.on('disconnected', () => {
      this.onConnectionChange?.(false);
      if (!this.destroyed && this.peer && !this.peer.destroyed) {
        setTimeout(() => {
          try {
            if (!this.destroyed && this.peer?.disconnected) {
              this.peer.reconnect();
            }
          } catch {}
        }, 1000);
      }
    });

    this.peer.on('connection', (connection) => {
      this.conn = connection;
      this.setupDataConnection();
    });

    this.peer.on('call', (call) => {
      this.activeCall = call;
      if (this.isSender && this.localStream) {
        call.answer(this.localStream);
      } else {
        call.answer();
      }
      call.on('stream', (stream) => {
        this.streamReceived = true;
        if (this.onRemoteStream) {
          this.onRemoteStream(stream);
        }
      });
    });

    this.peer.on('error', () => {
      this.onConnectionChange?.(false);
    });
  }

  private connectToSender() {
    if (!this.peer || this.isSender || this.peer.destroyed) return;
    const senderPeerId = `tb-agent-${this.roomId}`;
    const conn = this.peer.connect(senderPeerId, { reliable: true });
    this.conn = conn;
    this.setupDataConnection();
  }

  private setupDataConnection() {
    if (!this.conn) return;
    const currentConn = this.conn;

    currentConn.on('open', () => {
      this.onConnectionChange?.(true);
      if (!this.isSender && this.peer?.id) {
        this.sendData({ type: 'request-stream', peerId: this.peer.id });
      }
    });

    currentConn.on('close', () => {
      this.onConnectionChange?.(false);
    });

    currentConn.on('data', (data: any) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed?.type === 'request-stream' && typeof parsed.peerId === 'string') {
          this.remoteControllerPeerId = parsed.peerId;
          if (this.isSender && this.localStream && this.peer) {
            this.activeCall?.close();
            this.activeCall = this.peer.call(parsed.peerId, this.localStream);
          }
          return;
        }
        if (parsed?.type === 'mirror-frame' && typeof parsed.dataUrl === 'string') {
          this.onFrameReceived?.(parsed.dataUrl);
          return;
        }
        if (parsed?.type === 'uploaded-screenshot' && typeof parsed.dataUrl === 'string') {
          this.onDataMessage?.({ action: 'screenshot', screenshotUrl: parsed.dataUrl });
          return;
        }
        if (this.onDataMessage) {
          this.onDataMessage(parsed);
        }
      } catch {}
    });
  }

  public async startCaptureAndOffer(): Promise<MediaStream | null> {
    if (!this.isSender || !this.peer) return null;
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
      }
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
      };
      if (md && typeof md.getDisplayMedia === 'function') {
        this.localStream = await md.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, max: 30 },
            width: { ideal: 720 },
            height: { ideal: 1280 },
          },
          audio: false,
        });
      }

      if (this.localStream) {
        const [videoTrack] = this.localStream.getVideoTracks();
        if (videoTrack) {
          videoTrack.onended = () => {
            this.localStream = null;
            this.onStreamEnded?.();
          };
        }
        if (this.peer && this.remoteControllerPeerId) {
          this.activeCall?.close();
          this.activeCall = this.peer.call(this.remoteControllerPeerId, this.localStream);
        }
      }

      return this.localStream;
    } catch {
      return null;
    }
  }

  public async startCameraCaptureAndOffer(
    facingMode: 'user' | 'environment' = 'user'
  ): Promise<MediaStream | null> {
    if (!this.isSender || !this.peer) return null;
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: false,
      });
      this.localStream = stream;

      const [videoTrack] = this.localStream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          this.localStream = null;
          this.onStreamEnded?.();
        };
      }
      if (this.peer && this.remoteControllerPeerId) {
        this.activeCall?.close();
        this.activeCall = this.peer.call(this.remoteControllerPeerId, this.localStream);
      }

      return this.localStream;
    } catch {
      return null;
    }
  }

  public startProvidedStreamOffer(stream: MediaStream): MediaStream {
    if (this.localStream && this.localStream !== stream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    this.localStream = stream;
    const [videoTrack] = stream.getVideoTracks();
    if (videoTrack) {
      videoTrack.onended = () => {
        if (this.localStream === stream) {
          this.localStream = null;
          this.onStreamEnded?.();
        }
      };
    }
    if (this.isSender && this.peer && this.remoteControllerPeerId) {
      this.activeCall?.close();
      this.activeCall = this.peer.call(this.remoteControllerPeerId, stream);
    }
    return stream;
  }

  public stopLocalStream() {
    if (this.activeCall) {
      this.activeCall.close();
      this.activeCall = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }

  public sendMirrorFrame(dataUrl: string): boolean {
    return this.sendData({ type: 'mirror-frame', dataUrl });
  }

  public sendData(data: any): boolean {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  public destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.activeCall) {
      this.activeCall.close();
      this.activeCall = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
