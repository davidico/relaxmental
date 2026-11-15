/**
 * Claude (Anthropic) para «Pregúntale a la IA»: lee todas las notas de la persona y su contexto de hoy (itinerario, últimos 14 días, memoria y reglas)
 * y responde a lo que sea: sus notas, su tiempo o cualquier otra cosa.
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
  "No des consejos médicos, legales ni financieros profesionales: sugiere consultar a un profesional. No puedes cambiar nada en la app: si recomiendas apuntar algo, dile dónde añadirlo. " +
  "Sé breve salvo que pida un repaso completo. Escribe sin asteriscos, títulos ni otro formato aparte de los «• ». " +
  "Termina SIEMPRE con una última línea aparte que diga exactamente «NOTAS:» seguido de los números de las notas que citaste o usaste, separados por comas (por ejemplo «NOTAS: 3, 7, 12»), o «NOTAS: ninguna».";

type Turno = { de: "yo" | "ia"; texto: string };
type NotaIA = { titulo: string; carpeta: string; fecha: string; texto: string };

/**
 * Pregunta a Claude. Devuelve la respuesta y las posiciones de las notas citadas, o null si Claude no respondió
 * (sin clave, error de red, límite de uso o una negativa): entonces se usa el camino de siempre.
 */
export async function responderClaude(apiKey: string, o: { pregunta: string; charla: Turno[]; notas: NotaIA[]; contexto: string }): Promise<{ respuesta: string; usadas: number[] } | null> {
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
    const respuesta = (linea ? texto.slice(0, linea.index) : texto).replace(/\*\*/g, "").trim();
    if (!respuesta) return null;
    const usadas = linea
      ? [...new Set((linea[1].match(/\d+/g) ?? []).map((n) => Number(n) - 1).filter((n) => n >= 0 && n < o.notas.length))].sort((a, b) => a - b).slice(0, 15)
      : [];
    return { respuesta: respuesta.slice(0, 8000), usadas };
  } catch (e) {
    /* Solo el tipo de error, nunca el contenido de las notas */
    if (e instanceof Anthropic.AuthenticationError) console.error("Claude: la clave ANTHROPIC_API_KEY no es válida");
    else if (e instanceof Anthropic.RateLimitError) console.error("Claude: límite de uso alcanzado");
    else if (e instanceof Anthropic.APIError) console.error(`Claude: error ${e.status}`);
    else console.error("Claude: sin conexión");
    return null;
  }
}
