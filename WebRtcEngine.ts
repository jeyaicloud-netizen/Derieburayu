/**
 * WebRtcEngine.ts
 * Zero-Lag, Anti-Freeze WebRTC Screen Cast via PeerJS Public Cloud & DataChannel
 */

import { Peer, DataConnection } from 'peerjs';
import { BRIDGE_CONFIG } from './BridgeConfig';

export class WebRtcEngine {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private roomId: string;
  private isSender: boolean;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onDataMessage?: (msg: any) => void;

  constructor(roomId: string, isSender: boolean) {
    this.roomId = roomId;
    this.isSender = isSender;
  }

  public async init(onRemoteStream?: (stream: MediaStream) => void, onDataMessage?: (msg: any) => void) {
    this.onRemoteStream = onRemoteStream;
    this.onDataMessage = onDataMessage;

    const peerId = this.isSender ? `tb-agent-${this.roomId}` : `tb-ctrl-${this.roomId}-${Math.random().toString(36).slice(2, 6)}`;
    
    this.peer = new Peer(peerId, {
      host: BRIDGE_CONFIG.peerjs.host,
      port: BRIDGE_CONFIG.peerjs.port,
      secure: BRIDGE_CONFIG.peerjs.secure,
      path: BRIDGE_CONFIG.peerjs.path
    });

    this.peer.on('open', () => {
      if (!this.isSender) {
        this.connectToSender();
      }
    });

    this.peer.on('connection', (connection) => {
      this.conn = connection;
      this.setupDataConnection();
    });

    this.peer.on('call', async (call) => {
      const constraints = { iceServers: BRIDGE_CONFIG.iceServers };
      this.pc = new RTCPeerConnection(constraints);
      
      this.pc.ontrack = (event) => {
        if (event.streams && event.streams[0] && this.onRemoteStream) {
          this.onRemoteStream(event.streams[0]);
        }
      };

      call.answer();
      call.on('stream', (stream) => {
        if (this.onRemoteStream) this.onRemoteStream(stream);
      });
    });
  }

  private connectToSender() {
    if (!this.peer) return;
    const senderPeerId = `tb-agent-${this.roomId}`;
    this.conn = this.peer.connect(senderPeerId);
    this.setupDataConnection();

    // Also call sender for video stream
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false }).catch(() => {}).then(() => {
      const constraints = { iceServers: BRIDGE_CONFIG.iceServers };
      this.pc = new RTCPeerConnection(constraints);
      this.pc.ontrack = (event) => {
        if (event.streams && event.streams[0] && this.onRemoteStream) {
          this.onRemoteStream(event.streams[0]);
        }
      };
      const call = this.peer?.call(senderPeerId, new MediaStream());
      call?.on('stream', (stream) => {
        if (this.onRemoteStream) this.onRemoteStream(stream);
      });
    });
  }

  private setupDataConnection() {
    if (!this.conn) return;
    this.conn.on('data', (data: any) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (this.onDataMessage) this.onDataMessage(parsed);
      } catch {}
    });
  }

  public async startCaptureAndOffer(): Promise<MediaStream | null> {
    if (!this.isSender || !this.peer) return null;
    try {
      const md = navigator.mediaDevices as any;
      if (md && typeof md.getDisplayMedia === 'function') {
        this.localStream = await md.getDisplayMedia({
          video: { frameRate: { ideal: 30 }, width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: false
        });
      }

      if (this.localStream && this.peer) {
        // Listen for incoming calls to stream video
        this.peer.on('call', (call) => {
          call.answer(this.localStream!);
        });
      }

      return this.localStream;
    } catch (e) {
      return null;
    }
  }

  public sendData(data: any) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(JSON.stringify(data));
      } catch {}
    }
  }

  public destroy() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    if (this.peer) {
      this.peer.destroy();
    }
  }
}
