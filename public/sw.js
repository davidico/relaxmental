/* Service worker de Mi Semana: la app abre aunque no haya internet.
   - Páginas: primero la red; si falla, la copia guardada.
   - Archivos de la app (/_next, iconos): copia guardada y se actualiza en segundo plano.
   - Nunca toca /api ni el login de Cloudflare Access. */
const CACHE = "mi-semana-v2";
const SHELL = ["/hoy", "/semana", "/habitos", "/cerebro", "/tareas", "/perfil"];

self.addEventListener("install", (e) => {
  // Una por una: si alguna falla (p. ej. sesión caducada), las demás se guardan igual
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
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
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/hoy")).then((r) => r || offline(url.pathname))),
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

/* Si no hay red ni copia guardada: una pantalla en español con salida, en vez del error en blanco */
function offline(path) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mi Semana</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f5f4ee;color:#1f2316;padding:24px;box-sizing:border-box}
main{max-width:360px}h1{font-size:24px;margin:0 0 8px}p{color:#5c6150;margin:0 0 20px}
a{display:inline-flex;align-items:center;min-height:48px;padding:0 20px;border-radius:12px;background:#4a5524;color:#fff;font-weight:700;text-decoration:none;margin:0 8px 8px 0}
a.g{background:#fff;color:#1f2316;border:1px solid #e6e4d8}
@media (prefers-color-scheme:dark){body{background:#12140d;color:#eeefe2}p{color:#aeb29c}a{background:#b9c584;color:#12140d}a.g{background:#1b1e14;color:#eeefe2;border-color:#2c3021}}</style></head>
<body><main><h1>No se pudo abrir</h1><p>Puede que no haya internet o que tu sesión haya caducado. Vuelve a intentarlo; si te pide entrar, inicia sesión otra vez.</p>
<a href="${path}">Reintentar</a><a class="g" href="/cdn-cgi/access/login/relaxmental.davidcueva-dico.workers.dev?redirect_url=${encodeURIComponent(path)}">Iniciar sesión</a></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

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
