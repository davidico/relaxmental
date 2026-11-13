import type { Bloque } from "./plan";
import type { Perfil } from "./data";

/** Un día que la persona ajustó: lo que le propuso la app y cómo lo dejó */
export interface Cambio {
  fecha: string;
  antes: string[];
  despues: string[];
  at: string;
}
/** Una conclusión de la IA sobre cómo arma sus días */
export interface Aprendizaje {
  id: string;
  texto: string; // «Los viernes trabajas de 13:30 a 15:30»
  regla: string; // «Los viernes trabajo de 13:30 a 15:30.» (vacía si la propuesta es solo una tarea)
  /** Propuesta del diario: algo concreto para apuntar en un día */
  tarea?: { title: string; due: string; hora?: string; fin?: string; lado: "personal" | "trabajo"; meta?: boolean };
  estado: "nueva" | "si" | "no";
  fecha: string;
}

const linea = (b: Bloque) => `${b.s}-${b.e} ${b.t}${b.sub ? ` (${b.sub})` : ""}`;

/** Guarda el cambio de un día (se quedan los últimos 30) */
export function registrarCambio(perfil: Perfil, savePerfil: (id: string, d: unknown) => void, fecha: string, antes: Bloque[], despues: Bloque[]) {
  const a = antes.filter((b) => !b.tarea).map(linea);
  const d = despues.filter((b) => !b.tarea).map(linea);
  if (a.join("|") === d.join("|")) return null;
  const prev = ((perfil.historial as Cambio[] | undefined) ?? []).filter((c) => c.fecha !== fecha);
  const nuevo = [...prev, { fecha, antes: a, despues: d, at: new Date().toISOString() }].slice(-30);
  savePerfil("historial", nuevo);
  return nuevo;
}

/** Pide a la IA conclusiones nuevas y las guarda como propuestas */
export async function aprender(perfil: Perfil, savePerfil: (id: string, d: unknown) => void, historialNuevo?: Cambio[]) {
  const historial = historialNuevo ?? ((perfil.historial as Cambio[] | undefined) ?? []);
  if (!historial.length) return 0;
  const previas = (perfil.aprendizajes as Aprendizaje[] | undefined) ?? [];
  const r = await fetch("/api/ai/aprender", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ historial: historial.slice(-12), reglas: perfil.reglas?.text ?? "", decididas: previas.map((x) => x.texto) }),
  });
  if (!r.ok) return 0;
  const { conclusiones } = (await r.json()) as { conclusiones: { texto: string; regla: string }[] };
  const ya = new Set(previas.map((x) => x.texto.toLowerCase()));
  const nuevas: Aprendizaje[] = (conclusiones ?? [])
    .filter((c) => c.texto && c.regla && !ya.has(c.texto.toLowerCase()))
    .map((c, i) => ({ id: `${Date.now().toString(36)}${i}`, texto: c.texto, regla: c.regla, estado: "nueva", fecha: new Date().toISOString() }));
  if (nuevas.length) savePerfil("aprendizajes", [...previas, ...nuevas].slice(-60));
  return nuevas.length;
}

/** Añade una regla aprendida a las reglas, en su propia sección */
export function anadirRegla(reglas: string, regla: string) {
  const titulo = "LO QUE LA APP APRENDIÓ DE MIS DÍAS:";
  const linea = `- ${regla.replace(/^[-•]\s*/, "")}`;
  if (reglas.includes(titulo)) return reglas.replace(titulo, `${titulo}\n${linea}`);
  return `${reglas.trimEnd()}\n\n${titulo}\n${linea}`.trim();
}

/**
 * El diario de la noche: la IA lo lee junto con lo que cumpliste y lo que no,
 * y deja propuestas (reglas o cosas para apuntar en un día) que tú aceptas o no.
 */
export async function leerDiario(
  perfil: Perfil,
  savePerfil: (id: string, d: unknown) => void,
  o: { fecha: string; texto: string; hechas: string[]; pendientes: string[]; semana: string[] },
) {
  const previas = (perfil.aprendizajes as Aprendizaje[] | undefined) ?? [];
  const r = await fetch("/api/ai/diario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...o, reglas: perfil.reglas?.text ?? "", decididas: previas.slice(-30).map((x) => x.texto) }),
  });
  if (!r.ok) throw new Error("diario");
  const { propuestas } = (await r.json()) as { propuestas: { texto: string; regla?: string; tarea?: Aprendizaje["tarea"] }[] };
  const ya = new Set(previas.map((x) => x.texto.toLowerCase()));
  const nuevas: Aprendizaje[] = (propuestas ?? [])
    .filter((c) => c.texto && (c.regla || c.tarea) && !ya.has(c.texto.toLowerCase()))
    .map((c, i) => ({ id: `${Date.now().toString(36)}d${i}`, texto: c.texto, regla: c.regla ?? "", ...(c.tarea ? { tarea: c.tarea } : {}), estado: "nueva", fecha: new Date().toISOString() }));
  if (nuevas.length) savePerfil("aprendizajes", [...previas, ...nuevas].slice(-60));
  return nuevas.length;
}
