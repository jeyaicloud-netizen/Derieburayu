import { BridgeMessage } from './types';

class TinyAppBridgeClass extends EventTarget {
  private channel: BroadcastChannel | null = null;
  private roomId: string = 'demo1234';

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('tiny_app_bridge_v1');
        this.channel.onmessage = (event) => {
          if (event.data && event.data.action) {
            this.dispatchEvent(new CustomEvent('bridge-message', { detail: event.data }));
          }
        };
      } catch {}
    }
  }

  public setRoomId(roomId: string) {
    this.roomId = roomId;
  }

  public dispatchCommand(msg: Omit<BridgeMessage, 'id' | 'ts'>): BridgeMessage {
    const fullMsg: BridgeMessage = {
      ...msg,
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
    };
    if (this.channel) {
      try {
        this.channel.postMessage(fullMsg);
      } catch {}
    }
    this.dispatchEvent(new CustomEvent('bridge-message', { detail: fullMsg }));
    return fullMsg;
  }

  public subscribe(callback: (msg: BridgeMessage) => void) {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail) callback(ce.detail);
    };
    this.addEventListener('bridge-message', handler);
    return () => this.removeEventListener('bridge-message', handler);
  }
}

export const TinyAppBridge = new TinyAppBridgeClass();
