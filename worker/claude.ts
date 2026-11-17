/**
 * Claude (Anthropic) para «Pregúntale a la IA»: lee todas las notas de la persona y su contexto de hoy (itinerario, últimos 14 días, memoria, reglas
 * y lo que puede organizar) y responde a lo que sea: sus notas, su tiempo o cualquier otra cosa. Puede proponer cambios en sus metas y tareas
 * (lib/cambios.ts), que la persona aplica o no.
 * Solo se usa si el Worker tiene el secreto ANTHROPIC_API_KEY (Cloudflare › Workers › relaxmental › Settings › Variables and Secrets).
 * Si no lo tiene, o Claude falla, la app sigue con la IA de Cloudflare (Llama 3.3).
 */
import Anthropic from "@anthropic-ai/sdk";
import { textoNotas } from "./ai";

export const MODELO_CLAUDE = "claude-opus-5-5";
/** Lo que se le manda como mucho a Claude: unas 600 000 letras (unas 200 000 fichas; el modelo admite un millón) */
export const PRESUPUESTO_CLAUDE = 600000;

const INSTRUCCIONES =
  "Eres la IA de una persona dentro de su app de agenda y segundo cerebro. Te puede preguntar lo que sea y tú respondes, en español, en segunda persona, directo y amable. " +
  "Tienes TODAS sus notas (abajo, numeradas, agrupadas por sección y ordenadas por fecha) y, en cada pregunta, el contexto de hoy: la fecha y la hora, su itinerario de hoy, sus últimos 14 días (qué momentos cumplió, qué cambió a mano, tareas, hábitos y diarios), lo que recuerdas de ella y sus reglas. " +
  "1) Si pregunta por lo que tiene escrito (sus notas, ideas, sueños, profecías, listas, «dónde hablé de…»): responde SOLO con lo que dicen las notas, sin inventar, completar ni interpretar (ni sueños ni profecías). " +
  "Recoge CADA nota que hable del tema, aunque sea de pasada o con otras palabras; no te quedes con las primeras. Si hay varias, una frase corta de introducción y luego una lista de la más antigua a la más reciente: " +
  "una línea por nota que empieza con «• », la fecha tal como sale en su título, dos puntos y lo que decía, con sus palabras. Si es una sola, una o dos frases con su fecha. Si no hay nada, dilo claramente. " +
  "2) Si pregunta por su tiempo, su día, su semana, sus tareas o sus hábitos: usa el contexto y también sus notas si vienen al caso. Da recomendaciones concretas (qué, qué día y a qué hora) y respeta sus reglas. No inventes compromisos ni datos que no estén. " +
  "3) Si pregunta otra cosa (algo general, una idea, un consejo, una explicación): responde con lo que sabes, breve y útil; si sus notas o su contexto ayudan, úsalos. " +
  "No des consejos médicos, legales ni financieros profesionales: sugiere consultar a un profesional. " +
  "SÍ puedes cambiar su semana: proponer cambios en sus metas y tareas (moverlas de día, meterlas dentro de un momento de su día, darles una hora propia, pasarlas a Pendientes o crear una nueva) y en los momentos de sus días (quitar, cambiar o añadir uno, solo ese día). " +
  "La app le enseña tus cambios debajo de la respuesta, cada uno con su casilla, y un botón para aplicarlos: nada cambia hasta que ella lo toque. " +
  "Propón cambios cuando te pida ponerlo, agregarlo, meterlo, moverlo, quitarlo, cambiarlo u organizarlo (también si solo dice «ok», «ponle» o «hazlo» después de una recomendación tuya) o cuando lo que recomiendas sea reorganizar tareas concretas. " +
  "Usa solo las tareas (por su código) y los momentos (por su clave) de «LOS MOMENTOS DE MIS PRÓXIMOS DÍAS» y «MIS METAS Y TAREAS SIN HACER». Una tarea puede ir a un momento que añades o cambias en esa misma lista de cambios. " +
  "Si una meta encaja en un momento de su día (por ejemplo una meta de trabajo en el momento de trabajo), métela dentro de ese momento en vez de dejarla suelta en el día o darle otra hora. " +
  "Con cambios, en la respuesta no repitas la lista entera: di en una o dos frases qué propones y que abajo tiene los cambios para aplicarlos. Nunca digas que no puedes ponerlo en su semana. " +
  "Su horario sale de su semana tipo (y de sus compromisos con fecha y de los días que ajustó a mano), no de sus reglas. Su semana tipo es solo un modelo, no algo que haya que seguir sí o sí: " +
  "también puedes cambiar los momentos de días concretos (quitar uno, cambiarle el nombre, las horas o la descripción, o añadir uno nuevo) cuando te lo pida o cuando su día real sea distinto (por ejemplo «el martes no hay iglesia»: quita ese momento ese martes y pon lo que haga en su lugar). " +
  "Si es algo de todas las semanas, cambia los días concretos de las próximas dos semanas y dile que, si quiere que quede para siempre, lo cambie en Perfil › Mi semana tipo. " +
  "Nunca digas que no puedes tocar sus momentos del día. Lo que no puedes cambiar son sus hábitos, sus reglas ni sus notas: para eso dile dónde hacerlo. " +
  "Si propones cambios, antes de la línea NOTAS escribe una línea aparte que empiece por «CAMBIOS:» seguida de una lista JSON en esa misma línea, un objeto por tarea. " +
  "Mover una tarea dentro de un momento: {\"tarea\":\"T4\",\"fecha\":\"AAAA-MM-DD\",\"momento\":\"clave del momento ese día\"}. Con hora propia: {\"tarea\":\"T4\",\"fecha\":\"AAAA-MM-DD\",\"hora\":\"HH:MM\",\"fin\":\"HH:MM\"}. " +
  "Ese día sin hora: {\"tarea\":\"T4\",\"fecha\":\"AAAA-MM-DD\"}. A Pendientes: {\"tarea\":\"T4\",\"fecha\":\"\"}. Una nueva: {\"nueva\":\"título corto\",\"fecha\":\"AAAA-MM-DD\",\"momento\":\"…\",\"meta\":true,\"lado\":\"trabajo\"} (momento u hora si hace falta; lado \"trabajo\" o \"personal\"). " +
  "Momentos de un día: quitar {\"dia\":\"AAAA-MM-DD\",\"quitar\":\"clave del momento\"}; cambiar {\"dia\":\"AAAA-MM-DD\",\"cambiar\":\"clave del momento\",\"t\":\"nombre nuevo\",\"s\":\"HH:MM\",\"e\":\"HH:MM\",\"sub\":\"descripción\"} (solo lo que cambie); añadir {\"dia\":\"AAAA-MM-DD\",\"anadir\":\"nombre\",\"s\":\"HH:MM\",\"e\":\"HH:MM\"}. Lo que se cruce con un momento cambiado o nuevo se recorta. " +
  "Las fechas, de hoy a dos semanas como mucho. " +
  "Sé breve salvo que pida un repaso completo. Escribe sin asteriscos, títulos ni otro formato aparte de los «• ». " +
  "Termina SIEMPRE con una última línea aparte que diga exactamente «NOTAS:» seguido de los números de las notas que citaste o usaste, separados por comas (por ejemplo «NOTAS: 3, 7, 12»), o «NOTAS: ninguna».";

