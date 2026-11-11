/* Service worker de Mi Semana: la app abre aunque no haya internet.
   - Páginas: primero la red; si falla, la copia guardada.
   - Archivos de la app (/_next, iconos): copia guardada y se actualiza en segundo plano.
   - Nunca toca /api ni el login de Cloudflare Access. */
const CACHE = "mi-semana-v1";
const SHELL = ["/hoy", "/semana", "/habitos", "/cerebro", "/tareas", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok && r.type === "basic" && !r.redirected) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/hoy"))),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((r) => {
          if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
          return r;
        });
        return hit || net;
      }),
    );
  }
});

/* Avisos: el Worker manda un push al empezar cada bloque del día */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "Mi Semana", {
      body: d.body || "",
      tag: d.tag || "mi-semana",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/hoy" },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/hoy";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      const c = cs.find((x) => new URL(x.url).origin === location.origin);
      if (c) return c.focus().then(() => c.navigate(url).catch(() => {}));
      return self.clients.openWindow(url);
    }),
  );
});
