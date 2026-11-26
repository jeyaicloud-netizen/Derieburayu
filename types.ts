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
    | 'scroll'
    | 'guide'
    | 'ack';
  text?: string;
  code?: string;
  url?: string;
  label?: string;
  step?: number;
  enabled?: boolean;
  touchX?: number;
  touchY?: number;
  deltaY?: number;
  castMode?: 'auto' | 'screen' | 'mirror' | 'camera' | 'native';
  status?: string;
  screenshotUrl?: string;
  ts: number;
}
