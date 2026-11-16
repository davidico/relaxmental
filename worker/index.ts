/**
 * Worker de Mi Semana.
 * - /api/*  → API que guarda los datos en D1 (una fila por elemento, en JSON).
 * - resto   → la web estática que genera `next build` (carpeta out/).
 *
 * Quién eres lo dice Cloudflare Access: tras iniciar sesión, cada petición lleva
 * un token firmado (Cf-Access-Jwt-Assertion). Lo verificamos aquí, así nadie puede
 * hacerse pasar por otra persona, y cada usuario solo ve sus propias filas.
 */

import { planDe, baseDe, type Bloque, type Eventos, type Plantilla } from "../lib/plan";
import { TIPOS } from "../lib/tipos";
import { leerAvisos, semanaPorPlanificar } from "../lib/avisos";
import { DIAS_ORGANIZAR, leerCambios, masDias, paraOrganizar } from "../lib/cambios";
import type { Tarea } from "../lib/types";
import { subtareasQueQuedaron } from "./avisos";
import { PRESUPUESTO, buscarNotas, elegirNotas, type NotaTexto } from "./notas";
import { PRESUPUESTO_CLAUDE, conClaude, responderClaude } from "./claude";
import { sendPush, vapid, type Sub } from "./push";
import { aCompromisos, conclusiones, horasMetas, sesionesMetas, diasPendientes, tiposDe, palabrasClave, notasDelTema, responderNotas, propuestasDiario, responder, resumenSemana, leerHorario, textoNotas, planDay, preguntas, reescribirReglas, reglasDeTipo, resumenDias, title, transcribe, type AI } from "./ai";

const APP = "https://relaxmental.davidcueva-dico.workers.dev";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  AI: AI;
  DB: D1Database;
  /** Ej. "davidico.cloudflareaccess.com" (Zero Trust → Settings → Team domain) */
  ACCESS_TEAM_DOMAIN?: string;
  /** "Application Audience (AUD) Tag" de la aplicación de Access */
  ACCESS_AUD?: string;
  /** Secreto opcional: con él, toda la IA de texto de la app responde con Claude (Anthropic); sin él, Llama de Cloudflare */
  ANTHROPIC_API_KEY?: string;
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
/** Lo que la IA recuerda de la persona (lo ve y lo edita en «Lo que la IA recuerda de mí») */
async function memoriaDe(env: Env, email: string): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'perfil' AND id = 'memoria'").bind(email).all<{ data: string }>();
  try {
    const v = results[0] ? JSON.parse(results[0].data) : [];
    return Array.isArray(v) ? v.map((x) => String(x?.texto ?? "").trim().slice(0, 200)).filter(Boolean).slice(-40) : [];
  } catch {
    return [];
  }
}

/**
 * Los últimos 14 días de la persona, en texto para la IA: diarios, metas y tareas (hechas y sin hacer),
 * lo apuntado para los próximos 7 días y sus hábitos. No incluye las notas del Cerebro.
 */
