/**
 * Worker de Mi Semana.
 * - /api/*  → API que guarda los datos en D1 (una fila por elemento, en JSON).
 * - resto   → la web estática que genera `next build` (carpeta out/).
 *
 * Quién eres lo dice Cloudflare Access: tras iniciar sesión, cada petición lleva
 * un token firmado (Cf-Access-Jwt-Assertion). Lo verificamos aquí, así nadie puede
 * hacerse pasar por otra persona, y cada usuario solo ve sus propias filas.
 */

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

const TABLAS = new Set(["tareas", "notas", "habitos", "dias"]);
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

  if (url.pathname === "/api/data" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT tabla, id, data FROM items WHERE user_email = ?").bind(email).all<{ tabla: string; id: string; data: string }>();
    const out: Record<string, unknown> = { tareas: [], notas: [], habitos: [], dias: {} };
    for (const r of results) {
      const v = JSON.parse(r.data);
      if (r.tabla === "dias") (out.dias as Record<string, unknown>)[r.id] = v;
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

  if (!TABLAS.has(tabla) || !id) return json({ error: "not_found" }, 404);

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

export default {
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
