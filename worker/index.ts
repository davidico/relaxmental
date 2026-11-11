/**
 * Worker de Mi Semana.
 * - /api/*  → API que guarda los datos en D1 (una fila por elemento, en JSON).
 * - resto   → la web estática que genera `next build` (carpeta out/).
 *
 * Quién eres lo dice Cloudflare Access: tras iniciar sesión, cada petición lleva
 * un token firmado (Cf-Access-Jwt-Assertion). Lo verificamos aquí, así nadie puede
 * hacerse pasar por otra persona, y cada usuario solo ve sus propias filas.
 */

import { scheduleFor, type Bloque } from "../lib/schedule";
import laboresBase from "../data/labores.json";
import { sendPush, vapid, type Sub } from "./push";
import { planDay, title, transcribe, type AI } from "./ai";

const LABORES = (laboresBase as { dias: Record<string, string[]> }).dias;
const APP = "https://relaxmental.davidcueva-dico.workers.dev";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  AI: AI;
  DB: D1Database;
  /** Ej. "davidico.cloudflareaccess.com" (Zero Trust → Settings → Team domain) */
  ACCESS_TEAM_DOMAIN?: string;
  /** "Application Audience (AUD) Tag" de la aplicación de Access */
  ACCESS_AUD?: string;
}

/* Tipos mínimos de D1 (evitan instalar @cloudflare/workers-types) */
interface D1Result<T> { results: T[] }
interface D1Prepared {
  bind(...v: unknown[]): D1Prepared;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(sql: string): D1Prepared;
  batch(stmts: D1Prepared[]): Promise<unknown>;
}

const TABLAS = new Set(["tareas", "notas", "habitos", "dias", "carpetas", "perfil"]);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/* ---------- Verificación del token de Cloudflare Access ---------- */

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));
let certCache: { at: number; keys: JsonWebKey[] & { kid?: string }[] } | null = null;

