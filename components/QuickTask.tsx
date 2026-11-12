"use client";

import { useEffect, useState } from "react";
import { useData, newId } from "@/lib/data";
import { today } from "@/lib/dates";
import { useWide } from "@/lib/hooks";
import { DueChoice } from "./ui";
import NoteView from "./NoteView";

type Mode = "task" | "note" | null;

/**
 * Botón flotante.
 * - Escritorio: "+ Nueva tarea" (la captura de notas está en el panel).
 * - Móvil: "+" que abre dos opciones: Nueva tarea / Nueva nota.
 */
export default function QuickTask() {
  const { save, hoy } = useData();
  const wide = useWide();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({ title: "", step: "", due: today() });
  /* Si la app quedó abierta pasada la medianoche, "hoy" pasa al día nuevo */
  useEffect(() => setF((x) => (x.due && x.due < hoy ? { ...x, due: hoy } : x)), [hoy]);

  useEffect(() => {
    if (!mode && !menu) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(null);
        setMenu(false);
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [mode, menu]);

  const open = (m: Mode) => {
    setMenu(false);
    setDone(false);
    setMode(m);
  };
  const close = () => setMode(null);

  /* Otras pantallas (p. ej. Hoy en escritorio) pueden abrir "Nueva tarea" con un evento */
  useEffect(() => {
    const h = () => open("task");
    addEventListener("mi-semana:nueva-tarea", h);
    return () => removeEventListener("mi-semana:nueva-tarea", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {wide ? (
        <button className="fab" onClick={() => open("task")} aria-label="Nueva tarea">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> Nueva tarea
        </button>
      ) : (
        <>
          {menu && <div className="dial-backdrop" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="dial" role="menu">
              <button role="menuitem" onClick={() => open("note")}>
                <span className="dial-ico" aria-hidden="true">✎</span> Nueva nota
              </button>
              <button role="menuitem" onClick={() => open("task")}>
                <span className="dial-ico" aria-hidden="true">✓</span> Nueva tarea
              </button>
            </div>
          )}
          <button className={`fab round${menu ? " open" : ""}`} onClick={() => setMenu(!menu)} aria-label={menu ? "Cerrar" : "Añadir"} aria-expanded={menu}>
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </>
      )}

      {mode === "note" && <NoteView list={[]} index={0} nueva={{ folder: "notas", tipo: "texto" }} onClose={close} />}
      {mode === "task" && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qt-title" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="sheet" style={{ maxWidth: 560 }}>
            <div className="sheet-head">
              <h2 id="qt-title" className="sheet-title">Nueva tarea</h2>
              <button className="x" aria-label="Cerrar" onClick={close}>✕</button>
            </div>
              <form
                className="add sheet-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!f.title.trim()) return;
                  save("tareas", { id: newId(), title: f.title.trim(), step: f.step.trim(), due: f.due, done: false, created: new Date().toISOString() });
                  setF({ ...f, title: "", step: "" });
                  setDone(true);
                }}
              >
                <input id="qt-name" autoFocus required placeholder="Qué hay que hacer" value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setDone(false); }} />
                <input id="qt-step" placeholder="Primer paso de 2 minutos (opcional)" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })} />
                <DueChoice id="qt-due" value={f.due} onChange={(due) => setF({ ...f, due })} />
                <div className="row" style={{ alignItems: "center" }}>
                  <button className="btn" type="submit" style={{ flex: "none" }}>Guardar tarea</button>
                  {done && <span className="saved" role="status">Guardada ✓ Puedes añadir otra.</span>}
                </div>
              </form>
          </div>
        </div>
      )}
    </>
  );
}
