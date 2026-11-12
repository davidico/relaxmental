import type { Carpeta } from "./types";

/** Carpetas en orden de árbol, con su nombre completo ("Notas › Ideas"). Las privadas van al final. */
export function folderOptions(carpetas: Carpeta[]) {
  const byOrder = (a: Carpeta, b: Carpeta) => Number(!!a.privada) - Number(!!b.privada) || a.orden - b.orden;
  return carpetas
    .filter((c) => !c.parent)
    .sort(byOrder)
    .flatMap((t) => [t, ...carpetas.filter((c) => c.parent === t.id).sort(byOrder)])
    .map((c) => ({ id: c.id, label: c.parent ? `${carpetas.find((p) => p.id === c.parent)?.name} › ${c.name}` : c.name }));
}
