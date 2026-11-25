export type AppMode = 'control' | 'sender';

export interface BridgeMessage {
  id: string;
  action: 'edit' | 'append' | 'replace' | 'clear' | 'screenshot' | 'ussd' | 'ussd-result' | 'cast' | 'stop' | 'launch' | 'home' | 'touch' | 'ack';
  text?: string;
  code?: string;
  touchX?: number;
  touchY?: number;
  status?: string;
  screenshotUrl?: string;
  ts: number;
}
