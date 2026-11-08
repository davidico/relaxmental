"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { fdate } from "@/lib/dates";
import type { Nota } from "@/lib/types";
import RichEditor from "./RichEditor";
import { folderOptions } from "./QuickTask";

/** Abrir una entrada del cerebro para leerla y editarla */
export default function NoteSheet({ note, onClose }: { note: Nota; onClose: () => void }) {
  const { save, carpetas } = useData();
  const [d, setD] = useState({
    title: note.title,
    folder: note.folder ?? "general",
    ref: note.ref,
    html: note.html ?? (note.text ? `<p>${note.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>` : ""),
    text: note.text,
  });
  const dirty = d.title !== note.title || d.folder !== (note.folder ?? "general") || d.ref !== note.ref || d.text !== note.text || (d.html !== (note.html ?? "") && !!note.html);

  const commit = () => {
    if (!d.text.trim()) return;
    save("notas", { ...note, title: d.title.trim(), folder: d.folder, ref: d.ref.trim(), html: d.html, text: d.text.trim() });
    onClose();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ns-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet notesheet">
        <div className="sheet-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <input id="ns-title" className="ns-title" placeholder="Sin título" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
            <p className="sub" style={{ margin: "2px 0 0" }}>Creada el {fdate(note.created)}</p>
          </div>
          <button className="x" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <div className="row">
            <select id="ns-folder" aria-label="Carpeta" value={d.folder} onChange={(e) => setD({ ...d, folder: e.target.value })}>
              {folderOptions(carpetas).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <input id="ns-ref" placeholder="Pasaje o referencia (opcional)" value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} />
          </div>
          <RichEditor id="ns-text" big value={d.html} onChange={(html, text) => setD((x) => ({ ...x, html, text }))} onSubmit={commit} />
        </div>
        <div className="sheet-foot">
          {!d.text.trim() && <span className="ed-warn" role="status">La entrada no puede quedar vacía.</span>}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onClose}>{dirty ? "Descartar" : "Cerrar"}</button>
          <button className="btn" onClick={commit} disabled={!d.text.trim()}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}