async function recienteDe(env: Env, email: string, hoy: string): Promise<string> {
  const desde = fechaMas(hoy, -14);
  const hasta = fechaMas(hoy, 7);
  const dia = (f: string) => `${DIAS_ES[new Date(f + "T12:00:00Z").getUTCDay()]} ${f}`;
  const [tq, nq, hq] = await Promise.all([
    env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'tareas'").bind(email).all<{ data: string }>(),
    env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'notas' AND json_extract(data, '$.folder') = 'diario' AND json_extract(data, '$.ref') >= ? ORDER BY json_extract(data, '$.ref') DESC LIMIT 14")
      .bind(email, desde)
      .all<{ data: string }>(),
    env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'habitos'").bind(email).all<{ data: string }>(),
  ]);
  const [extra, dq, perfil] = await Promise.all([
    env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'perfil' AND id IN ('hechos', 'historial')").bind(email).all<{ id: string; data: string }>(),
    env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'dias' AND id >= ? AND id < ?").bind(email, desde, hoy).all<{ id: string; data: string }>(),
    perfilDe(env, email),
  ]);
  const leer = <T,>(rows: { data: string }[]) =>
    rows.flatMap((r) => {
      try {
        return [JSON.parse(r.data) as T];
      } catch {
        return [];
      }
    });
  type T = { title?: string; due?: string; hora?: string; done?: boolean; lado?: string; meta?: boolean; momento?: string };
  const tareas = leer<T>(tq.results).filter((t) => t.title);
  const et = (t: T) => `[${(t.meta ?? !!t.lado) ? "meta · " + (t.lado === "trabajo" ? "trabajo" : "personal") : "tarea"}] ${String(t.title).slice(0, 80)}${t.momento ? ` (dentro de «${t.momento.split("|").slice(1).join("|").slice(0, 40)}»)` : ""}`;
  const partes: string[] = [];

  const json1 = (id: string) => {
    try {
      const r = extra.results.find((x) => x.id === id);
      return r ? JSON.parse(r.data) : undefined;
    } catch {
      return undefined;
    }
  };

  /* Los momentos de su día: cuáles cumplió y cuáles no. Solo cuentan los días en que marcó algo (si no usa los checks, no se sabe) */
  const hechos = (json1("hechos") ?? {}) as Record<string, string[]>;
  const dias: Record<string, Bloque[]> = {};
  for (const r of dq.results) {
    try {
      const v = JSON.parse(r.data);
      if (Array.isArray(v)) dias[r.id] = v.filter(isBloque);
    } catch {}
  }
  const conChecks = Object.keys(hechos).filter((f) => f >= desde && f < hoy && Array.isArray(hechos[f]) && hechos[f].length).sort();
  if (conChecks.length) {
    const por = new Map<string, { t: string; horas: string[]; de: number; si: number }>();
    for (const f of conChecks) {
      const marcados = new Set(hechos[f]);
      for (const b of baseDe(f, { dias, plantilla: perfil.plantilla, eventos: perfil.eventos })) {
        const k = b.t.trim().toLowerCase();
        const x = por.get(k) ?? { t: b.t.trim(), horas: [], de: 0, si: 0 };
        x.de++;
        x.horas.push(b.s);
        if (marcados.has(`${b.s}|${b.t}`)) x.si++;
        por.set(k, x);
      }
    }
    const moda = (xs: string[]) => [...xs].sort((a, b) => xs.filter((y) => y === b).length - xs.filter((y) => y === a).length)[0];
    partes.push(
      `MOMENTOS DE SU DÍA: CUÁLES CUMPLIÓ (en los ${conChecks.length} días de las últimas dos semanas en que marcó lo que hizo):\n` +
        [...por.values()]
          .sort((a, b) => b.de - a.de || a.t.localeCompare(b.t))
          .slice(0, 30)
          .map((x) => `- ${x.t.slice(0, 60)} (normalmente a las ${moda(x.horas)}): hecho ${x.si} de ${x.de} días`)
          .join("\n"),
    );
  }

  /* Lo que cambió a mano en su día: lo que la app le proponía y cómo lo dejó */
  const historial = ((json1("historial") ?? []) as { fecha?: string; antes?: string[]; despues?: string[] }[]).filter((c) => c?.fecha && c.fecha >= desde && Array.isArray(c.antes) && Array.isArray(c.despues));
  if (historial.length) {
    partes.push(
      "CAMBIOS QUE HIZO A MANO EN SU DÍA (lo que la app le proponía → cómo lo dejó):\n" +
        historial
          .slice(-10)
          .reverse()
          .map((c) => {
            const quito = c.antes!.filter((x) => !c.despues!.includes(x)).slice(0, 6);
            const puso = c.despues!.filter((x) => !c.antes!.includes(x)).slice(0, 6);
            return `- ${dia(c.fecha!)}: quitó o movió ${quito.map((x) => `«${String(x).slice(0, 70)}»`).join(", ") || "nada"}; puso ${puso.map((x) => `«${String(x).slice(0, 70)}»`).join(", ") || "nada"}`;
          })
          .join("\n"),
    );
  }

  const pasadas = tareas.filter((t) => t.due && t.due >= desde && t.due <= hoy);
  if (pasadas.length) {
    const dias = [...new Set(pasadas.map((t) => t.due!))].sort().reverse();
    partes.push(
      `METAS Y TAREAS DE LOS ÚLTIMOS 14 DÍAS (${pasadas.filter((t) => t.done).length} hechas de ${pasadas.length}):\n` +
        dias
          .map((d) => {
            const xs = pasadas.filter((t) => t.due === d);
            const si = xs.filter((t) => t.done).map(et);
            const no = xs.filter((t) => !t.done).map(et);
            return `- ${dia(d)}: hechas: ${si.join("; ") || "ninguna"} | sin hacer: ${no.join("; ") || "ninguna"}`;
          })
          .join("\n"),
    );
  }
  const viejas = tareas.filter((t) => !t.done && t.due && t.due < desde);
  if (viejas.length) partes.push("SIN HACER DESDE HACE MÁS DE DOS SEMANAS:\n" + viejas.slice(0, 10).map((t) => `- ${t.due} ${et(t)}`).join("\n"));
  const futuras = tareas.filter((t) => !t.done && t.due && t.due > hoy && t.due <= hasta).sort((a, b) => (a.due! + (a.hora ?? "")).localeCompare(b.due! + (b.hora ?? "")));
  if (futuras.length) partes.push("YA APUNTADO PARA LOS PRÓXIMOS 7 DÍAS:\n" + futuras.slice(0, 30).map((t) => `- ${dia(t.due!)}${t.hora ? " " + t.hora : ""} ${et(t)}`).join("\n"));
  const sinDia = tareas.filter((t) => !t.done && !t.due);
  if (sinDia.length) partes.push("PENDIENTES SIN DÍA:\n" + sinDia.slice(0, 15).map((t) => `- ${String(t.title).slice(0, 80)}`).join("\n"));

  const habitos = leer<{ name?: string; hechos?: Record<string, boolean>; tipo?: string; unidad?: string; cantidades?: Record<string, number> }>(hq.results).filter((h) => h.name);
  if (habitos.length) {
    const ult = Array.from({ length: 14 }, (_, i) => fechaMas(hoy, -i));
    partes.push(
      "HÁBITOS (últimos 14 días):\n" +
        habitos
          .map((h) => {
            const n = ult.filter((f) => h.hechos?.[f]).length;
            let racha = 0;
            for (const f of h.hechos?.[hoy] ? ult : ult.slice(1)) {
              if (!h.hechos?.[f]) break;
              racha++;
            }
            const suma = h.tipo === "medible" ? Math.round(ult.reduce((t, f) => t + (h.cantidades?.[f] ?? 0), 0) * 100) / 100 : 0;
            const clase = h.tipo === "dejar" ? " (lo quiere dejar; cuenta los días que lo logró)" : h.tipo === "medible" ? ` (medible: ${suma} ${h.unidad ?? ""} en total)` : "";
            return `- ${h.name}${clase}: ${n} de 14 días${racha > 1 ? `, racha actual de ${racha}` : ""}`;
          })
          .join("\n"),
    );
  }
  /* Los diarios al final: son lo más largo y, si hay que recortar, se recorta por aquí */
  const diarios = leer<{ ref?: string; text?: string }>(nq.results).filter((n) => n.ref && n.text);
  if (diarios.length) partes.push("DIARIOS (del más reciente al más antiguo):\n" + diarios.slice(0, 10).map((n) => `- ${dia(n.ref!)}: ${String(n.text).replace(/\s+/g, " ").slice(0, 400)}`).join("\n"));
  return partes.join("\n\n");
}
const DIAS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

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

