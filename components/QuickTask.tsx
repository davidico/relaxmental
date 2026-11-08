"use client";

import { useEffect, useState } from "react";
import { useData, newId } from "@/lib/data";
import { AREAS, type Area } from "@/lib/types";

/** Botón flotante "+ Nueva tarea" y su ventana, disponible en todas las pantallas */
export default function QuickTask() {
  const { save } = useData();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({ title: "", step: "", area: "trabajo" as Area, due: "" });

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open]);

  return (
    <>
      <button className="fab" onClick={() => { setOpen(true); setDone(false); }} aria-label="Nueva tarea">
        <span aria-hidden="true">+</span> Nueva tarea
      </button>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qt-title" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" style={{ maxWidth: 560 }}>
            <div className="sheet-head">
              <h2 id="qt-title" className="sheet-title">Nueva tarea</h2>
              <button className="x" aria-label="Cerrar" onClick={() => setOpen(false)}>✕</button>
            </div>
            <form
              className="add"
              style={{ padding: "12px max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))" }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!f.title.trim()) return;
                save("tareas", { id: newId(), title: f.title.trim(), step: f.step.trim(), area: f.area, due: f.due, done: false, created: new Date().toISOString() });
                setF({ ...f, title: "", step: "", due: "" });
                setDone(true);
              }}
            >
              <input id="qt-name" autoFocus required placeholder="Qué hay que hacer (ej. Enviar candidatura)" value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setDone(false); }} />
              <input id="qt-step" placeholder="Primer paso de 2 minutos (ej. Abrir la oferta)" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })} />
              <div className="row">
                <select id="qt-area" aria-label="Área" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as Area })}>
                  {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input id="qt-due" type="date" aria-label="Fecha" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
              </div>
              <div className="row" style={{ alignItems: "center" }}>
                <button className="btn" type="submit" style={{ flex: "none" }}>Guardar tarea</button>
                {done && <span className="saved">Guardada ✓ Puedes añadir otra.</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
