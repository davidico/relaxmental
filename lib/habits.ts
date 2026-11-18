import type { Habito } from "./types";
import { addD, mondayOf, today } from "./dates";

/** Días seguidos cumplidos, contando hasta hoy (o hasta ayer si hoy aún no lo marcaste) */
export function streak(h: Habito, t = today()) {
  let d = h.hechos[t] ? t : addD(t, -1);
  let n = 0;
  while (h.hechos[d]) {
    n++;
    d = addD(d, -1);
  }
  return n;
}

export function last30(h: Habito, t = today()) {
  let n = 0;
  for (let i = 0; i < 30; i++) if (h.hechos[addD(t, -i)]) n++;
  return n;
}

export const sortHabits = (list: Habito[]) =>
  [...list].sort((a, b) => a.orden - b.orden || a.name.localeCompare(b.name));

/**
 * Un color distinto para cada hábito (según su orden).
 * Comprobado: ≥ 3:1 contra las casillas vacías (WCAG 1.4.11).
 */
export const HABIT_COLORS = ["#4d7c0f", "#0284c7", "#0d9488", "#059669", "#b45309", "#ea580c", "#e11d48", "#db2777", "#7c3aed", "#0e7490", "#a16207"];
export function habitColor(h: Habito, all: Habito[]) {
  const i = sortHabits(all).findIndex((x) => x.id === h.id);
  return HABIT_COLORS[(i < 0 ? 0 : i) % HABIT_COLORS.length];
}