/** Pregúntale a la IA: con la clave de Anthropic responde Claude (todas las notas + el contexto de hoy); si no, la IA de Cloudflare */
async function preguntarIA(req: Request, env: Env, email: string): Promise<Response> {
  const b = (await req.json()) as { pregunta?: string; charla?: { de?: string; texto?: string }[]; itinerario?: unknown };
  const pregunta = String(b.pregunta ?? "").trim().slice(0, 1200);
  if (!pregunta) return json({ error: "bad_request" }, 400);
  const charla = (Array.isArray(b.charla) ? b.charla : [])
    .slice(-6)
    .map((m) => ({ de: m?.de === "ia" ? ("ia" as const) : ("yo" as const), texto: String(m?.texto ?? "").slice(0, 1200) }))
    .filter((m) => m.texto);
  const now = berlinNow();
  const ahora = `${String(Math.floor(now.min / 60)).padStart(2, "0")}:${String(now.min % 60).padStart(2, "0")}`;
  const itinerario = Array.isArray(b.itinerario) ? b.itinerario.map((x) => String(x).slice(0, 160)).slice(0, 60) : [];
  const [nq, cq, memoria, reciente, perfil] = await Promise.all([
    env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'notas'").bind(email).all<{ id: string; data: string }>(),
    env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'carpetas'").bind(email).all<{ id: string; data: string }>(),
    memoriaDe(env, email),
    recienteDe(env, email, now.date),
    perfilDe(env, email),
  ]);
  const carpetas = new Map<string, string>();
  for (const r of cq.results) {
    try {
      carpetas.set(r.id, String((JSON.parse(r.data) as { name?: unknown }).name ?? ""));
    } catch {
      /* una carpeta rara no impide buscar */
    }
  }
  const notas: NotaTexto[] = [];
  for (const r of nq.results) {
    try {
      const n = JSON.parse(r.data) as { title?: unknown; text?: unknown; folder?: unknown; created?: unknown; ref?: unknown; items?: { t?: unknown }[] };
      const texto = (Array.isArray(n.items) && n.items.length ? n.items.map((i) => String(i?.t ?? "")).join("\n") : String(n.text ?? "")).trim();
      const titulo = String(n.title ?? "").trim();
      if (!texto && !titulo) continue;
      notas.push({ id: r.id, titulo, carpeta: carpetas.get(String(n.folder ?? "")) ?? "", fecha: String(n.ref || n.created || "").slice(0, 10), texto: texto.slice(0, 40000) });
    } catch {
      /* una nota rara no impide buscar en las demás */
    }
  }
  /* En una conversación, la pregunta anterior ayuda a entender «¿y qué más decía?» */
  const previa = [...charla].reverse().find((m) => m.de === "yo")?.texto ?? "";
  const fuentesDe = (xs: NotaTexto[], usadas: number[]) => usadas.map((i) => ({ id: xs[i].id, titulo: xs[i].titulo || "Sin título" }));

  /* Con la clave de Anthropic, Claude lee el Cerebro entero (o lo que quepa, eligiendo por palabras si fuera enorme) y el contexto de hoy */
  if (env.ANTHROPIC_API_KEY) {
    /* Lo que puede organizar: los momentos de sus próximos días y sus metas y tareas sin hacer, cada una con su código */
    const [tq, dq] = await Promise.all([
      env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'tareas'").bind(email).all<{ data: string }>(),
      env.DB.prepare("SELECT id, data FROM items WHERE user_email = ? AND tabla = 'dias' AND id >= ? AND id <= ?").bind(email, now.date, masDias(now.date, DIAS_ORGANIZAR)).all<{ id: string; data: string }>(),
    ]);
    const tareas: Tarea[] = [];
    for (const r of tq.results) {
      try {
        const t = JSON.parse(r.data) as Tarea;
        if (t && typeof t.id === "string" && typeof t.title === "string") tareas.push(t);
      } catch {}
    }
    const dias: Record<string, Bloque[]> = {};
    for (const r of dq.results) {
      try {
        const v = JSON.parse(r.data);
        if (Array.isArray(v) && v.length) dias[r.id] = v.filter(isBloque);
      } catch {}
    }
    const datos = { dias, plantilla: perfil.plantilla, eventos: perfil.eventos };
    const org = paraOrganizar(tareas, datos, now.date);
    const total = notas.reduce((s, n) => s + n.texto.length + n.titulo.length + 60, 0);
    const elegidas = total <= PRESUPUESTO_CLAUDE ? elegirNotas(notas, "", PRESUPUESTO_CLAUDE) : elegirNotas(notas, `${pregunta} ${previa} ${await palabrasClave(env.AI, `${previa} ${pregunta}`.trim())}`, PRESUPUESTO_CLAUDE);
    const dia = DIAS_ES[new Date(now.date + "T12:00:00Z").getUTCDay()];
    const contexto = [
      `Hoy es ${dia} ${now.date}, son las ${ahora} (hora de Berlín).`,
      `MI ITINERARIO DE HOY:\n${itinerario.join("\n") || "(vacío)"}`,
      `MIS ÚLTIMOS 14 DÍAS:\n${reciente.slice(0, 20000) || "(sin datos)"}`,
      memoria.length ? `LO QUE RECUERDAS DE MÍ:\n${memoria.map((x) => "- " + x).join("\n")}` : "",
      `MIS REGLAS:\n${perfil.reglas.slice(0, 6000) || "(ninguna)"}`,
      org.texto,
    ]
      .filter(Boolean)
      .join("\n\n");
    const r = await responderClaude(env.ANTHROPIC_API_KEY, { pregunta, charla, notas: elegidas.notas, contexto });
    if (r) return json({ respuesta: r.respuesta, ia: "claude", fuentes: fuentesDe(elegidas.notas, r.usadas), cambios: leerCambios(r.cambios, { codigos: org.codigos, datos, hoy: now.date }) });
  }

  /* Sin Claude (o si falló), la IA de Cloudflare. Si la pregunta es sobre lo escrito, busca en las notas como siempre */
  if (notas.length && /\b(notas?|apunt|escrib|cerebro|sueñ|profec|idea|lista|dónde (dije|hablo|habl[eé])|guard)/i.test(`${pregunta} ${previa}`)) {
    const cabe = notas.reduce((s, n) => s + n.texto.length + n.titulo.length + 60, 0) <= PRESUPUESTO;
    const palabras = cabe ? "" : `${pregunta} ${previa} ${await palabrasClave(env.AI, `${previa} ${pregunta}`.trim())}`;
    const elegidas = elegirNotas(notas, palabras);
    let halladas = elegidas.notas;
    let delTema = false;
    /* Con todo el Cerebro delante, primero se apartan las notas que hablan del tema y luego se responde solo con esas */
    if (elegidas.todas && halladas.length > 12) {
      const pos = await notasDelTema(env.AI, { pregunta, charla, notas: halladas });
      if (pos && pos.length && pos.length <= 60) {
        halladas = pos.map((i) => halladas[i]);
        delTema = true;
      }
    }
    const { respuesta, usadas } = await responderNotas(env.AI, { pregunta, charla, notas: halladas, todas: elegidas.todas, delTema });
    if (respuesta) return json({ respuesta, ia: "cloudflare", fuentes: fuentesDe(halladas, usadas) });
  }
  /* El resto: su tiempo o cualquier otra cosa, con su contexto y las pocas notas que más se parecen a la pregunta */
  const cerca = notas.length ? buscarNotas(notas, `${pregunta} ${previa}`, 5, 1500) : [];
  const respuesta = await responder(env.AI, { hoy: now.date, ahora, pregunta, charla, reciente, memoria, reglas: perfil.reglas, itinerario, notas: cerca.length ? textoNotas(cerca) : "" });
  if (!respuesta) return json({ error: "ai_empty" }, 502);
  return json({ respuesta, ia: "cloudflare" });
}

