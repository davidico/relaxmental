"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import type { Carpeta } from "@/lib/types";

const byOrder = (a: Carpeta, b: Carpeta) => Number(!!a.privada) - Number(!!b.privada) || a.orden - b.orden || a.name.localeCompare(b.name);

/** El ícono de etiqueta (como en Google Keep) */
export const IconoEtiqueta = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h9.2a2 2 0 0 1 1.5.7l3.3 4.3a1.6 1.6 0 0 1 0 2l-3.3 4.3a2 2 0 0 1-1.5.7H6.5A2.5 2.5 0 0 1 4 14.5z" /></svg>
);

/**
 * La etiqueta de una nota, como en Google Keep: una cajita debajo de la nota con el nombre de su carpeta.
 * Al tocarla se abre una hoja para elegir otra (cada nota tiene una sola etiqueta: su carpeta).
 */
export default function Etiqueta({ folder, onChange }: { folder: string; onChange: (id: string) => void }) {
  const { carpetas } = useData();
  const [abierta, setAbierta] = useState(false);
  const c = carpetas.find((x) => x.id === folder);
  return (
    <>
      <button type="button" className="et-chip" aria-haspopup="dialog" aria-label={`Etiqueta: ${c?.name ?? "Notas"}. Cambiar`} onClick={() => setAbierta(true)}>
        {c?.name ?? "Notas"}
      </button>
      {abierta && <ElegirEtiqueta folder={folder} onClose={() => setAbierta(false)} onChange={(id) => { onChange(id); setAbierta(false); }} />}
    </>
  );
}

function ElegirEtiqueta({ folder, onChange, onClose }: { folder: string; onChange: (id: string) => void; onClose: () => void }) {
  const { carpetas } = useData();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [onClose]);
  const secciones = carpetas.filter((c) => !c.parent).sort(byOrder);
  const fila = (c: Carpeta, hija: boolean, i: number) => (
    <button key={c.id} type="button" role="menuitemradio" aria-checked={c.id === folder} autoFocus={c.id === folder || (i === 0 && !carpetas.some((x) => x.id === folder))} className={hija ? "et-op hija" : "et-op"} onClick={() => onChange(c.id)}>
      <IconoEtiqueta />
      <span>{c.name}</span>
      {c.id === folder && <svg className="ke-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
    </button>
  );
  let i = 0;
  return (
    <div className="modal et-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet et-sheet" role="dialog" aria-modal="true" aria-labelledby="et-h">
        <h2 id="et-h" className="et-h">Etiqueta</h2>
        <div role="menu" aria-labelledby="et-h" className="et-lista">
          {secciones.map((s) => [fila(s, false, i++), ...carpetas.filter((c) => c.parent === s.id).sort(byOrder).map((c) => fila(c, true, i++))])}
        </div>
        <div className="et-pie">
          <button type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
