/**
 * sw-actions.js
 * Handles:
 * 1. Android Notification inline replies & 1-tap "Done" actions while on Dialer / Home Screen
 * 2. Web Share Target (POST /share-target) for 1-tap Screenshot / USSD text sharing from Android Share Sheet
 */

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('title');
          const text = formData.get('text');
          const media = formData.get('media');

          if (media && typeof media === 'object' && 'arrayBuffer' in media) {
            const cache = await caches.open('ussdcast-shared-v1');
            await cache.put(
              '/_shared-image',
              new Response(media, {
                headers: { 'Content-Type': media.type || 'image/png' },
              })
            );
          }

          const combinedText = [title, text].filter(Boolean).join(' ').trim();
          const targetUrl =
            '/?shared=1' +
            (combinedText ? '&sharedText=' + encodeURIComponent(combinedText) : '') +
            '#mode=sender';
          return Response.redirect(targetUrl, 303);
        } catch {
          return Response.redirect('/#mode=sender', 303);
        }
      })()
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const roomId = data.roomId || 'demo1234';
  const replyText = event.reply ? String(event.reply).trim() : '';
  const action = event.action || '';
  const pendingUrl = data.url ? String(data.url) : '';

  notification.close();

  if (replyText || action === 'done') {
    const finalMsg = replyText ? '📩 ' + replyText : '✅ በNotification ላይ "ተከናውኗል" ተነክቷል';
    const payload = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      action: 'ussd-result',
      text: finalMsg,
      ts: Date.now(),
    };
    event.waitUntil(
      fetch('https://ntfy.sh/tinybridge_v1_' + encodeURIComponent(roomId), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (let i = 0; i < clientsArr.length; i++) {
        const client = clientsArr[i];
        if (pendingUrl && (action === 'run-url' || action === '')) {
          try {
            client.postMessage({ type: 'EXECUTE_URL_CALL', url: pendingUrl });
          } catch {}
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        const target =
          action === 'run-url' && pendingUrl
            ? '/?urlCall=' + encodeURIComponent(pendingUrl) + '#mode=sender&room=' + encodeURIComponent(roomId)
            : '/#mode=sender&room=' + encodeURIComponent(roomId);
        return self.clients.openWindow(target);
      }
    })
  );
});
