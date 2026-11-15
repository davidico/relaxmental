import type { Bloque } from "../lib/plan";
import { bloqueDeSub } from "../lib/momentos";

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
type T = { id?: string; title?: string; due?: string; hora?: string; done?: boolean; momento?: string };

/**
 * Las subtareas que quedaron sin hacer en los momentos que acaban de terminar (hace menos de 10 minutos),
 * agrupadas por momento: cada momento manda un solo aviso con todas las suyas.
 */
export function subtareasQueQuedaron(tareas: T[], blocks: Bloque[], date: string, min: number): Map<Bloque, string[]> {
  const quedaron = new Map<Bloque, string[]>();
  for (const x of tareas) {
    if (x.done || x.due !== date || x.hora || typeof x.momento !== "string" || typeof x.title !== "string") continue;
    const b = bloqueDeSub(x.momento, blocks);
    if (!b) continue;
    const fin = toMin(b.e);
    if (!(fin <= min && min - fin < 10)) continue;
    quedaron.set(b, [...(quedaron.get(b) ?? []), x.title]);
  }
  return quedaron;
}
