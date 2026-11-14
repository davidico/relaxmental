/**
 * Claude (Anthropic) para «Pregúntale a tus notas»: lee todas las notas de la persona a la vez y responde con el repaso completo.
 * Solo se usa si el Worker tiene el secreto ANTHROPIC_API_KEY (Cloudflare › Workers › relaxmental › Settings › Variables and Secrets).
 * Si no lo tiene, o Claude falla, la app sigue con la IA de Cloudflare (Llama 3.3).
 */
import Anthropic from "@anthropic-ai/sdk";
import { textoNotas } from "./ai";

export const MODELO_CLAUDE = "claude-opus-5-5";
/** Lo que se le manda como mucho a Claude: unas 600 000 letras (unas 200 000 fichas; el modelo admite un millón) */
export const PRESUPUESTO_CLAUDE = 600000;

const INSTRUCCIONES =
  "Ayudas a una persona a encontrar y repasar lo que hay en sus propias notas personales, dentro de su app de agenda. Te doy TODAS sus notas, numeradas, agrupadas por sección y ordenadas por fecha. " +
  "Respondes SOLO con lo que dicen las notas: no inventes, no completes con lo que tú sepas y no interpretes (ni sueños ni profecías); solo cuentas lo que está escrito. No des consejos médicos, legales ni financieros. " +
  "Lee todas las notas de la sección que toca y recoge CADA nota que hable del tema, aunque sea de pasada o con otras palabras " +
  "(por ejemplo, para «lo laboral» cuentan trabajo, empleo, salario, dinero, empresa, proyectos, contratos, firmar papeles o finca raíz). No te quedes con las primeras: la persona quiere el repaso completo. " +
  "Cuando hay varias notas, responde con una frase corta de introducción y luego una lista de la más antigua a la más reciente: una línea por nota que empieza con «• », " +
  "la fecha tal como sale en su título, dos puntos y lo que decía, en segunda persona y con sus palabras (puedes resumir un poco, sin cambiar el sentido). " +
  "Si es una sola nota, dilo en una o dos frases con su fecha. Si te pide «lo de antes» o «algo más», busca las que aún no has mencionado. Si las notas no dicen nada del tema, dilo claramente. " +
  "Escribe en español, sin asteriscos, títulos ni otro formato aparte de los «• ». " +
  "Termina SIEMPRE con una última línea aparte que diga exactamente «NOTAS:» seguido de los números de todas las notas que citaste, separados por comas (por ejemplo «NOTAS: 3, 7, 12»), o «NOTAS: ninguna».";

type Turno = { de: "yo" | "ia"; texto: string };
type NotaIA = { titulo: string; carpeta: string; fecha: string; texto: string };

/**
 * Pregunta a Claude. Devuelve la respuesta y las posiciones de las notas citadas, o null si Claude no respondió
 * (sin clave, error de red, límite de uso o una negativa): entonces se usa el camino de siempre.
 */
export async function responderNotasClaude(apiKey: string, o: { pregunta: string; charla: Turno[]; notas: NotaIA[] }): Promise<{ respuesta: string; usadas: number[] } | null> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 120_000 });
  /* La conversación anterior (empieza siempre con la persona) y la pregunta nueva */
  const previa = o.charla.slice(-6);
  while (previa.length && previa[0].de === "ia") previa.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...previa.map((m) => ({ role: m.de === "yo" ? ("user" as const) : ("assistant" as const), content: m.texto.slice(0, 3000) })),
    { role: "user", content: o.pregunta.slice(0, 600) },
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
        { type: "text", text: `MIS NOTAS:\n${textoNotas(o.notas)}`, cache_control: { type: "ephemeral" } },
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
