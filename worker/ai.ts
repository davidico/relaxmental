/**
 * IA de Cloudflare (Workers AI):
 * - Whisper large v3 turbo: pasa la voz a texto.
 * - Llama 3.3 70B: pone título a una nota y arma el horario de un día según las reglas de la persona.
 */
import { textoEventos, type Bloque, type Eventos } from "../lib/plan";

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
  o: { reglas: string; fecha: string; eventos: Eventos; tareas: string[]; tipo?: boolean; ejemplos?: string },
): Promise<Bloque[]> {
  const d = new Date(o.fecha + "T12:00:00Z");
  const dow = d.getUTCDay();
  const prox = [1, 2, 3]
    .map((i) => {
      const x = new Date(d.getTime() + i * 864e5).toISOString().slice(0, 10);
      const r = o.eventos[x] ?? [];
      return r.length ? `- ${DIAS[new Date(x + "T12:00:00Z").getUTCDay()]} ${x}: ${textoEventos(r)}` : "";
    })
    .filter(Boolean);
  const hoy = o.eventos[o.fecha] ?? [];
  const contexto = o.tipo
    ? [`Arma un ${DIAS[dow]} TÍPICO de su semana (sin compromisos especiales): lo que hace normalmente ese día según sus reglas y sus días reales.`, o.ejemplos ?? ""].filter(Boolean).join("\n\n")
    : [
        `Fecha: ${DIAS[dow]} ${o.fecha}.`,
        hoy.length ? `Compromisos FIJOS de hoy (respeta sus horas, no los muevas): ${hoy.map((e) => `${e.t}${e.s ? ` de ${e.s} a ${e.e ?? "?"}` : ""}${e.nota ? ` (${e.nota})` : ""}`).join("; ")}.` : "Hoy no tiene compromisos con fecha.",
        prox.length ? `Compromisos de los próximos 3 días (por si hay que prepararse):\n${prox.join("\n")}` : "",
        o.tareas.length ? `Tareas pendientes (elige 1 o 2 si encajan):\n${o.tareas.slice(0, 12).map((t) => "- " + t).join("\n")}` : "",
        o.ejemplos ?? "",
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
          "Si te paso DÍAS REALES que ella ajustó a mano, son lo más fiable: imita sus horas, los nombres que usa, el orden y la duración de los bloques (sobre todo los del mismo día de la semana). " +
          "No inventes actividades que no estén en sus reglas ni en sus días reales; nada genérico como «preparación para la noche» o «momento espiritual» si ella no lo dijo. " +
          "Si sus reglas dicen que toma medicinas o pastillas, pon un bloque corto (5-15 min, área salud) a la hora exacta, con el nombre en el detalle. " +
          "Cubre el día de la hora de levantarse a la de dormir sin huecos ni solapes, en bloques de 15 minutos o más, en orden. " +
          "Títulos cortos en español (máx. 5 palabras). Áreas: trabajo=trabajo o estudio, tukuna=proyecto propio o negocio, aleman=idiomas y aprendizaje, iglesia=fe, iglesia, Biblia y oración, familia=familia e hijos, salud=salud, ejercicio y descanso, casa=casa, cocina, papeleo y tareas, rutina=comidas y traslados. " +
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
      ? "Es la revisión de inicio de mes. Haz 5 preguntas cortas en español para saber QUÉ CAMBIÓ este mes en su semana (horarios nuevos, cosas que ya no hace, cosas nuevas, fechas especiales, y si cambió algo en sus medicinas o pastillas). "
      : o.modo === "inicio" || !o.reglas.trim()
        ? "La persona empieza desde cero. Haz 10 preguntas cortas en español para conocer su semana: a qué hora se levanta y termina el día, trabajo o estudio, sus horas de más energía, familia, comidas, medicinas o pastillas que toma (cuáles y a qué hora; pregúntalo siempre), salud y ejercicio, fe o vida espiritual, aprender algo (idiomas, cursos), tareas de casa, descanso, y qué no quiere en su horario. "
        : "Lee sus reglas y haz 8 preguntas cortas en español sobre lo que falta o no está claro: horas, días concretos, excepciones, descansos, prioridades, qué le cuesta y qué quiere proteger. ";
  const sistema =
    "Ayudas a una persona a escribir las reglas de su horario semanal. " +
    tarea +
    "Tutéala, preguntas sencillas y concretas (máx. 20 palabras), una idea por pregunta, sin repetir lo que ya está claro. " +
    "IMPORTANTE: la app ya conoce sus compromisos con fecha (iglesia, turnos, citas) y los añade sola; NO preguntes qué días le tocan. " +
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
export async function reescribirReglas(ai: AI, o: { reglas: string; respuestas: { p: string; r: string }[]; mensaje: string; horario?: string; modo?: string; ejemplos?: string }): Promise<string> {
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
          "No inventes NADA que no esté en sus reglas, respuestas, mensaje o días reales: ni actividades, ni horas, ni ejemplos («p. ej.»), ni fechas. Si una respuesta está vacía o no se entiende, no la uses. " +
          "Si hay DÍAS REALES que ajustó a mano, úsalos como la mejor pista de cómo es su semana (horas, nombres y orden). " +
          "Si toma medicinas o pastillas, ponlas con su hora exacta en una sección «MEDICINAS» (la app las convierte en avisos). " +
          "Ordena por: al despertar, mañanas, tardes, noches, días especiales y excepciones. " +
          "Si hay un horario variable (turnos), añade una sección «MI HORARIO VARIABLE» con esos días y horas tal cual, y explica qué hacer antes y después de cada turno según sus respuestas. " +
          "No escribas qué fechas concretas tiene compromisos (iglesia, turnos): la app ya las sabe. Sí puedes escribir qué hace antes o después de ellos. " +
          "Usa horas en formato 7:00, frases cortas y listas con guiones. Devuelve SOLO el texto de las reglas, sin introducción ni comentarios.",
      },
      { role: "user", content: `MIS REGLAS ACTUALES:\n${o.reglas.slice(0, 6000) || "(ninguna)"}\n\nMIS RESPUESTAS:\n${qa.slice(0, 8000) || "(ninguna)"}\n\nMI MENSAJE FINAL:\n${o.mensaje.slice(0, 3000) || "(nada)"}${o.horario ? `\n\nMI HORARIO VARIABLE (de una foto):\n${o.horario.slice(0, 3000)}` : ""}${o.ejemplos ? `\n\n${o.ejemplos}` : ""}` },
    ],
    max_tokens: 2500,
    temperature: 0.2,
  });
  return String(r.response ?? "").trim();
}