/* ---------- API ---------- */

async function api(req: Request, envBase: Env, url: URL): Promise<Response> {
  /* Con la clave de Anthropic, toda la IA de texto de la app la responde Claude (y si falla, Llama) */
  const env: Env = { ...envBase, AI: conClaude(envBase.AI, envBase.ANTHROPIC_API_KEY) };
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
    const b = (await req.json()) as { fecha?: string; reglas?: string };
    const fecha = b.fecha;
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "bad_input" }, 400);
    const perfil = await perfilDe(env, email);
    const reglas = String(b.reglas ?? "").trim() || perfil.reglas;
    /* La semana tipo de ese día de la semana (la hace la persona): es la base de la propuesta */
    const tipoDia = (perfil.plantilla[String(new Date(fecha + "T12:00:00Z").getUTCDay())] ?? []).filter(isBloque);
    if (!reglas.trim() && !tipoDia.length) return json({ error: "bad_input" }, 400);
    const { results } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'tareas'").bind(email).all<{ data: string }>();
    const tareas = results
      .map((r) => JSON.parse(r.data) as { title: string; done?: boolean; due?: string })
      .filter((t) => !t.done && (!t.due || t.due <= fecha))
      .map((t) => t.title);
    const { eventos } = perfil;
    const reales = await diasReales(env, email);
    const ejemplos = resumenDias(reales.filter((d) => d.fecha !== fecha), new Date(fecha + "T12:00:00Z").getUTCDay());
    const base = tipoDia.map((x) => `${x.s}-${x.e} ${x.t}${x.sub ? ` (${x.sub})` : ""}`).join("\n");
    const [memoria, reciente] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, berlinNow().date)]);
    const bloques = await planDay(env.AI, { reglas, fecha, eventos, tareas, ejemplos, memoria, reciente, base });
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
    const [memoria, reciente] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, berlinNow().date)]);
    const dias = await Promise.all(
      Array.from({ length: 7 }, (_, i) => fechaMas(lunes, i)).map(async (f) => {
        const dow = new Date(f + "T12:00:00Z").getUTCDay();
        try {
          return [String(dow), await planDay(env.AI, { reglas, fecha: f, eventos: {}, tareas: [], tipo: true, ejemplos: resumenDias(reales, dow), memoria, reciente })] as const;
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
  /* Aprender de los días ajustados: conclusiones que se proponen a la persona */
  if (url.pathname === "/api/ai/aprender" && req.method === "POST") {
    const b = (await req.json()) as { historial?: { fecha?: string; antes?: unknown; despues?: unknown }[]; reglas?: string; decididas?: unknown };
    const lista = (x: unknown) => (Array.isArray(x) ? x.map((y) => String(y).slice(0, 160)).slice(0, 40) : []);
    const historial = (Array.isArray(b.historial) ? b.historial : [])
      .filter((c) => typeof c?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha))
      .slice(-12)
      .map((c) => ({ fecha: c.fecha as string, antes: lista(c.antes), despues: lista(c.despues) }));
    if (!historial.length) return json({ conclusiones: [] });
    return json({ conclusiones: await conclusiones(env.AI, { historial, reglas: String(b.reglas ?? ""), decididas: lista(b.decididas) }) });
  }
  /* Preguntar a tus notas: se buscan las que hablan de eso (todas las secciones, también las privadas) y la IA responde con ellas.
     Es el único sitio donde la IA lee notas del Cerebro, y solo cuando la persona pregunta. */
  /* Qué tipo de actividad es cada nombre del horario que la app no reconoce (para su ícono y su botón) */
  if (url.pathname === "/api/ai/tipos" && req.method === "POST") {
    const b = (await req.json()) as { nombres?: { t?: unknown; sub?: unknown }[] };
    const nombres = (Array.isArray(b.nombres) ? b.nombres : [])
      .slice(0, 40)
      .map((n) => ({ t: String(n?.t ?? "").slice(0, 80), ...(n?.sub ? { sub: String(n.sub).slice(0, 120) } : {}) }))
      .filter((n) => n.t.trim());
    if (!nombres.length) return json({ tipos: [] });
    const tipos = await tiposDe(env.AI, nombres, TIPOS);
    return tipos ? json({ tipos }) : json({ error: "ai" }, 502);
  }
  /* Pendientes sin fecha: qué día de los próximos 7 conviene cada uno (solo cuando la persona lo pide) */
  if (url.pathname === "/api/ai/pendientes" && req.method === "POST") {
    const b = (await req.json()) as { hoy?: string; pendientes?: { id?: unknown; t?: unknown; paso?: unknown }[]; dias?: unknown; reglas?: string };
    if (typeof b.hoy !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.hoy)) return json({ error: "bad_request" }, 400);
    const pendientes = (Array.isArray(b.pendientes) ? b.pendientes : [])
      .slice(0, 20)
      .map((p) => ({ id: String(p?.id ?? "").slice(0, 60), t: String(p?.t ?? "").slice(0, 120), ...(p?.paso ? { paso: String(p.paso).slice(0, 120) } : {}) }))
      .filter((p) => p.id && p.t.trim());
    if (!pendientes.length) return json({ propuestas: [] });
    const dias = Array.isArray(b.dias) ? b.dias.map((x) => String(x).slice(0, 400)).slice(0, 7) : [];
    const [memoria, reciente] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, b.hoy)]);
    return json({ propuestas: await diasPendientes(env.AI, { hoy: b.hoy, pendientes, dias, reglas: String(b.reglas ?? ""), memoria, reciente }) });
  }
  /* Metas de hoy sin hora: cuándo trabajar en cada una */
  if (url.pathname === "/api/ai/metas" && req.method === "POST") {
    const b = (await req.json()) as { fecha?: string; ahora?: string; metas?: { id?: unknown; t?: unknown; lado?: unknown }[]; bloques?: unknown; reglas?: string };
    if (typeof b.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !/^\d{2}:\d{2}$/.test(String(b.ahora ?? ""))) return json({ error: "bad_request" }, 400);
    const metas = (Array.isArray(b.metas) ? b.metas : []).slice(0, 12).map((m) => ({ id: String(m?.id ?? "").slice(0, 60), t: String(m?.t ?? "").slice(0, 120), lado: m?.lado === "trabajo" ? "trabajo" : "personal" })).filter((m) => m.id && m.t);
    if (!metas.length) return json({ propuestas: [] });
    const bloques = Array.isArray(b.bloques) ? b.bloques.map((x) => String(x).slice(0, 160)).slice(0, 60) : [];
    const [memoria, reciente] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, b.fecha)]);
    return json({ propuestas: await horasMetas(env.AI, { fecha: b.fecha, ahora: String(b.ahora), metas, bloques, reglas: String(b.reglas ?? ""), memoria, reciente }) });
  }
  /* Planear semana por metas: en qué días y a qué horas trabajar cada meta de la semana */
  if (url.pathname === "/api/ai/semana-metas" && req.method === "POST") {
    const b = (await req.json()) as { hoy?: string; ahora?: string; metas?: { id?: unknown; t?: unknown; lado?: unknown }[]; dias?: { fecha?: unknown; bloques?: unknown }[]; reglas?: string };
    if (typeof b.hoy !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.hoy) || !/^\d{2}:\d{2}$/.test(String(b.ahora ?? ""))) return json({ error: "bad_request" }, 400);
    const metas = (Array.isArray(b.metas) ? b.metas : []).slice(0, 12).map((m) => ({ id: String(m?.id ?? "").slice(0, 60), t: String(m?.t ?? "").slice(0, 120), lado: m?.lado === "trabajo" ? "trabajo" : "personal" })).filter((m) => m.id && m.t);
    const dias = (Array.isArray(b.dias) ? b.dias : [])
      .slice(0, 7)
      .map((d) => ({ fecha: String(d?.fecha ?? ""), bloques: Array.isArray(d?.bloques) ? d.bloques.map((x) => String(x).slice(0, 160)).slice(0, 40) : [] }))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) && d.fecha >= b.hoy!);
    if (!metas.length || !dias.length) return json({ propuestas: [] });
    const [memoria, reciente] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, b.hoy)]);
    return json({ propuestas: await sesionesMetas(env.AI, { hoy: b.hoy, ahora: String(b.ahora), metas, dias, reglas: String(b.reglas ?? ""), memoria, reciente }) });
  }
  /* El diario de la noche: propuestas para seguir organizándose */
  if (url.pathname === "/api/ai/diario" && req.method === "POST") {
    const b = (await req.json()) as { fecha?: string; texto?: string; hechas?: unknown; pendientes?: unknown; semana?: unknown; reglas?: string; decididas?: unknown };
    const lista = (x: unknown) => (Array.isArray(x) ? x.map((y) => String(y).slice(0, 200)).slice(0, 40) : []);
    if (typeof b.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || !String(b.texto ?? "").trim()) return json({ error: "bad_request" }, 400);
    const [memoria, reciente] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, b.fecha)]);
    return json(
      await propuestasDiario(env.AI, {
        fecha: b.fecha,
        texto: String(b.texto),
        hechas: lista(b.hechas),
        pendientes: lista(b.pendientes),
        semana: lista(b.semana),
        reglas: String(b.reglas ?? ""),
        decididas: lista(b.decididas),
        memoria,
        reciente,
      }),
    );
  }
  /* El resumen de la semana (domingo): repaso, recomendaciones y qué recordar */
  if (url.pathname === "/api/ai/semana" && req.method === "POST") {
    const b = (await req.json().catch(() => ({}))) as { decididas?: unknown };
    const hoy = berlinNow().date;
    const [memoria, reciente, perfil] = await Promise.all([memoriaDe(env, email), recienteDe(env, email, hoy), perfilDe(env, email)]);
    const decididas = Array.isArray(b.decididas) ? b.decididas.map((y) => String(y).slice(0, 200)).slice(0, 40) : [];
    const r = await resumenSemana(env.AI, { hoy, reciente, memoria, reglas: perfil.reglas, decididas });
    if (!r.resumen) return json({ error: "ai_empty" }, 502);
    return json(r);
  }
  /* Pregúntale a la IA (la misma desde Hoy, el botón + y el Cerebro): lee todas tus notas y tu contexto de hoy y responde a lo que sea */
  if ((url.pathname === "/api/ai/preguntar" || url.pathname === "/api/ai/notas") && req.method === "POST") return preguntarIA(req, env, email);
  if (url.pathname === "/api/ai/horario" && req.method === "POST") {
    const { imagen } = (await req.json()) as { imagen?: string };
    if (!imagen || !/^data:image\/(jpeg|png|webp);base64,/.test(imagen) || imagen.length > 6_000_000) return json({ error: "bad_image" }, 400);
    const texto = await leerHorario(env.AI, imagen);
    if (!texto) return json({ error: "ai_empty" }, 502);
    return json({ texto });
  }
  /* Poner las reglas al día con la semana tipo (la persona revisa el texto antes de guardarlo) */
  if (url.pathname === "/api/ai/reglas-tipo" && req.method === "POST") {
    const perfil = await perfilDe(env, email);
    /* La semana tipo viene en la petición (recién guardada); si no, la del perfil */
    const b = (await req.json().catch(() => ({}))) as { plantilla?: unknown };
    const dada = b.plantilla && typeof b.plantilla === "object" ? (b.plantilla as Record<string, unknown>) : null;
    const semana: Plantilla = dada ? Object.fromEntries(Object.entries(dada).map(([k, v]) => [k, Array.isArray(v) ? v.filter(isBloque).slice(0, 40) : []])) : perfil.plantilla;
    const NOMBRES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const tipo = [1, 2, 3, 4, 5, 6, 0]
      .map((d) => {
        const bs = (semana[String(d)] ?? []).filter(isBloque);
        return bs.length ? `${NOMBRES[d]}:\n${bs.map((x) => `- ${x.s} a ${x.e}: ${x.t}${x.sub ? ` (${x.sub})` : ""}`).join("\n")}` : `${NOMBRES[d]}: (nada puesto)`;
      })
      .join("\n\n");
    if (!Object.values(semana).some((x) => Array.isArray(x) && x.length)) return json({ error: "sin_tipo" }, 400);
    const texto = await reglasDeTipo(env.AI, { reglas: perfil.reglas, tipo });
    if (!texto) return json({ error: "ai_empty" }, 502);
    return json({ reglas: texto });
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
      url: /ejercicio|entren|deporte|gym|gimnasio|correr|workout/i.test(b.t) ? "/hoy#entreno" : "/hoy",
    });
    // Si no llegó a ningún teléfono por un fallo pasajero, se quita la marca y se reintenta el minuto siguiente
    if (!sent && failed) await env.DB.prepare("DELETE FROM push_sent WHERE user_email = ? AND k = ?").bind(user_email, key).run();
  }

  /* Tareas con hora: aviso a esa hora (una sola vez) */
  const { results: ts } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'tareas'").bind(user_email).all<{ data: string }>();
  type T = { id?: string; title?: string; step?: string; due?: string; hora?: string; done?: boolean; momento?: string };
  const tareas: T[] = [];
  for (const r of ts) {
    try {
      const x = JSON.parse(r.data) as T | null;
      if (x && typeof x === "object") tareas.push(x);
    } catch {
      /* una tarea rara no deja sin avisos a las demás */
    }
  }
  for (const x of tareas) {
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

  /* Subtareas sin hacer: cuando termina el momento al que pertenecen, un aviso que vibra y se queda en pantalla (uno por momento) */
  for (const [b, titulos] of subtareasQueQuedaron(tareas, blocks, date, min)) {
    const key = `sub ${date} ${b.s}|${b.t}`;
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO push_sent (user_email, k) VALUES (?, ?)").bind(user_email, key).run();
    if (ins.meta?.changes === 0) continue;
    const { sent, failed } = await notifyUser(env, user_email, {
      title: titulos.length === 1 ? `Te quedó: ${titulos[0]}` : `Te quedaron ${titulos.length} cosas de «${b.t}»`,
      body:
        titulos.length === 1
          ? `Era parte de «${b.t}», que terminó a las ${b.e}. ¿La haces ahora? Toca para verla.`
          : `${titulos.map((t) => `• ${t}`).join("\n")}\n«${b.t}» terminó a las ${b.e}. Toca para verlas.`,
      tag: `sub-${date}-${b.s}`,
      url: "/hoy",
      fuerte: "1",
    });
    if (!sent && failed) await env.DB.prepare("DELETE FROM push_sent WHERE user_email = ? AND k = ?").bind(user_email, key).run();
  }

  /* Recordatorios del día, cada uno a su hora (se encienden, apagan y cambian en Perfil › Avisos):
     los hábitos que siguen sin marcar y el diario si aún no está escrito. Si no falta nada, no se avisa. */
  const { results: av } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'perfil' AND id = 'avisos'").bind(user_email).all<{ data: string }>();
  let guardado: unknown = null;
  try {
    guardado = av[0] ? JSON.parse(av[0].data) : null;
  } catch {
    /* si lo guardado está raro, valen los de fábrica */
  }
  const cfg = leerAvisos(guardado);
  const toca = (hora: string) => toMin(hora) <= min && min - toMin(hora) < 10;
  const recordar = async (key: string, aviso: Parameters<typeof notifyUser>[2]) => {
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO push_sent (user_email, k) VALUES (?, ?)").bind(user_email, key).run();
    if (ins.meta?.changes === 0) return;
    const { sent, failed } = await notifyUser(env, user_email, aviso);
    if (!sent && failed) await env.DB.prepare("DELETE FROM push_sent WHERE user_email = ? AND k = ?").bind(user_email, key).run();
  };
  if (cfg.habitos.on && toca(cfg.habitos.hora)) {
    const { results: hs } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'habitos'").bind(user_email).all<{ data: string }>();
    const faltan: { name: string; orden: number }[] = [];
    for (const r of hs) {
      try {
        const h = JSON.parse(r.data) as { name?: unknown; orden?: unknown; hechos?: Record<string, boolean> } | null;
        if (h && typeof h.name === "string" && h.name.trim() && !h.hechos?.[date]) faltan.push({ name: h.name.trim().slice(0, 60), orden: Number(h.orden) || 0 });
      } catch {
        /* un hábito raro no impide avisar de los demás */
      }
    }
    if (faltan.length) {
      const nombres = faltan.sort((a, b) => a.orden - b.orden).map((h) => h.name);
      await recordar(`habitos ${date}`, {
        title: "Tus hábitos de hoy",
        body: `Aún sin marcar: ${nombres.slice(0, 6).join(", ")}${nombres.length > 6 ? ` y ${nombres.length - 6} más` : ""}. Toca para marcarlos.`,
        tag: "habitos",
        url: "/habitos",
      });
    }
  }
  if (cfg.diario.on && toca(cfg.diario.hora)) {
    const { results: ya } = await env.DB.prepare(
      "SELECT 1 AS x FROM items WHERE user_email = ? AND tabla = 'notas' AND json_extract(data, '$.folder') = 'diario' AND json_extract(data, '$.ref') = ? LIMIT 1",
    )
      .bind(user_email, date)
      .all<{ x: number }>();
    if (!ya.length) await recordar(`diario ${date}`, { title: "¿Cómo fue tu día?", body: "Escribe tu diario de hoy: con dos líneas basta. Toca para abrirlo.", tag: "diario", url: "/hoy#diario" });
  }
  /* Los domingos: planificar la semana que viene en el Planner, si aún no lo ha marcado como hecho */
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0 && cfg.planificar.on && toca(cfg.planificar.hora)) {
    const { results: sp } = await env.DB.prepare("SELECT data FROM items WHERE user_email = ? AND tabla = 'perfil' AND id = 'semanaPlanificada'").bind(user_email).all<{ data: string }>();
    let hecha = "";
    try {
      hecha = sp[0] ? String(JSON.parse(sp[0].data) ?? "") : "";
    } catch {
      /* si está raro, se avisa igual */
    }
    if (hecha !== semanaPorPlanificar(date, dow))
      await recordar(`planificar ${date}`, { title: "Planifica tu semana", body: "Pon tus metas y tareas de la semana que viene, de lo personal y del trabajo. Toca para abrir tu Planner.", tag: "planificar", url: "/semana#planificar" });
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
