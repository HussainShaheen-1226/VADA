// Minimal SW to display Web Push notifications
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { body: e.data?.text() }; }
  const title = data.title || 'VADA';
  const options = {
    body: data.body || 'New message',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
