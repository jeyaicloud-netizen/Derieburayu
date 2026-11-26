/**
 * ReliableCommandBus.ts
 * Dual-channel reliable command delivery with Retry-Until-ACK over PeerJS DataChannel and ntfy.sh
 */

import { BRIDGE_CONFIG } from './BridgeConfig';
import { BridgeMessage } from './types';

export class ReliableCommandBus {
  private roomId: string;
  private pendingAcks = new Map<string, { msg: BridgeMessage; timer: ReturnType<typeof setInterval>; retries: number; resolve: (id: string) => void }>();
  private sentIds = new Set<string>();
  private receivedIds = new Set<string>();
  private onCommandReceived?: (msg: BridgeMessage) => void;
  private onAckReceived?: (cmdId: string) => void;
  private eventSource: EventSource | null = null;
  private webSocket: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    roomId: string,
    onCommandReceived?: (msg: BridgeMessage) => void,
    onAckReceived?: (cmdId: string) => void
  ) {
    this.roomId = roomId;
    this.onCommandReceived = onCommandReceived;
    this.onAckReceived = onAckReceived;
  }

  private handleEnvelopeText(raw: string) {
    try {
      const env = JSON.parse(raw);
      if (env.event === 'message' && typeof env.message === 'string') {
        const msg: BridgeMessage = JSON.parse(env.message);
        this.handleIncomingMessage(msg, true);
      }
    } catch {}
  }

  private connectWebSocket() {
    if (this.destroyed || typeof WebSocket === 'undefined') return;
    if (
      this.webSocket &&
      (this.webSocket.readyState === WebSocket.OPEN ||
        this.webSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    try {
      const wsBase = BRIDGE_CONFIG.ntfyBaseUrl.replace(/^http/i, 'ws');
      const wsUrl = `${wsBase}/tinybridge_v1_${this.roomId}/ws`;
      const ws = new WebSocket(wsUrl);
      this.webSocket = ws;
      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          this.handleEnvelopeText(event.data);
        }
      };
      ws.onclose = () => {
        if (this.webSocket === ws) {
          this.webSocket = null;
        }
        if (!this.destroyed) {
          if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = setTimeout(() => {
            this.connectWebSocket();
          }, 1800);
        }
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    } catch {}
  }

  private connectSse() {
    if (this.destroyed || typeof EventSource === 'undefined') return;
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      return;
    }
    const sseUrl = `${BRIDGE_CONFIG.ntfyBaseUrl}/tinybridge_v1_${this.roomId}/sse`;
    try {
      this.eventSource = new EventSource(sseUrl);
      this.eventSource.onmessage = (event) => {
        if (typeof event.data === 'string') {
          this.handleEnvelopeText(event.data);
        }
      };
    } catch {}
  }

  private handleResume = () => {
    if (this.destroyed) return;
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      this.connectWebSocket();
      this.connectSse();
    }
  };

  private handleOnline = () => {
    if (this.destroyed) return;
    this.connectWebSocket();
    this.connectSse();
  };

  public startListening() {
    this.destroyed = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleResume);
      document.addEventListener('visibilitychange', this.handleResume);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.addEventListener('online', this.handleOnline);
      window.removeEventListener('focus', this.handleResume);
      window.addEventListener('focus', this.handleResume);
      window.removeEventListener('pageshow', this.handleResume);
      window.addEventListener('pageshow', this.handleResume);
    }
    this.connectWebSocket();
    this.connectSse();
  }

  public handleIncomingMessage(msg: BridgeMessage, sendAckBack = true) {
    if (!msg || !msg.id || !msg.action) return;

    if (msg.action === 'ack') {
      const item = this.pendingAcks.get(msg.id);
      if (item) {
        clearInterval(item.timer);
        this.pendingAcks.delete(msg.id);
        item.resolve(msg.id);
        if (this.onAckReceived) this.onAckReceived(msg.id);
      }
      return;
    }

    // Ignore our own published messages echoed back by ntfy SSE
    if (this.sentIds.has(msg.id)) return;

    // Deduplicate retried deliveries
    if (this.receivedIds.has(msg.id)) {
      if (sendAckBack) this.sendAck(msg.id);
      return;
    }
    this.receivedIds.add(msg.id);
    if (this.receivedIds.size > 200) {
      const oldest = this.receivedIds.values().next().value;
      if (oldest) this.receivedIds.delete(oldest);
    }

    if (sendAckBack) {
      this.sendAck(msg.id);
    }
    if (this.onCommandReceived) {
      this.onCommandReceived(msg);
    }
  }

  public async sendCommand(
    action: BridgeMessage['action'],
    payload: Partial<BridgeMessage>,
    sendViaDataChannel?: (msg: BridgeMessage) => boolean
  ): Promise<string> {
    const msg: BridgeMessage = {
      id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action,
      ...payload,
      ts: Date.now(),
    };

    this.sentIds.add(msg.id);
    if (this.sentIds.size > 200) {
      const oldest = this.sentIds.values().next().value;
      if (oldest) this.sentIds.delete(oldest);
    }

    const sentDc = sendViaDataChannel ? sendViaDataChannel(msg) : false;
    await this.postNtfy(msg);

    if (sentDc) {
      return msg.id;
    }

    return new Promise((resolve) => {
      let retries = 0;
      const timer = setInterval(async () => {
        retries++;
        if (retries > 6) {
          clearInterval(timer);
          this.pendingAcks.delete(msg.id);
          resolve(msg.id);
          return;
        }
        if (sendViaDataChannel) {
          sendViaDataChannel(msg);
        }
        await this.postNtfy(msg);
      }, 600);

      this.pendingAcks.set(msg.id, { msg, timer, retries, resolve });
    });
  }

  private async sendAck(cmdId: string) {
    const ackMsg: BridgeMessage = {
      id: cmdId,
      action: 'ack',
      ts: Date.now(),
    };
    await this.postNtfy(ackMsg);
  }

  private async postNtfy(msg: BridgeMessage) {
    try {
      await fetch(`${BRIDGE_CONFIG.ntfyBaseUrl}/tinybridge_v1_${this.roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
    } catch {}
  }

  public destroy() {
    this.destroyed = true;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleResume);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('focus', this.handleResume);
      window.removeEventListener('pageshow', this.handleResume);
    }
    if (this.webSocket) {
      try {
        this.webSocket.close();
      } catch {}
      this.webSocket = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.pendingAcks.forEach((item) => clearInterval(item.timer));
    this.pendingAcks.clear();
  }
}
