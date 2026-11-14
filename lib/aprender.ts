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

/** Algo que la IA recuerda de la persona. Lo ve, lo corrige y lo borra en «Lo que la IA recuerda de mí» */
export interface Recuerdo {
  id: string;
  texto: string;
  fecha: string;
  /** De dónde salió: del diario, del resumen de la semana, o lo escribió la persona */
  origen: "diario" | "semana" | "tu";
}
const MAX_RECUERDOS = 40;

/** Añade recuerdos nuevos (sin repetir). Si se pasa del tope, salen los más antiguos que no escribió la persona */
export function anadirRecuerdos(perfil: Perfil, savePerfil: (id: string, d: unknown) => void, textos: string[], origen: Recuerdo["origen"]) {
  const previos = (perfil.memoria as Recuerdo[] | undefined) ?? [];
  const ya = new Set(previos.map((r) => r.texto.trim().toLowerCase()));
  const nuevos: Recuerdo[] = [];
  for (const t of textos.map((x) => x.trim()).filter(Boolean)) {
    if (ya.has(t.toLowerCase())) continue;
    ya.add(t.toLowerCase());
    nuevos.push({ id: `${Date.now().toString(36)}m${nuevos.length}`, texto: t.slice(0, 200), fecha: new Date().toISOString(), origen });
  }
  if (!nuevos.length) return 0;
  let todos = [...previos, ...nuevos];
  while (todos.length > MAX_RECUERDOS) {
    const i = todos.findIndex((r) => r.origen !== "tu");
    todos.splice(i < 0 ? 0 : i, 1);
  }
  savePerfil("memoria", todos);
  return nuevos.length;
}

type Propuesta = { texto: string; regla?: string; tarea?: Aprendizaje["tarea"] };
/** Guarda propuestas de la IA para que la persona las acepte o no en «Mis propuestas para ti» */
function guardarPropuestas(perfil: Perfil, savePerfil: (id: string, d: unknown) => void, propuestas: Propuesta[], marca: string) {
  const previas = (perfil.aprendizajes as Aprendizaje[] | undefined) ?? [];
  const ya = new Set(previas.map((x) => x.texto.toLowerCase()));
  const nuevas: Aprendizaje[] = (propuestas ?? [])
    .filter((c) => c.texto && (c.regla || c.tarea) && !ya.has(c.texto.toLowerCase()))
    .map((c, i) => ({ id: `${Date.now().toString(36)}${marca}${i}`, texto: c.texto, regla: c.regla ?? "", ...(c.tarea ? { tarea: c.tarea } : {}), estado: "nueva", fecha: new Date().toISOString() }));
  if (nuevas.length) savePerfil("aprendizajes", [...previas, ...nuevas].slice(-60));
  return nuevas.length;
}
const decididas = (perfil: Perfil) => ((perfil.aprendizajes as Aprendizaje[] | undefined) ?? []).slice(-30).map((x) => x.texto);

/**
 * El diario de la noche: la IA lo lee junto con lo que cumpliste, tus últimos días y lo que recuerda de ti.
 * Deja propuestas (que tú aceptas o no) y apunta en su memoria lo nuevo que aprendió.
 */
export async function leerDiario(
  perfil: Perfil,
  savePerfil: (id: string, d: unknown) => void,
  o: { fecha: string; texto: string; hechas: string[]; pendientes: string[]; semana: string[] },
) {
  const r = await fetch("/api/ai/diario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...o, reglas: perfil.reglas?.text ?? "", decididas: decididas(perfil) }),
  });
  if (!r.ok) throw new Error("diario");
  const { propuestas, recuerdos, temas } = (await r.json()) as { propuestas: Propuesta[]; recuerdos?: string[]; temas?: unknown };
  const aprendido = anadirRecuerdos(perfil, savePerfil, recuerdos ?? [], "diario");
  /* Los temas del diario que la persona podría hablar con alguien (no se guardan: ella decide si los apunta en una lista) */
  const hablar = Array.isArray(temas) ? temas.map((t) => String(t).trim()).filter(Boolean).slice(0, 5) : [];
  return { propuestas: guardarPropuestas(perfil, savePerfil, propuestas, "d"), recuerdos: aprendido, temas: hablar };
}

/** El resumen de la semana: lo guarda en el perfil, deja sus recomendaciones como propuestas y apunta lo aprendido */
export async function pedirResumenSemana(perfil: Perfil, savePerfil: (id: string, d: unknown) => void, semana: string) {
  const r = await fetch("/api/ai/semana", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decididas: decididas(perfil) }) });
  if (!r.ok) throw new Error("semana");
  const { resumen, propuestas, recuerdos } = (await r.json()) as { resumen: string; propuestas: Propuesta[]; recuerdos?: string[] };
  savePerfil("resumenSemana", { semana, texto: resumen, fecha: new Date().toISOString() });
  anadirRecuerdos(perfil, savePerfil, recuerdos ?? [], "semana");
  return guardarPropuestas(perfil, savePerfil, propuestas, "s");
}
