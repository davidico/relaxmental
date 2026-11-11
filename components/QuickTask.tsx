"use client";

import { useEffect, useState } from "react";
import { useData, newId } from "@/lib/data";
import { today } from "@/lib/dates";
import { useWide } from "@/lib/hooks";
import type { Carpeta } from "@/lib/types";
import { DueChoice } from "./ui";
import RichEditor from "./RichEditor";
import VoiceButton from "./VoiceButton";
import { appendParas, suggestTitle } from "@/lib/voice";

/** Carpetas en orden de árbol, con su nombre completo ("Notas › Ideas") */
export function folderOptions(carpetas: Carpeta[]) {
  const byOrder = (a: Carpeta, b: Carpeta) => a.orden - b.orden;
  return carpetas
    .filter((c) => !c.parent)
    .sort(byOrder)
    .flatMap((t) => [t, ...carpetas.filter((c) => c.parent === t.id).sort(byOrder)])
    .map((c) => ({ id: c.id, label: c.parent ? `${carpetas.find((p) => p.id === c.parent)?.name} › ${c.name}` : c.name }));
}

type Mode = "task" | "note" | null;

/**
 * Botón flotante.
 * - Escritorio: "+ Nueva tarea" (la captura de notas está en el panel).
 * - Móvil: "+" que abre dos opciones: Nueva tarea / Nueva nota.
 */
export default function QuickTask() {
  const { save, carpetas } = useData();
  const wide = useWide();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({ title: "", step: "", due: today() });
  const [n, setN] = useState({ folder: "ideas", title: "", html: "", text: "" });

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

      {mode && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qt-title" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="sheet" style={{ maxWidth: 560 }}>
            <div className="sheet-head">
              <h2 id="qt-title" className="sheet-title">{mode === "task" ? "Nueva tarea" : "Nueva nota"}</h2>
              <button className="x" aria-label="Cerrar" onClick={close}>✕</button>
            </div>
            {mode === "task" ? (
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
            ) : (
              <form
                className="add sheet-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!n.text.trim()) return;
                  save("notas", { id: newId(), folder: n.folder, kind: "nota", title: n.title.trim(), html: n.html, text: n.text.trim(), ref: "", created: new Date().toISOString() });
                  setN({ ...n, title: "", html: "", text: "" });
                  setDone(true);
                }}
              >
                <select id="qn-folder" aria-label="Carpeta" value={n.folder} onChange={(e) => setN({ ...n, folder: e.target.value })}>
                  {folderOptions(carpetas).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <input id="qn-title" placeholder="Título (opcional)" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
                <RichEditor id="qn-text" big autoFocus value={n.html} placeholder="Una idea, una profecía, un sueño… (# título, - lista, [] casilla)" onChange={(html, text) => { setN((x) => ({ ...x, html, text })); setDone(false); }} />
                <VoiceButton
                  onText={(p) => { setN((x) => ({ ...x, ...appendParas(x.html, x.text, p) })); setDone(false); }}
                  onTitle={async (t) => {
                    const title = await suggestTitle(t);
                    if (title) setN((x) => (x.title.trim() ? x : { ...x, title }));
                  }}
                />
                <div className="row" style={{ alignItems: "center" }}>
                  <button className="btn" type="submit" style={{ flex: "none" }} disabled={!n.text.trim()}>Guardar nota</button>
                  {done && <span className="saved" role="status">Guardada ✓</span>}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
