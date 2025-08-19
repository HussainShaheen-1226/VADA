self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("vada-cache").then((c) => c.addAll(["/"])));
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
self.addEventListener("push", (event) => {
  try {
    const data = event.data?.json() || {};
    event.waitUntil(
      self.registration.showNotification(data.title || "VADA", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        tag: data.tag || "vada"
      })
    );
  } catch {}
});
