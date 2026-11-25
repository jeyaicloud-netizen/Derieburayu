/**
 * ReliableCommandBus.ts
 * Dual-channel reliable command delivery with Retry-Until-ACK over PeerJS and ntfy.sh
 */

import { BRIDGE_CONFIG } from './BridgeConfig';
import { BridgeMessage } from './types';

export class ReliableCommandBus {
  private roomId: string;
  private pendingAcks = new Map<string, { msg: BridgeMessage; timer: any; retries: number }>();
  private onCommandReceived?: (msg: BridgeMessage) => void;
  private onAckReceived?: (cmdId: string) => void;
  private eventSource: EventSource | null = null;

  constructor(roomId: string, onCommandReceived?: (msg: BridgeMessage) => void, onAckReceived?: (cmdId: string) => void) {
    this.roomId = roomId;
    this.onCommandReceived = onCommandReceived;
    this.onAckReceived = onAckReceived;
  }

  public startListening() {
    const sseUrl = `${BRIDGE_CONFIG.ntfyBaseUrl}/tinybridge_v1_${this.roomId}/sse`;
    try {
      this.eventSource = new EventSource(sseUrl);
      this.eventSource.onmessage = (event) => {
        try {
          const env = JSON.parse(event.data);
          if (env.event === 'message' && typeof env.message === 'string') {
            const msg: BridgeMessage = JSON.parse(env.message);
            if (msg.action === 'ack') {
              if (this.pendingAcks.has(msg.id)) {
                const item = this.pendingAcks.get(msg.id)!;
                clearInterval(item.timer);
                this.pendingAcks.delete(msg.id);
                if (this.onAckReceived) this.onAckReceived(msg.id);
              }
            } else {
              // Send ACK back
              this.sendAck(msg.id);
              if (this.onCommandReceived) this.onCommandReceived(msg);
            }
          }
        } catch {}
      };
    } catch {}
  }

  public async sendCommand(action: BridgeMessage['action'], payload: Partial<BridgeMessage>, dataChannel?: RTCDataChannel | null): Promise<string> {
    const msg: BridgeMessage = {
      id: 'cmd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      action,
      ...payload,
      ts: Date.now()
    };

    // Send via DataChannel if open
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify(msg));
      } catch {}
    }

    // Send via ntfy pub/sub
    await this.postNtfy(msg);

    // Setup Retry-Until-ACK
    return new Promise((resolve) => {
      let retries = 0;
      const timer = setInterval(async () => {
        retries++;
        if (retries > 10) {
          clearInterval(timer);
          this.pendingAcks.delete(msg.id);
          resolve(msg.id);
          return;
        }
        if (dataChannel && dataChannel.readyState === 'open') {
          try { dataChannel.send(JSON.stringify(msg)); } catch {}
        }
        await this.postNtfy(msg);
      }, 500);

      this.pendingAcks.set(msg.id, { msg, timer, retries });
    });
  }

  private async sendAck(cmdId: string) {
    const ackMsg: BridgeMessage = {
      id: cmdId,
      action: 'ack',
      ts: Date.now()
    };
    await this.postNtfy(ackMsg);
  }

  private async postNtfy(msg: BridgeMessage) {
    try {
      await fetch(`${BRIDGE_CONFIG.ntfyBaseUrl}/tinybridge_v1_${this.roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      });
    } catch {}
  }

  public destroy() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.pendingAcks.forEach((item) => clearInterval(item.timer));
    this.pendingAcks.clear();
  }
}
