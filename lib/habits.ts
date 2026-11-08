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
 * Un color distinto para cada hábito (según su orden), todos pasteles vivos.
 * Comprobado: texto oscuro encima ≥ 7:1 y, oscurecidos en el mapa, ≥ 3:1.
 */
export const HABIT_COLORS = ["#f2c879", "#8fb8f0", "#f4a38c", "#8fd4ac", "#c3a6ef", "#f2a7c6", "#82d2d6", "#f5b97a", "#a9b4f5", "#b9d68a", "#e0a3e0"];
export function habitColor(h: Habito, all: Habito[]) {
  const i = sortHabits(all).findIndex((x) => x.id === h.id);
  return HABIT_COLORS[(i < 0 ? 0 : i) % HABIT_COLORS.length];
}
