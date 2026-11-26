export type AppMode = 'control' | 'sender';

export interface BridgeMessage {
  id: string;
  action:
    | 'edit'
    | 'append'
    | 'replace'
    | 'clear'
    | 'screenshot'
    | 'ussd'
    | 'ussd-result'
    | 'cast'
    | 'stop'
    | 'launch'
    | 'home'
    | 'back'
    | 'autoclick'
    | 'touch'
    | 'guide'
    | 'ack';
  text?: string;
  code?: string;
  label?: string;
  step?: number;
  enabled?: boolean;
  touchX?: number;
  touchY?: number;
  status?: string;
  screenshotUrl?: string;
  ts: number;
}