/** La racha más larga de toda la historia del hábito */
export function bestStreak(h: Habito) {
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of Object.keys(h.hechos).filter((k) => h.hechos[k]).sort()) {
    run = prev && addD(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/* ---------- Tipos de hábito: de marca, medible y «dejar» ---------- */
export type TipoHabito = "marca" | "medible" | "dejar";
export const tipoDe = (h: Habito): TipoHabito => h.tipo ?? "marca";
export const TIPOS: Record<TipoHabito, string> = { marca: "De marca", medible: "Medible", dejar: "Para dejar" };

/** Números como se escriben en español: 2,5 (sin ceros de más) */
export const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
/** «2,5 km» */
export const conUnidad = (h: Habito, n: number) => `${num(n)}${h.unidad ? " " + h.unidad : ""}`;
export const cantidad = (h: Habito, d: string) => h.cantidades?.[d] ?? 0;

/** Anota la cantidad de un día en un hábito medible (0 la borra). El día cuenta como hecho si llega a la meta (o si hay algo, sin meta) */
export function anotar(h: Habito, d: string, n: number): Habito {
  const cantidades = { ...(h.cantidades ?? {}) };
  const hechos = { ...h.hechos };
  const v = Math.max(0, Math.round(n * 100) / 100);
  if (v > 0) cantidades[d] = v;
  else delete cantidades[d];
  if (v > 0 && v >= (h.objetivo ?? 0)) hechos[d] = true;
  else delete hechos[d];
  return { ...h, cantidades, hechos };
}

/** Atajos para sumar rápido, según la unidad */
export function pasosDe(h: Habito): number[] {
  const u = (h.unidad ?? "").trim().toLowerCase();
  if (/^(km|kg|l|litros?|h|horas?)$/.test(u)) return [0.5, 1, 5];
  if (/^(min|minutos?|pasos|ml|kcal)$/.test(u)) return [5, 10, 30];
  return [1, 5, 10];
}

/** Suma de un medible en un rango de fechas (incluidas) */
export function total(h: Habito, desde: string, hasta: string) {
  let n = 0;
  for (const [d, v] of Object.entries(h.cantidades ?? {})) if (d >= desde && d <= hasta) n += v;
  return Math.round(n * 100) / 100;
}

/* ---------- Hábitos dentro del día: una tarea o un momento que cuenta como hábito ---------- */
const VACIAS = new Set("el la los las de del y a al en un una por para con mi mis tu tus su sus que".split(" "));
const llanoH = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Las raíces de las palabras con significado («Leer la Biblia» → leer, bibli) */
const raicesH = (t: string) => llanoH(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !VACIAS.has(w)).map((w) => w.slice(0, 5));

/**
 * El hábito que se reconoce en el nombre de una tarea o de un momento: todas las palabras del hábito están en el nombre
 * («Leer» en «Leer un capítulo»). Si encajan varios, el más concreto (el de más palabras).
 */
export function habitoDeNombre(nombre: string, habitos: Habito[]): Habito | undefined {
  const r = new Set(raicesH(nombre));
  if (!r.size) return undefined;
  return habitos
    .map((h) => ({ h, rs: raicesH(h.name) }))
    .filter(({ rs }) => rs.length > 0 && rs.every((x) => r.has(x)))
    .sort((a, b) => b.rs.length - a.rs.length)[0]?.h;
}

/** El hábito al que cuenta una tarea: el que se eligió, o el que se reconoce por su nombre (salvo que se quitara el enlace) */
export function habitoDeTarea(x: { title: string; habito?: string }, habitos: Habito[]): Habito | undefined {
  if (x.habito === "") return undefined;
  return (x.habito ? habitos.find((h) => h.id === x.habito) : undefined) ?? habitoDeNombre(x.title, habitos);
}

/**
 * Marca (o desmarca) un día de un hábito porque se hizo la tarea o el momento que cuenta para él.
 * En un medible con meta, hacerlo anota la meta si aún no llegaba; desmarcar nunca borra cantidades anotadas.
 */
export function marcarHabito(h: Habito, dia: string, hecho: boolean): Habito {
  if (tipoDe(h) === "medible") {
    if (hecho && h.objetivo && cantidad(h, dia) < h.objetivo) return anotar(h, dia, h.objetivo);
    if (hecho) return { ...h, hechos: { ...h.hechos, [dia]: true } };
    if (cantidad(h, dia)) return h;
  }
  const hechos = { ...h.hechos };
  if (hecho) hechos[dia] = true;
  else delete hechos[dia];
  return { ...h, hechos };
}

/** La clave con la que se recuerda el hábito de un momento: su nombre en minúsculas y sin tildes */
export const claveMomento = (nombre: string) => llanoH(nombre).replace(/\s+/g, " ").trim();

/**
 * El hábito que cuenta un momento del horario: el que la persona eligió para ese nombre (vale para todos los días),
 * o si no eligió nada, el que se reconoce por las palabras del nombre.
 */
export function habitoDeMomento(nombre: string, habitos: Habito[], mapa?: Record<string, string>): Habito | undefined {
  const k = claveMomento(nombre);
  if (mapa && k in mapa) return mapa[k] ? habitos.find((h) => h.id === mapa[k]) : undefined;
  return habitoDeNombre(nombre, habitos);
}

/** Cuántos días por semana quiere hacerlo (7 = todos los días; sin responder, también). Un mal hábito para dejar es siempre de todos los días */
export const vecesDe = (h: Habito) => (h.tipo !== "dejar" && h.veces && h.veces >= 1 && h.veces < 7 ? h.veces : 7);
/** Cuántas veces lo hizo esta semana (de lunes a hoy) */
export function enLaSemana(h: Habito, t = today()) {
  const lunes = mondayOf(t);
  let n = 0;
  for (let d = lunes; d <= t; d = addD(d, 1)) if (h.hechos[d]) n++;
  return n;
}
export const textoVeces = (n: number) => (n >= 7 ? "Todos los días" : n === 1 ? "1 día por semana" : `${n} días por semana`);
/** Un hábito al que aún no se le preguntó cuántos días por semana (los creados antes de esta pregunta). Uno para dejar no se pregunta */
export const sinDias = (h: Habito) => h.tipo !== "dejar" && !(typeof h.veces === "number" && h.veces >= 1 && h.veces <= 7);