/** Convierte el texto de una foto (turnos, labores, calendario) en compromisos con fecha */
export async function aCompromisos(ai: AI, o: { texto: string; hoy: string; reglas: string }): Promise<{ fecha: string; t: string; s?: string; e?: string; nota?: string }[]> {
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Conviertes un horario o calendario (ya pasado a texto) en una lista de compromisos con fecha. Hoy es " + o.hoy + ". " +
          "Si el texto no dice el año, usa el de hoy (o el siguiente si el mes ya pasó). Fecha en formato AAAA-MM-DD, horas en HH:MM (24 h). " +
          "Si un compromiso no tiene hora en el texto pero las reglas de la persona dicen a qué hora suele ser (por ejemplo, el culto de ese día de la semana), úsala. Si no, déjalo sin hora. " +
          "t = título corto (ej.: «Culto · Púlpito», «Turno de mañana»). nota = detalle breve si hay. No inventes fechas que no estén. " +
          'Responde SOLO con JSON: {"eventos":[{"fecha":"2026-12-03","t":"…","s":"08:00","e":"16:00","nota":"…"}]}',
      },
      { role: "user", content: `TEXTO DEL HORARIO:\n${o.texto.slice(0, 6000)}\n\nMIS REGLAS (para las horas habituales):\n${o.reglas.slice(0, 3000) || "(ninguna)"}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: { eventos: { type: "array", items: { type: "object", properties: { fecha: { type: "string" }, t: { type: "string" }, s: { type: "string" }, e: { type: "string" }, nota: { type: "string" } }, required: ["fecha", "t"] } } },
        required: ["eventos"],
      },
    },
    max_tokens: 2500,
    temperature: 0.1,
  });
  const xs = parsed<{ eventos: unknown }>(r)?.eventos;
  if (!Array.isArray(xs)) return [];
  const hhmm = (x: unknown) => {
    const v = String(x ?? "").trim().padStart(5, "0");
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined;
  };
  return xs
    .map((x: Record<string, unknown>) => ({ fecha: String(x?.fecha ?? ""), t: String(x?.t ?? "").trim().slice(0, 80), s: hhmm(x?.s), e: hhmm(x?.e), nota: String(x?.nota ?? "").trim().slice(0, 140) || undefined }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) && x.t)
    .slice(0, 120);
}

/** Resume los días que la persona ajustó a mano, para que la IA aprenda de ellos */
export function resumenDias(dias: { fecha: string; bloques: Bloque[] }[], dowObjetivo?: number) {
  if (!dias.length) return "";
  const orden = [...dias].sort((a, b) => {
    // primero los del mismo día de la semana, luego los más recientes
    const da = new Date(a.fecha + "T12:00:00Z").getUTCDay() === dowObjetivo ? 0 : 1;
    const db = new Date(b.fecha + "T12:00:00Z").getUTCDay() === dowObjetivo ? 0 : 1;
    return da - db || (a.fecha < b.fecha ? 1 : -1);
  });
  const lineas = orden.slice(0, 8).map(({ fecha, bloques }) => {
    const d = DIAS[new Date(fecha + "T12:00:00Z").getUTCDay()];
    return `${d} ${fecha}: ${bloques.map((b) => `${b.s}-${b.e} ${b.t}${b.sub ? ` (${b.sub})` : ""}`).join("; ")}`;
  });
  return `DÍAS REALES QUE AJUSTÓ A MANO (aprende de ellos):\n${lineas.join("\n")}`.slice(0, 5000);
}

/** Analiza cómo la persona cambia lo que le propone la app y saca conclusiones (propuestas, no órdenes) */
export async function conclusiones(
  ai: AI,
  o: { historial: { fecha: string; antes: string[]; despues: string[] }[]; reglas: string; decididas: string[] },
): Promise<{ texto: string; regla: string }[]> {
  const dias = o.historial
    .map((c) => {
      const d = DIAS[new Date(c.fecha + "T12:00:00Z").getUTCDay()];
      return `${d} ${c.fecha}\nLA APP PROPUSO: ${c.antes.join("; ") || "(nada)"}\nLA PERSONA LO DEJÓ ASÍ: ${c.despues.join("; ")}`;
    })
    .join("\n\n");
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Analizas cómo una persona corrige el horario que le propone su app, para aprender cómo organiza de verdad su tiempo. " +
          "Compara lo propuesto con lo que dejó y saca hasta 5 conclusiones CONCRETAS y útiles: horas que mueve, cosas que añade o quita siempre, cuánto duran sus bloques, qué hace ciertos días. " +
          "Prefiere patrones que se repiten; si solo hay un día, saca solo lo muy claro de ese día de la semana. " +
          "texto = la conclusión dicha a la persona, en segunda persona y corta (ej.: «Los viernes trabajas de 13:30 a 15:30»). " +
          "regla = la misma idea escrita como regla de su horario, en primera persona (ej.: «Los viernes trabajo de 13:30 a 15:30.»). " +
          "No repitas lo que ya dicen sus reglas ni lo ya decidido. No inventes nada que no salga de los cambios. " +
          'Responde SOLO con JSON: {"conclusiones":[{"texto":"…","regla":"…"}]}',
      },
      { role: "user", content: `MIS DÍAS AJUSTADOS:\n${dias.slice(0, 9000)}\n\nMIS REGLAS ACTUALES:\n${o.reglas.slice(0, 3000) || "(ninguna)"}\n\nYA DECIDIDO (no repetir):\n${o.decididas.slice(-30).join("\n") || "(nada)"}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { type: "object", properties: { conclusiones: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, regla: { type: "string" } }, required: ["texto", "regla"] } } }, required: ["conclusiones"] },
    },
    max_tokens: 900,
    temperature: 0.2,
  });
  const xs = parsed<{ conclusiones: unknown }>(r)?.conclusiones;
  return Array.isArray(xs)
    ? xs
        .map((x: Record<string, unknown>) => ({ texto: String(x?.texto ?? "").trim().slice(0, 200), regla: String(x?.regla ?? "").trim().slice(0, 300) }))
        .filter((x) => x.texto && x.regla)
        .slice(0, 5)
    : [];
}

