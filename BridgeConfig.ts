/**
 * BridgeConfig.ts
 * Permanent Zero-Signup Public Infrastructure: PeerJS Cloud & ntfy.sh Pub/Sub
 */

export const BRIDGE_CONFIG = {
  peerjs: {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    path: '/'
  },
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }
  ],
  ntfyBaseUrl: 'https://ntfy.sh'
};
