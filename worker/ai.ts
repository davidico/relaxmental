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
export async function preguntas(ai: AI, o: { reglas: string; horario: string; labores: string; modo?: string }): Promise<string[]> {
  const tarea =
    o.modo === "cambios"
      ? "Es la revisión de inicio de mes. Haz 5 preguntas cortas en español para saber QUÉ CAMBIÓ este mes en su semana (horarios nuevos, cosas que ya no hace, cosas nuevas, fechas especiales). "
      : o.modo === "inicio" || !o.reglas.trim()
        ? "La persona empieza desde cero. Haz 10 preguntas cortas en español para conocer su semana: a qué hora se levanta y termina el día, trabajo o estudio, sus horas de más energía, familia, comidas, salud y ejercicio, fe o vida espiritual, aprender algo (idiomas, cursos), tareas de casa, descanso, y qué no quiere en su horario. "
        : "Lee sus reglas y haz 8 preguntas cortas en español sobre lo que falta o no está claro: horas, días concretos, excepciones, descansos, prioridades, qué le cuesta y qué quiere proteger. ";
  const sistema =
    "Ayudas a una persona a escribir las reglas de su horario semanal. " +
    tarea +
    "Tutéala, preguntas sencillas y concretas (máx. 20 palabras), una idea por pregunta, sin repetir lo que ya está claro. " +
    "IMPORTANTE: la app ya conoce sus labores de la iglesia por fecha y las añade sola; NO preguntes qué días va a la iglesia ni qué labor le toca. " +
    "Si hay un horario variable (turnos), tampoco preguntes qué días trabaja: pregunta qué quiere hacer antes o después de cada turno.";
  const usuario = `MIS REGLAS ACTUALES:\n${o.reglas.slice(0, 6000) || "(todavía no hay)"}\n\n${o.labores}${o.horario ? `\n\nMI HORARIO VARIABLE (de una foto):\n${o.horario.slice(0, 3000)}` : ""}`;
  const limpia = (xs: unknown) =>
    Array.isArray(xs) ? xs.map((x) => String(x).trim()).filter((x) => x.length > 5).slice(0, 10) : [];
  try {
    const r = await ai.run(LLM, {
      messages: [
        { role: "system", content: sistema + ' Responde SOLO con JSON: {"preguntas":["…","…"]}' },
        { role: "user", content: usuario },
      ],
      response_format: { type: "json_schema", json_schema: { type: "object", properties: { preguntas: { type: "array", items: { type: "string" } } }, required: ["preguntas"] } },
      max_tokens: 700,
      temperature: 0.4,
    });
    const xs = limpia(parsed<{ preguntas: unknown }>(r)?.preguntas);
    if (xs.length >= 3) return xs;
  } catch {
    /* si falla el modo JSON, se intenta con texto normal */
  }
  const r = await ai.run(LLM, {
    messages: [
      { role: "system", content: sistema + " Escribe solo las preguntas, una por línea, sin números ni nada más." },
      { role: "user", content: usuario },
    ],
    max_tokens: 700,
    temperature: 0.4,
  });
  return limpia(
    String(r.response ?? "")
      .split("\n")
      .map((l) => l.replace(/^\s*(\d+[.)-]|[-•*])\s*/, "").trim())
      .filter((l) => l.endsWith("?")),
  );
}

const VISION = "@cf/meta/llama-3.2-11b-vision-instruct";
/** Lee la foto de un horario (turnos de trabajo, etc.) y lo pasa a texto */
export async function leerHorario(ai: AI, imagen: string): Promise<string> {
  const pedir = () =>
    ai.run(VISION, {
      messages: [
        {
          role: "system",
          content:
            "Lees fotos de horarios y calendarios y los pasas a texto en español, sin inventar nada. " +
            "Escribe una línea por día con fecha o día de la semana y el horario o turno (ej.: «Lunes 3: 8:00–16:00 (mañana)»). Si algo no se lee, di «no se lee».",
        },
        { role: "user", content: "Pasa a texto este horario." },
      ],
      image: imagen,
      max_tokens: 1200,
      temperature: 0.1,
    });
  let r: Record<string, unknown>;
  try {
    r = await pedir();
  } catch (e) {
    // La primera vez hay que aceptar la licencia de Meta para este modelo
    if (!/agree|licen/i.test(String(e))) throw e;
    await ai.run(VISION, { prompt: "agree" }).catch(() => {});
    r = await pedir();
  }
  return String(r.response ?? "").trim();
}

/** Reescribe las reglas con las respuestas y el mensaje final */
export async function reescribirReglas(ai: AI, o: { reglas: string; respuestas: { p: string; r: string }[]; mensaje: string; horario?: string; modo?: string }): Promise<string> {
  const qa = o.respuestas.filter((x) => x.r.trim()).map((x) => `P: ${x.p}\nR: ${x.r.trim()}`).join("\n\n");
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Reescribes las reglas del horario semanal de una persona, en español y en primera persona, como ella misma las escribiría. " +
          (o.modo === "cambios"
            ? "Es la revisión del mes: conserva sus reglas actuales y cambia SOLO lo que dicen sus respuestas y su mensaje. "
            : "Parte de sus reglas actuales (si las hay) y añade o corrige lo que dicen sus respuestas y su mensaje final (si chocan, ganan las respuestas y el mensaje). ") +
          "No inventes nada que no esté en sus reglas o respuestas. Ordena por: al despertar, mañanas, tardes, noches, días especiales y excepciones. " +
          "Si hay un horario variable (turnos), añade una sección «MI HORARIO VARIABLE» con esos días y horas tal cual, y explica qué hacer antes y después de cada turno según sus respuestas. " +
          "No escribas qué días le toca la iglesia: la app ya lo sabe. " +
          "Usa horas en formato 7:00, frases cortas y listas con guiones. Devuelve SOLO el texto de las reglas, sin introducción ni comentarios.",
      },
      { role: "user", content: `MIS REGLAS ACTUALES:\n${o.reglas.slice(0, 6000) || "(ninguna)"}\n\nMIS RESPUESTAS:\n${qa.slice(0, 8000) || "(ninguna)"}\n\nMI MENSAJE FINAL:\n${o.mensaje.slice(0, 3000) || "(nada)"}${o.horario ? `\n\nMI HORARIO VARIABLE (de una foto):\n${o.horario.slice(0, 3000)}` : ""}` },
    ],
    max_tokens: 2500,
    temperature: 0.2,
  });
  return String(r.response ?? "").trim();
}
