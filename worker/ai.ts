/**
 * IA de Cloudflare (Workers AI):
 * - Whisper large v3 turbo: pasa la voz a texto.
 * - Llama 3.3 70B: pone título a una nota y arma el horario de un día según las reglas de la persona.
 */
import { SVC } from "../lib/schedule";
import type { Bloque } from "../lib/schedule";

export interface AI {
  run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}
const LLM = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const AREAS = ["trabajo", "tukuna", "aleman", "iglesia", "familia", "salud", "casa", "rutina"] as const;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function base64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function transcribe(ai: AI, audio: ArrayBuffer) {
  const r = await ai.run("@cf/openai/whisper-large-v3-turbo", { audio: base64(audio), language: "es", vad_filter: true });
  return String(r.text ?? "").trim();
}

/** La respuesta de Workers AI puede venir como objeto o como texto JSON */
function parsed<T>(r: Record<string, unknown>): T | null {
  const x = r.response;
  if (x && typeof x === "object") return x as T;
  if (typeof x === "string") {
    try {
      return JSON.parse(x.slice(x.indexOf("{"), x.lastIndexOf("}") + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export async function title(ai: AI, text: string) {
  const r = await ai.run(LLM, {
    messages: [
      { role: "system", content: "Pones títulos a notas personales en español. Devuelve un título de 2 a 6 palabras, sin comillas ni punto final, fiel al contenido. Nada más." },
      { role: "user", content: text.slice(0, 4000) },
    ],
    max_tokens: 30,
    temperature: 0.2,
  });
  return String(r.response ?? "").replace(/^["'«“]|["'»”.]$/g, "").split("\n")[0].trim().slice(0, 80);
}

const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));

/** Limpia lo que devuelve la IA: horas válidas, áreas conocidas, en orden y sin solaparse */
export function cleanBlocks(raw: unknown): Bloque[] {
  if (!Array.isArray(raw)) return [];
  const out: Bloque[] = [];
  for (const b of raw as Record<string, unknown>[]) {
    const s = String(b?.s ?? b?.inicio ?? "").padStart(5, "0");
    const e = String(b?.e ?? b?.fin ?? "").padStart(5, "0");
    const t = String(b?.t ?? b?.titulo ?? "").trim().slice(0, 80);
    if (!hm.test(s) || !hm.test(e) || !t || toMin(e) <= toMin(s)) continue;
    const a = (AREAS as readonly string[]).includes(String(b.a)) ? (b.a as Bloque["a"]) : "rutina";
    const sub = String(b.sub ?? b.detalle ?? "").trim().slice(0, 140);
    out.push({ s, e, t, a, ...(sub ? { sub } : {}), ...(/culto/i.test(t) ? { church: true } : {}) });
  }
  out.sort((x, y) => toMin(x.s) - toMin(y.s));
  for (let i = 1; i < out.length; i++) if (toMin(out[i].s) < toMin(out[i - 1].e)) out[i - 1].e = out[i].s;
  return out.filter((b) => toMin(b.e) > toMin(b.s));
}

export async function planDay(
  ai: AI,
  o: { reglas: string; fecha: string; labores: Record<string, string[]>; tareas: string[] },
): Promise<Bloque[]> {
  const d = new Date(o.fecha + "T12:00:00Z");
  const dow = d.getUTCDay();
  const prox = [1, 2, 3]
    .map((i) => {
      const x = new Date(d.getTime() + i * 864e5).toISOString().slice(0, 10);
      const r = o.labores[x] ?? [];
      return r.length ? `- ${DIAS[new Date(x + "T12:00:00Z").getUTCDay()]} ${x}: ${r.join(", ")}` : "";
    })
    .filter(Boolean);
  const hoy = o.labores[o.fecha] ?? [];
  const [svc, hora] = SVC[dow] ?? ["", ""];
  const contexto = [
    `Fecha: ${DIAS[dow]} ${o.fecha}.`,
    hoy.length ? `Labores en la iglesia HOY: ${hoy.join(", ")} (culto de ${svc} a las ${hora}).` : "Hoy NO tiene labor en la iglesia.",
    prox.length ? `Labores de los próximos 3 días:\n${prox.join("\n")}` : "Sin labores en los próximos 3 días.",
    o.tareas.length ? `Tareas pendientes (elige 1 o 2 si encajan):\n${o.tareas.slice(0, 12).map((t) => "- " + t).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const schema = {
    type: "object",
    properties: {
      bloques: {
        type: "array",
        items: {
          type: "object",
          properties: {
            s: { type: "string", description: "inicio HH:MM" },
            e: { type: "string", description: "fin HH:MM" },
            t: { type: "string", description: "título corto" },
            a: { type: "string", enum: [...AREAS] },
            sub: { type: "string", description: "detalle breve, opcional" },
          },
          required: ["s", "e", "t", "a"],
        },
      },
    },
    required: ["bloques"],
  };

  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Eres el planificador del día de una persona. Sigue SUS REGLAS al pie de la letra; si dos reglas chocan, gana la más específica (la que nombra el día o la labor). " +
          "Cubre el día de la hora de levantarse a la de dormir sin huecos ni solapes, en bloques de 15 minutos o más, en orden. " +
          "Títulos cortos en español (máx. 5 palabras). Áreas: trabajo=buscar trabajo, tukuna=su trabajo en Tukuna, aleman=alemán, iglesia=Biblia/predicación/culto, familia=bebé y familia, salud=pastillas/ejercicio/descanso, casa=cocinar/papeleo/tareas, rutina=comidas y traslados. " +
          'Responde SOLO con JSON: {"bloques":[{"s":"07:00","e":"07:15","t":"…","a":"salud","sub":"…"}]}',
      },
      { role: "user", content: `MIS REGLAS:\n${o.reglas.slice(0, 6000)}\n\nDATOS DEL DÍA:\n${contexto}` },
    ],
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens: 2048,
    temperature: 0.2,
  });
  return cleanBlocks(parsed<{ bloques: unknown }>(r)?.bloques);
}

/** Preguntas para completar las reglas del horario (lo que falta o no está claro) */
export async function preguntas(ai: AI, reglas: string): Promise<string[]> {
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Ayudas a una persona a escribir las reglas de su horario semanal. Lee sus reglas y haz 8 preguntas cortas en español, de una en una, " +
          "sobre lo que falta o no está claro: horas, días concretos, excepciones, descansos, prioridades, qué le cuesta y qué quiere proteger. " +
          "Tutéala, preguntas sencillas y concretas (máx. 20 palabras), sin repetir lo que ya está claro. " +
          'Responde SOLO con JSON: {"preguntas":["…","…"]}',
      },
      { role: "user", content: `MIS REGLAS ACTUALES:\n${reglas.slice(0, 6000) || "(todavía no hay)"}` },
    ],
    response_format: { type: "json_schema", json_schema: { type: "object", properties: { preguntas: { type: "array", items: { type: "string" } } }, required: ["preguntas"] } },
    max_tokens: 700,
    temperature: 0.4,
  });
  const xs = parsed<{ preguntas: unknown }>(r)?.preguntas;
  return Array.isArray(xs) ? xs.map((x) => String(x).trim()).filter((x) => x.length > 5).slice(0, 10) : [];
}

/** Reescribe las reglas con las respuestas y el mensaje final */
export async function reescribirReglas(ai: AI, o: { reglas: string; respuestas: { p: string; r: string }[]; mensaje: string }): Promise<string> {
  const qa = o.respuestas.filter((x) => x.r.trim()).map((x) => `P: ${x.p}\nR: ${x.r.trim()}`).join("\n\n");
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Reescribes las reglas del horario semanal de una persona, en español y en primera persona, como ella misma las escribiría. " +
          "Parte de sus reglas actuales y añade o corrige lo que dicen sus respuestas y su mensaje final (si chocan, ganan las respuestas y el mensaje). " +
          "No inventes nada que no esté en sus reglas o respuestas. Ordena por: al despertar, mañanas, tardes, noches, días especiales y excepciones. " +
          "Usa horas en formato 7:00, frases cortas y listas con guiones. Devuelve SOLO el texto de las reglas, sin introducción ni comentarios.",
      },
      { role: "user", content: `MIS REGLAS ACTUALES:\n${o.reglas.slice(0, 6000) || "(ninguna)"}\n\nMIS RESPUESTAS:\n${qa.slice(0, 8000) || "(ninguna)"}\n\nMI MENSAJE FINAL:\n${o.mensaje.slice(0, 3000) || "(nada)"}` },
    ],
    max_tokens: 2500,
    temperature: 0.2,
  });
  return String(r.response ?? "").trim();
}
