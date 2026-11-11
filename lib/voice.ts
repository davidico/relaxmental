/** Añade párrafos dictados al final de una nota (HTML del editor y texto plano) */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function appendParas(html: string, text: string, paras: string[]) {
  const empty = !html || html === "<p></p>";
  return {
    html: (empty ? "" : html) + paras.map((p) => `<p>${esc(p)}</p>`).join(""),
    text: [text.trim(), ...paras].filter(Boolean).join("\n\n"),
  };
}

/** Pide a la IA un título corto para el texto dictado (si falla, no pasa nada) */
export async function suggestTitle(text: string): Promise<string> {
  try {
    const r = await fetch("/api/ai/title", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 4000) }) });
    if (!r.ok) return "";
    return (((await r.json()) as { title?: string }).title ?? "").trim();
  } catch {
    return "";
  }
}