async function accessEmail(req: Request, env: Env): Promise<string | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
  const token = req.headers.get("cf-access-jwt-assertion") ?? cookie;
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64url(h))) as { kid: string; alg: string };
    const payload = JSON.parse(new TextDecoder().decode(b64url(p))) as { aud: string | string[]; exp: number; iss: string; email?: string };
    if (header.alg !== "RS256") return null;
    if (!certCache || Date.now() - certCache.at > 3600_000) {
      const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
      certCache = { at: Date.now(), keys: ((await r.json()) as { keys: never[] }).keys };
    }
    const jwk = certCache.keys.find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!ok || !auds.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now() || payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    return payload.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/* ---------- API ---------- */

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const email = await accessEmail(req, env);
  if (!email) return json({ error: "no_auth" }, 401);
  const [, , tabla, id] = url.pathname.split("/").map(decodeURIComponent); // /api/<tabla>/<id>

  if (url.pathname === "/api/me") return json({ email });

  /* ---- Notificaciones ---- */
  if (url.pathname === "/api/push/key") return json({ key: (await vapid(env.DB)).pub });
  if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
    const sub = (await req.json()) as Sub;
    if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "bad_sub" }, 400);
    await env.DB.prepare(
      "INSERT INTO push_subs (endpoint, user_email, data) VALUES (?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_email = excluded.user_email, data = excluded.data",
    )
      .bind(sub.endpoint, email, JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }))
      .run();
    return json({ ok: true });
  }
  if (url.pathname === "/api/push/unsubscribe" && req.method === "POST") {
    const { endpoint } = (await req.json()) as { endpoint?: string };
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_email = ?").bind(endpoint ?? "", email).run();
    return json({ ok: true });
  }
  if (url.pathname === "/api/push/test" && req.method === "POST") {
    const sent = await notifyUser(env, email, { title: "¡Avisos activados!", body: "Te avisaré al empezar cada bloque de tu día.", tag: "test", url: "/hoy" });
    return json({ ok: true, sent });
  }

  if (url.pathname === "/api/data" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT tabla, id, data FROM items WHERE user_email = ?").bind(email).all<{ tabla: string; id: string; data: string }>();
    const out: Record<string, unknown> = { tareas: [], notas: [], habitos: [], carpetas: [], dias: {}, perfil: {} };
    for (const r of results) {
      const v = JSON.parse(r.data);
      if (r.tabla === "dias" || r.tabla === "perfil") (out[r.tabla] as Record<string, unknown>)[r.id] = v;
      else (out[r.tabla] as unknown[]).push(v);
    }
    return json(out);
  }

  /* Subida en bloque (pasar los datos de este navegador a la nube) */
  if (url.pathname === "/api/import" && req.method === "POST") {
    const body = (await req.json()) as { items?: { tabla: string; id: string; data: unknown }[] };
    const items = (body.items ?? []).filter((x) => TABLAS.has(x.tabla) && x.id).slice(0, 2000);
    const stmt = env.DB.prepare(
      "INSERT INTO items (user_email, tabla, id, data) VALUES (?, ?, ?, ?) ON CONFLICT (user_email, tabla, id) DO NOTHING",
    );
    for (let i = 0; i < items.length; i += 100)
      await env.DB.batch(items.slice(i, i + 100).map((x) => stmt.bind(email, x.tabla, String(x.id), JSON.stringify(x.data))));
    return json({ ok: true, count: items.length });
  }

  /* ---- IA ---- */
  if (url.pathname === "/api/voice" && req.method === "POST") {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 6_000_000) return json({ error: "too_large" }, 413);
    return json({ text: await transcribe(env.AI, buf) });
  }
  if (url.pathname === "/api/ai/title" && req.method === "POST") {
    const { text } = (await req.json()) as { text?: string };
    return json({ title: text?.trim() ? await title(env.AI, text) : "" });
  }
  if (url.pathname === "/api/ai/plan" && req.method === "POST") {
    const { fecha, reglas } = (await req.json()) as { fecha?: string; reglas?: string };
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !reglas?.trim()) return json({ error: "bad_input" }, 400);
    const { results } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'tareas'").bind(email).all<{ data: string }>();
    const tareas = results
      .map((r) => JSON.parse(r.data) as { title: string; done?: boolean; due?: string })
      .filter((t) => !t.done && (!t.due || t.due <= fecha))
      .map((t) => t.title);
    const bloques = await planDay(env.AI, { reglas, fecha, labores: LABORES, tareas });
    if (!bloques.length) return json({ error: "ai_empty" }, 502);
    return json({ bloques });
  }

  if (!TABLAS.has(tabla) || !id) return json({ error: "not_found" }, 404);

  if (req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = ? AND id = ?").bind(email, tabla, id).all<{ data: string }>();
    return results[0] ? new Response(results[0].data, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }) : json(null);
  }

  if (req.method === "PUT") {
    const data = await req.text();
    if (data.length > 200_000) return json({ error: "too_large" }, 413);
    JSON.parse(data); // rechaza JSON inválido
    await env.DB.prepare(
      "INSERT INTO items (user_email, tabla, id, data, updated_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT (user_email, tabla, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    )
      .bind(email, tabla, id, data)
      .run();
    return json({ ok: true });
  }
  if (req.method === "DELETE") {
    await env.DB.prepare("DELETE FROM items WHERE user_email = ? AND tabla = ? AND id = ?").bind(email, tabla, id).run();
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
}

/* ---------- Avisos de cada bloque del día ---------- */

async function notifyUser(env: Env, email: string, data: Record<string, string>) {
  const { results } = await env.DB.prepare("SELECT endpoint, data FROM push_subs WHERE user_email = ?").bind(email).all<{ endpoint: string; data: string }>();
  let sent = 0;
  for (const r of results) {
    try {
      const status = await sendPush(env.DB, JSON.parse(r.data) as Sub, data, APP);
      if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(r.endpoint).run();
      else if (status < 300) sent++;
    } catch {
      /* un teléfono que falla no frena a los demás */
    }
  }
  return sent;
}

/** Fecha y minuto del día en Berlín */
function berlinNow(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Cada minuto: si un bloque empezó hace menos de 10 min y no se avisó, se avisa (una sola vez). */
async function tick(env: Env) {
  const { date, min } = berlinNow();
  const { results: users } = await env.DB.prepare("SELECT DISTINCT user_email FROM push_subs").all<{ user_email: string }>();
  for (const { user_email } of users) {
    const { results: own } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'dias' AND id = ?").bind(user_email, date).all<{ data: string }>();
    const blocks: Bloque[] = own[0] ? JSON.parse(own[0].data) : scheduleFor(LABORES, date);
    const due = blocks.filter((b) => toMin(b.s) <= min && min - toMin(b.s) < 10);
    for (const b of due) {
      const key = `${date} ${b.s} ${b.t}`;
      const { results: done } = await env.DB.prepare("SELECT 1 FROM push_sent WHERE user_email = ? AND k = ?").bind(user_email, key).all();
      if (done.length) continue;
      await env.DB.prepare("INSERT OR IGNORE INTO push_sent (user_email, k) VALUES (?, ?)").bind(user_email, key).run();
      const next = blocks.find((x) => toMin(x.s) > toMin(b.s));
      await notifyUser(env, user_email, {
        title: `${b.s} · ${b.t}`,
        body: [b.sub, next ? `Hasta las ${b.e}. Luego: ${next.t}` : `Hasta las ${b.e}`].filter(Boolean).join("\n"),
        tag: "bloque",
        url: "/hoy",
      });
    }
  }
  if (min === 3) await env.DB.prepare("DELETE FROM push_sent WHERE created_at < datetime('now', '-3 days')").bind().run();
}

export default {
  async scheduled(_c: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(tick(env));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return json({ error: "server", detail: String(e) }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
