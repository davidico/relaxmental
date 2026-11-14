import type { Bloque } from "./plan";

/** Cómo se nombra un momento del día: por su hora de inicio y su nombre */
export const claveDe = (b: Pick<Bloque, "s" | "t">) => `${b.s}|${b.t}`;

/**
 * El momento al que pertenece una subtarea (`Tarea.momento`): el de esa hora y ese nombre;
 * si la hora cambió (el día se movió o se editó), el primero con ese nombre. Si ya no existe, nada.
 */
export function bloqueDeSub(momento: string, blocks: Bloque[]): Bloque | undefined {
  const libres = blocks.filter((b) => !b.tarea);
  const nombre = momento.slice(momento.indexOf("|") + 1);
  return libres.find((b) => claveDe(b) === momento) ?? libres.find((b) => b.t === nombre);
}