type Turno = { de: "yo" | "ia"; texto: string };
type NotaIA = { titulo: string; carpeta: string; fecha: string; texto: string };

/**
 * Pregunta a Claude. Devuelve la respuesta y las posiciones de las notas citadas, o null si Claude no respondió
 * (sin clave, error de red, límite de uso o una negativa): entonces se usa el camino de siempre.
 */
export async function responderClaude(apiKey: string, o: { pregunta: string; charla: Turno[]; notas: NotaIA[]; contexto: string }): Promise<{ respuesta: string; usadas: number[]; cambios: unknown } | null> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 });
  /* La conversación anterior (empieza siempre con la persona) y la pregunta nueva */
  const previa = o.charla.slice(-6);
  while (previa.length && previa[0].de === "ia") previa.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...previa.map((m) => ({ role: m.de === "yo" ? ("user" as const) : ("assistant" as const), content: m.texto.slice(0, 3000) })),
    /* El contexto de hoy va con la pregunta (cambia cada vez); las notas, fijas en el sistema, quedan en caché */
    { role: "user", content: `CONTEXTO DE HOY (no es parte de la pregunta):\n${o.contexto}\n\nMI PREGUNTA: ${o.pregunta.slice(0, 1200)}` },
  ];
  try {
    const r = await client.beta.messages.create({
      model: MODELO_CLAUDE,
      max_tokens: 16000,
      /* Si Claude Opus declina responder por sus filtros, el servidor lo reintenta con el modelo adecuado */
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: INSTRUCCIONES },
        /* Las notas van fijas en el sistema y en caché: las preguntas siguientes de la misma charla cuestan mucho menos */
        { type: "text", text: `MIS NOTAS:\n${o.notas.length ? textoNotas(o.notas) : "(todavía no tengo notas)"}`, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
    if (r.stop_reason === "refusal") return null;
    const texto = r.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!texto) return null;
    const linea = texto.match(/\n?\s*NOTAS\s*:\s*([^\n]*)\s*$/i);
    let cuerpo = linea ? texto.slice(0, linea.index) : texto;
    /* Los cambios que propone (una lista JSON tras «CAMBIOS:»): se quitan del texto y los comprueba el Worker */
    let cambios: unknown = null;
    const c = cuerpo.match(/\n?[ \t]*CAMBIOS\s*:\s*(\[[\s\S]*\])\s*$/i);
    if (c) {
      try {
        cambios = JSON.parse(c[1]);
      } catch {
        cambios = null;
      }
      cuerpo = cuerpo.slice(0, c.index);
    }
    const respuesta = cuerpo.replace(/\*\*/g, "").trim();
    if (!respuesta) return null;
    const usadas = linea
      ? [...new Set((linea[1].match(/\d+/g) ?? []).map((n) => Number(n) - 1).filter((n) => n >= 0 && n < o.notas.length))].sort((a, b) => a - b).slice(0, 15)
      : [];
    return { respuesta: respuesta.slice(0, 8000), usadas, cambios };
  } catch (e) {
    /* Solo el tipo de error, nunca el contenido de las notas */
    if (e instanceof Anthropic.AuthenticationError) console.error("Claude: la clave ANTHROPIC_API_KEY no es válida");
    else if (e instanceof Anthropic.RateLimitError) console.error("Claude: límite de uso alcanzado");
    else if (e instanceof Anthropic.APIError) console.error(`Claude: error ${e.status}`);
    else console.error("Claude: sin conexión");
    return null;
  }
}

