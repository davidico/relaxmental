/**
 * Worker de Mi Semana.
 * - /api/*  → API que guarda los datos en D1 (una fila por elemento, en JSON).
 * - resto   → la web estática que genera `next build` (carpeta out/).
 *
 * Quién eres lo dice Cloudflare Access: tras iniciar sesión, cada petición lleva
 * un token firmado (Cf-Access-Jwt-Assertion). Lo verificamos aquí, así nadie puede
 * hacerse pasar por otra persona, y cada usuario solo ve sus propias filas.
 */

import { planDe, type Bloque, type Eventos, type Plantilla } from "../lib/plan";
import { sendPush, vapid, type Sub } from "./push";
import { aCompromisos, leerHorario, planDay, preguntas, reescribirReglas, resumenDias, title, transcribe, type AI } from "./ai";

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
  run(): Promise<{ meta?: { changes?: number } }>;
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
let certCache: { at: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;

/** Claves públicas de Access. Se renuevan cada hora, o antes si llega una clave nueva (como mucho 1 vez por minuto). */
async function accessKeys(env: Env, kid: string) {
  const fresh = certCache && Date.now() - certCache.at < 3600_000;
  const known = certCache?.keys.some((k) => k.kid === kid);
  if (!fresh || (!known && Date.now() - certCache!.at > 60_000)) {
    const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
    const keys = r.ok ? ((await r.json()) as { keys?: (JsonWebKey & { kid?: string })[] }).keys : undefined;
    if (Array.isArray(keys) && keys.length) certCache = { at: Date.now(), keys }; // una respuesta mala no se guarda
  }
  return certCache?.keys ?? [];
}

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
    const jwk = (await accessKeys(env, header.kid)).find((k) => k.kid === header.kid);
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

/* ---------- Perfil de cada persona: semana tipo, compromisos y reglas ---------- */
async function perfilDe(env: Env, email: string) {
  const { results } = await env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'perfil' AND id IN ('plantilla', 'eventos', 'reglas')")
    .bind(email)
    .all<{ id: string; data: string }>();
  const o: { plantilla: Plantilla; eventos: Eventos; reglas: string } = { plantilla: {}, eventos: {}, reglas: "" };
  for (const r of results) {
    try {
      const v = JSON.parse(r.data);
      if (r.id === "plantilla" && v && typeof v === "object") o.plantilla = v;
      if (r.id === "eventos" && v && typeof v === "object") o.eventos = v;
      if (r.id === "reglas") o.reglas = String(v?.text ?? "");
    } catch {}
  }
  return o;
}
/** Los días que la persona ajustó a mano (los últimos 30) */
async function diasReales(env: Env, email: string) {
  const { results } = await env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'dias' ORDER BY id DESC LIMIT 30")
    .bind(email)
    .all<{ id: string; data: string }>();
  const out: { fecha: string; bloques: Bloque[] }[] = [];
  for (const r of results) {
    try {
      const v = JSON.parse(r.data);
      if (Array.isArray(v) && v.length) out.push({ fecha: r.id, bloques: v.filter(isBloque) });
    } catch {}
  }
  return out;
}
const fechaMas = (f: string, n: number) => new Date(new Date(f + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

/* ---------- API ---------- */

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const email = await accessEmail(req, env);
  if (!email) return json({ error: "no_auth" }, 401);
  /* Escrituras solo desde la propia app (otra web no puede mandar datos con tu sesión) */
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== url.origin) return json({ error: "origin" }, 403);
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
    const { sent } = await notifyUser(env, email, { title: "¡Avisos activados!", body: "Te avisaré al empezar cada bloque de tu día.", tag: "test", url: "/hoy" });
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
    const { eventos } = await perfilDe(env, email);
    const reales = await diasReales(env, email);
    const ejemplos = resumenDias(reales.filter((d) => d.fecha !== fecha), new Date(fecha + "T12:00:00Z").getUTCDay());
    const bloques = await planDay(env.AI, { reglas, fecha, eventos, tareas, ejemplos });
    if (!bloques.length) return json({ error: "ai_empty" }, 502);
    return json({ bloques });
  }

  if (url.pathname === "/api/ai/preguntas" && req.method === "POST") {
    const { reglas, horario, modo } = (await req.json()) as { reglas?: string; horario?: string; modo?: string };
    const hoy = berlinNow().date;
    const { eventos } = await perfilDe(env, email);
    const prox = Object.keys(eventos).filter((d) => d >= hoy).sort().slice(0, 6);
    const labores = prox.length
      ? `LA APP YA CONOCE SUS COMPROMISOS CON FECHA (ejemplo de los próximos):\n${prox.map((d) => `- ${d}: ${eventos[d].map((e) => e.t + (e.nota ? ` (${e.nota})` : "")).join(", ")}`).join("\n")}`
      : "";
    return json({ preguntas: await preguntas(env.AI, { reglas: String(reglas ?? ""), horario: String(horario ?? ""), labores, modo: String(modo ?? "") }) });
  }
  /* Semana tipo: un día típico por cada día de la semana, armado con sus reglas */
  if (url.pathname === "/api/ai/plantilla" && req.method === "POST") {
    const { reglas } = (await req.json()) as { reglas?: string };
    if (!reglas?.trim()) return json({ error: "bad_input" }, 400);
    const lunes = (() => {
      const h = berlinNow().date;
      const dow = new Date(h + "T12:00:00Z").getUTCDay();
      return fechaMas(h, ((8 - dow) % 7) || 7);
    })();
    const reales = await diasReales(env, email);
    const dias = await Promise.all(
      Array.from({ length: 7 }, (_, i) => fechaMas(lunes, i)).map(async (f) => {
        const dow = new Date(f + "T12:00:00Z").getUTCDay();
        try {
          return [String(dow), await planDay(env.AI, { reglas, fecha: f, eventos: {}, tareas: [], tipo: true, ejemplos: resumenDias(reales, dow) })] as const;
        } catch {
          return [String(new Date(f + "T12:00:00Z").getUTCDay()), []] as const;
        }
      }),
    );
    const plantilla = Object.fromEntries(dias);
    if (dias.every(([, b]) => !b.length)) return json({ error: "ai_empty" }, 502);
    return json({ plantilla });
  }
  /* Compromisos con fecha desde una foto (turnos, labores de la iglesia, calendario) */
  if (url.pathname === "/api/ai/compromisos" && req.method === "POST") {
    const { imagen } = (await req.json()) as { imagen?: string };
    if (!imagen || !/^data:image\/(jpeg|png|webp);base64,/.test(imagen) || imagen.length > 6_000_000) return json({ error: "bad_image" }, 400);
    const texto = await leerHorario(env.AI, imagen);
    if (!texto) return json({ error: "ai_empty" }, 502);
    const { reglas } = await perfilDe(env, email);
    const eventos = await aCompromisos(env.AI, { texto, hoy: berlinNow().date, reglas });
    return json({ eventos, texto });
  }
  if (url.pathname === "/api/ai/horario" && req.method === "POST") {
    const { imagen } = (await req.json()) as { imagen?: string };
    if (!imagen || !/^data:image\/(jpeg|png|webp);base64,/.test(imagen) || imagen.length > 6_000_000) return json({ error: "bad_image" }, 400);
    const texto = await leerHorario(env.AI, imagen);
    if (!texto) return json({ error: "ai_empty" }, 502);
    return json({ texto });
  }
  if (url.pathname === "/api/ai/reglas" && req.method === "POST") {
    const b = (await req.json()) as { reglas?: string; respuestas?: { p?: string; r?: string }[]; mensaje?: string; horario?: string; modo?: string };
    const respuestas = (Array.isArray(b.respuestas) ? b.respuestas : []).slice(0, 20).map((x) => ({ p: String(x?.p ?? "").slice(0, 300), r: String(x?.r ?? "").slice(0, 3000) }));
    const ejemplos = resumenDias(await diasReales(env, email));
    const texto = await reescribirReglas(env.AI, { reglas: String(b.reglas ?? ""), respuestas, mensaje: String(b.mensaje ?? ""), horario: String(b.horario ?? ""), modo: String(b.modo ?? ""), ejemplos });
    if (!texto) return json({ error: "ai_empty" }, 502);
    return json({ reglas: texto });
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
  let failed = 0;
  for (const r of results) {
    try {
      const status = await sendPush(env.DB, JSON.parse(r.data) as Sub, data, APP);
      if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(r.endpoint).run();
      else if (status < 300) sent++;
      else if (status === 429 || status >= 500) failed++; // el servicio de avisos falló: se puede reintentar
    } catch {
      failed++; /* un teléfono que falla no frena a los demás */
    }
  }
  return { sent, failed };
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

const isBloque = (b: unknown): b is Bloque =>
  !!b && typeof (b as Bloque).s === "string" && /^\d{2}:\d{2}/.test((b as Bloque).s) && typeof (b as Bloque).t === "string";

async function tickUser(env: Env, user_email: string, date: string, min: number) {
  const { results: own } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'dias' AND id = ?").bind(user_email, date).all<{ data: string }>();
  const saved: unknown = own[0] ? JSON.parse(own[0].data) : null;
  const blocks: Bloque[] = Array.isArray(saved) ? saved.filter(isBloque) : planDe(date, await perfilDe(env, user_email));
  const due = blocks.filter((b) => toMin(b.s) <= min && min - toMin(b.s) < 10);
  for (const b of due) {
    // La marca se pone de forma atómica: si dos ejecuciones coinciden, solo una avisa
    const key = `${date} ${b.s}`;
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO push_sent (user_email, k) VALUES (?, ?)").bind(user_email, key).run();
    if (ins.meta?.changes === 0) continue;
    const next = blocks.find((x) => toMin(x.s) > toMin(b.s));
    const { sent, failed } = await notifyUser(env, user_email, {
      title: `${b.s} · ${b.t}`,
      body: [b.sub, next ? `Hasta las ${b.e}. Luego: ${next.t}` : `Hasta las ${b.e}`].filter(Boolean).join("\n"),
      tag: "bloque",
      url: "/hoy",
    });
    // Si no llegó a ningún teléfono por un fallo pasajero, se quita la marca y se reintenta el minuto siguiente
    if (!sent && failed) await env.DB.prepare("DELETE FROM push_sent WHERE user_email = ? AND k = ?").bind(user_email, key).run();
  }

  /* Tareas con hora: aviso a esa hora (una sola vez) */
  const { results: ts } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'tareas'").bind(user_email).all<{ data: string }>();
  for (const r of ts) {
    let x: { id?: string; title?: string; step?: string; due?: string; hora?: string; done?: boolean } | null = null;
    try {
      x = JSON.parse(r.data);
    } catch {
      continue;
    }
    if (!x || x.done || x.due !== date || typeof x.hora !== "string" || !/^\d{2}:\d{2}$/.test(x.hora) || typeof x.title !== "string") continue;
    const m = toMin(x.hora);
    if (!(m <= min && min - m < 10)) continue;
    const key = `tarea ${x.id} ${date} ${x.hora}`;
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO push_sent (user_email, k) VALUES (?, ?)").bind(user_email, key).run();
    if (ins.meta?.changes === 0) continue;
    const { sent, failed } = await notifyUser(env, user_email, {
      title: `${x.hora} · ${x.title}`,
      body: x.step ? `Tarea. Primer paso: ${x.step}` : "Es la hora de esta tarea.",
      tag: `tarea-${x.id}`,
      url: "/hoy",
    });
    if (!sent && failed) await env.DB.prepare("DELETE FROM push_sent WHERE user_email = ? AND k = ?").bind(user_email, key).run();
  }
}

/** Cada minuto: si un bloque empezó hace menos de 10 min y no se avisó, se avisa (una sola vez). */
async function tick(env: Env) {
  const { date, min } = berlinNow();
  const { results: users } = await env.DB.prepare("SELECT DISTINCT user_email FROM push_subs").all<{ user_email: string }>();
  for (const { user_email } of users) {
    try {
      await tickUser(env, user_email, date, min);
    } catch {
      /* un dato raro de una persona no deja sin avisos a las demás */
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
        console.error(e);
        return json({ error: "server" }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },
};
