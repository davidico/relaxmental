import type { Habito } from "./types";
import { addD, today } from "./dates";

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