/* ---------- Toda la IA de texto con Claude ---------- */

const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const VISION = "@cf/meta/llama-3.2-11b-vision-instruct";
type IA = { run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>> };
type Msg = { role?: unknown; content?: unknown };

/**
 * Con la clave de Anthropic, todo lo que la app le pide a la IA de texto (el horario del día, la semana tipo, el diario, el resumen,
 * los títulos, la foto de un horario…) lo responde Claude. Se mantiene la misma forma de pedir y de responder que Workers AI
 * ({ response: "…" }), así el resto del código no cambia. Si Claude falla o se niega, sigue Llama como antes.
 * La voz (Whisper) sigue siempre en Cloudflare.
 */
export function conClaude(ai: IA, apiKey?: string): IA {
  if (!apiKey) return ai;
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  return {
    async run(model, input) {
      if (model !== LLAMA && model !== VISION) return ai.run(model, input);
      try {
        const texto = await pedirClaude(client, input);
        if (texto) return { response: texto };
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) console.error("Claude: la clave ANTHROPIC_API_KEY no es válida");
        else if (e instanceof Anthropic.RateLimitError) console.error("Claude: límite de uso alcanzado");
        else if (e instanceof Anthropic.APIError) console.error(`Claude: error ${e.status}`);
        else console.error("Claude: sin conexión");
      }
      return ai.run(model, input);
    },
  };
}

async function pedirClaude(client: Anthropic, input: Record<string, unknown>): Promise<string> {
  const msgs = (Array.isArray(input.messages) ? input.messages : []) as Msg[];
  const sistema = msgs.filter((m) => m.role === "system").map((m) => String(m.content ?? ""));
  /* Si se pedía JSON con un esquema, se le pide igual en el texto (la app ya sabe sacar el JSON de la respuesta) */
  const rf = input.response_format as { type?: string; json_schema?: unknown } | undefined;
  if (rf?.type === "json_schema" && rf.json_schema) {
    sistema.push(`Responde SOLO con un objeto JSON válido, sin texto antes ni después y sin \`\`\`, que siga este esquema JSON:\n${JSON.stringify(rf.json_schema)}`);
  }
  /* El resto de la conversación, con los turnos de la misma persona juntos y empezando por la persona */
  const turnos: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of msgs) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const t = String(m.content ?? "");
    const prev = turnos[turnos.length - 1];
    if (prev && prev.role === m.role) prev.content += `\n\n${t}`;
    else turnos.push({ role: m.role, content: t });
  }
  while (turnos.length && turnos[0].role === "assistant") turnos.shift();
  if (!turnos.length || turnos[turnos.length - 1].role === "assistant") turnos.push({ role: "user", content: "Continúa." });

  const messages: Anthropic.Beta.BetaMessageParam[] = turnos.map((t) => ({ role: t.role, content: t.content }));
  /* La foto de un horario: va como imagen en el último mensaje de la persona */
  const img = typeof input.image === "string" ? input.image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) : null;
  if (img) {
    const ultimo = messages[messages.length - 1];
    messages[messages.length - 1] = {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: img[1] as "image/jpeg" | "image/png" | "image/webp", data: img[2] } },
        { type: "text", text: String(ultimo.content) },
      ],
    };
  }
  /* Lo corto (títulos, tipos) va rápido; lo que arma o piensa (horario, diario, resumen) con más calma */
  const pedidos = Number(input.max_tokens) || 1024;
  const r = await client.beta.messages.create({
    model: MODELO_CLAUDE,
    /* Claude piensa antes de responder y eso también cuenta: se le deja margen de sobra */
    max_tokens: Math.max(8000, pedidos * 4),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: pedidos <= 600 ? "low" : "medium" },
    ...(sistema.length ? { system: sistema.join("\n\n") } : {}),
    messages,
  });
  if (r.stop_reason === "refusal") return "";
  return r.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