/** Lee el diario de la noche y propone cómo seguir: reglas para su horario o cosas concretas para un día */
export async function propuestasDiario(
  ai: AI,
  o: { fecha: string; texto: string; hechas: string[]; pendientes: string[]; semana: string[]; reglas: string; decididas: string[] },
): Promise<{ texto: string; regla?: string; tarea?: { title: string; due: string; hora?: string; fin?: string; lado: "personal" | "trabajo"; meta: boolean } }[]> {
  const dia = DIAS[new Date(o.fecha + "T12:00:00Z").getUTCDay()];
  const manana = new Date(Date.parse(o.fecha + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Eres el asistente de organización de una persona. Por la noche escribe su diario. Léelo junto con lo que cumplió y lo que no, y propón hasta 3 cosas útiles para organizarse mejor. " +
          "Sus cosas son de dos tipos: [meta] = en lo que quiere avanzar un día (lleva tiempo, puede repetirse) y [tarea] = algo puntual y rápido. " +
          "Si una tarea no se hizo, propón pasarla a otro día. Si una meta lleva días sin avanzar, propón darle un bloque de tiempo concreto (hora y fin) otro día. " +
          "Cada propuesta es UNA de dos clases: " +
          "(a) algo concreto para apuntar en un día: «tarea» con title (corto, igual que el original si ya existe), due (AAAA-MM-DD, normalmente mañana " + manana + " o un día de los próximos 7), hora y fin opcionales (HH:MM), lado (personal o trabajo) y meta (true si es una meta); " +
          "(b) una regla para su horario, en primera persona (ej.: «Los jueves no me apunto más de 3 cosas.»). " +
          "texto = la propuesta dicha a la persona, en segunda persona, corta y amable, explicando el porqué (ej.: «Hoy no te dio tiempo de la contabilidad. ¿La pongo mañana a las 9:00?»). " +
          "Básate solo en lo que escribió y en sus tareas; no inventes datos. Si se siente cansado o agobiado, propone aligerar, no añadir. No repitas lo ya decidido ni lo que ya está apuntado esta semana. " +
          'Responde SOLO con JSON: {"propuestas":[{"texto":"…","regla":"…"} o {"texto":"…","tarea":{"title":"…","due":"…","hora":"…","lado":"personal"}}]}',
      },
      {
        role: "user",
        content:
          `HOY ES ${dia} ${o.fecha}.\n\nMI DIARIO:\n${o.texto.slice(0, 4000)}\n\nLO QUE HICE HOY:\n${o.hechas.join("\n") || "(nada marcado)"}\n\nLO QUE NO HICE:\n${o.pendientes.join("\n") || "(nada)"}` +
          `\n\nYA APUNTADO PARA LOS PRÓXIMOS DÍAS:\n${o.semana.join("\n") || "(nada)"}\n\nMIS REGLAS:\n${o.reglas.slice(0, 2500) || "(ninguna)"}\n\nYA DECIDIDO (no repetir):\n${o.decididas.join("\n") || "(nada)"}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          propuestas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                texto: { type: "string" },
                regla: { type: "string" },
                tarea: { type: "object", properties: { title: { type: "string" }, due: { type: "string" }, hora: { type: "string" }, fin: { type: "string" }, lado: { type: "string", enum: ["personal", "trabajo"] }, meta: { type: "boolean" } }, required: ["title", "due", "lado"] },
              },
              required: ["texto"],
            },
          },
        },
        required: ["propuestas"],
      },
    },
    max_tokens: 900,
    temperature: 0.3,
  });
  const xs = parsed<{ propuestas: unknown }>(r)?.propuestas;
  if (!Array.isArray(xs)) return [];
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  return xs
    .map((x: Record<string, unknown>) => {
      const texto = String(x?.texto ?? "").trim().slice(0, 220);
      const t = x?.tarea as Record<string, unknown> | undefined;
      if (t && typeof t === "object") {
        const title = String(t.title ?? "").trim().slice(0, 120);
        const due = String(t.due ?? "");
        const hora = String(t.hora ?? "");
        const fin = String(t.fin ?? "");
        if (!title || !fecha.test(due) || due <= o.fecha) return null;
        const conHora = hm.test(hora);
        return {
          texto,
          tarea: { title, due, ...(conHora ? { hora } : {}), ...(conHora && hm.test(fin) && fin > hora ? { fin } : {}), lado: t.lado === "trabajo" ? ("trabajo" as const) : ("personal" as const), meta: t.meta === true },
        };
      }
      const regla = String(x?.regla ?? "").trim().slice(0, 300);
      return regla ? { texto, regla } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && !!x.texto)
    .slice(0, 3);
}

/** Propone cuándo trabajar hoy en cada meta sin hora, mirando el itinerario del día */
export async function horasMetas(
  ai: AI,
  o: { fecha: string; ahora: string; metas: { id: string; t: string; lado: string }[]; bloques: string[]; reglas: string },
): Promise<{ id: string; s: string; e: string }[]> {
  const dia = DIAS[new Date(o.fecha + "T12:00:00Z").getUTCDay()];
  const r = await ai.run(LLM, {
    messages: [
      {
        role: "system",
        content:
          "Ayudas a una persona a decidir cuándo trabajar hoy en sus metas. Tienes su itinerario del día y sus reglas. " +
          "Para cada meta propone UN bloque realista (s y e en HH:MM, normalmente de 45 a 120 minutos) que empiece después de la hora actual. " +
          "Las metas de trabajo van en bloques de trabajo o huecos libres de horario laboral; las personales en huecos personales. " +
          "Nunca encima de compromisos fijos (iglesia, turnos, citas), comidas, pastillas ni de otras tareas o metas ya puestas; puede ir dentro de bloques genéricos como «trabajo», «bloque de mañana» o «libre». " +
          "Respeta sus reglas. Si una meta no cabe hoy, no la incluyas. No solapes las propuestas entre sí. " +
          'Responde SOLO con JSON: {"propuestas":[{"id":"…","s":"HH:MM","e":"HH:MM"}]}',
      },
      {
        role: "user",
        content: `HOY: ${dia} ${o.fecha}, ahora son las ${o.ahora}.\n\nMI ITINERARIO DE HOY:\n${o.bloques.join("\n") || "(vacío)"}\n\nMETAS SIN HORA:\n${o.metas.map((m) => `${m.id} · [${m.lado}] ${m.t}`).join("\n")}\n\nMIS REGLAS:\n${o.reglas.slice(0, 2500) || "(ninguna)"}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { type: "object", properties: { propuestas: { type: "array", items: { type: "object", properties: { id: { type: "string" }, s: { type: "string" }, e: { type: "string" } }, required: ["id", "s", "e"] } } }, required: ["propuestas"] },
    },
    max_tokens: 600,
    temperature: 0.2,
  });
  const xs = parsed<{ propuestas: unknown }>(r)?.propuestas;
  if (!Array.isArray(xs)) return [];
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const ids = new Set(o.metas.map((m) => m.id));
  const usados: [string, string][] = [];
  return xs
    .map((x: Record<string, unknown>) => ({ id: String(x?.id ?? ""), s: String(x?.s ?? ""), e: String(x?.e ?? "") }))
    .filter((x) => {
      if (!ids.has(x.id) || !hm.test(x.s) || !hm.test(x.e) || x.e <= x.s || x.s < o.ahora) return false;
      if (usados.some(([s, e]) => x.s < e && s < x.e)) return false;
      ids.delete(x.id);
      usados.push([x.s, x.e]);
      return true;
    });
}
