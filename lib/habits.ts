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
