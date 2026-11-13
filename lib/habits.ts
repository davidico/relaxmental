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
