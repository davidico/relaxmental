"use client";

import { useEffect, useRef, useState } from "react";
import { useData, newId } from "@/lib/data";
import { fdate } from "@/lib/dates";
import type { ItemLista, Nota } from "@/lib/types";
import RichEditor, { RichView } from "./RichEditor";
import VoiceButton from "./VoiceButton";
import { folderOptions } from "@/lib/folders";
import { appendParas, suggestTitle } from "@/lib/voice";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textOf = (n: Pick<Nota, "tipo" | "items" | "text">) =>
  n.tipo === "lista" ? (n.items ?? []).map((i) => i.t).join("\n") : n.text;

/**
 * Una nota a pantalla completa.
 * - Lectura (por defecto): título, fecha y texto. Deslizar o las flechas pasan a la anterior/siguiente.
 *   «Editar» a la derecha. En una lista se pueden marcar casillas sin entrar a editar.
 * - Edición: título, texto o lista, carpeta y dictado.
 */
export default function NoteView({
  list,
  index,
  onIndex,
  onClose,
  nueva,
}: {
  list: Nota[];
  index: number;
  onIndex?: (i: number) => void;
  onClose: () => void;
  /** Crear una nota nueva en esta carpeta, del tipo indicado */
  nueva?: { folder: string; tipo: "texto" | "lista" };
}) {
  const { save, remove, carpetas } = useData();
  const note = nueva ? null : list[index];
  const [editing, setEditing] = useState(!!nueva);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const go = (d: number) => {
    const i = index + d;
    if (!onIndex || i < 0 || i >= list.length) return;
    setMenu(false);
    setConfirm(false);
    onIndex(i);
    box.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") (editing && !nueva ? setEditing(false) : onClose());
      if (editing) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  });

  if (editing) return <NoteEdit key={note?.id ?? "nueva"} note={note} nueva={nueva} onDone={() => (nueva ? onClose() : setEditing(false))} />;
  if (!note) return null;

  const folder = carpetas.find((c) => c.id === note.folder);
  const parent = folder?.parent ? carpetas.find((c) => c.id === folder.parent) : undefined;
  const toggle = (it: ItemLista) =>
    save("notas", { ...note, items: (note.items ?? []).map((x) => (x.id === it.id ? { ...x, ok: !x.ok } : x)), updated: new Date().toISOString() });
  const pend = (note.items ?? []).filter((i) => !i.ok);
  const hechas = (note.items ?? []).filter((i) => i.ok);

  return (
    <div className="nv" role="dialog" aria-modal="true" aria-labelledby="nv-title">
      <div className="nv-bar">
        <button className="nv-ib" aria-label="Volver" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        {list.length > 1 && <span className="nv-count">{index + 1} de {list.length}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn sm nv-edit" onClick={() => setEditing(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
          Editar
        </button>
        <div className="nv-more">
          <button className="nv-ib" aria-label="Más opciones" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" autoFocus className="danger" onClick={() => { setMenu(false); setConfirm(true); }}>Borrar nota</button>
            </div>
          )}
        </div>
      </div>

      <div
        className="nv-body"
        ref={box}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <article className="nv-paper">
          {confirm && (
            <div className="confirm">
              ¿Borrar esta nota?
              <button className="btn sm warn" onClick={() => { remove("notas", note.id); setConfirm(false); if (list.length > 1 && onIndex) onIndex(Math.min(index, list.length - 2)); else onClose(); }}>Borrar</button>
              <button className="btn sm ghost" onClick={() => setConfirm(false)}>No</button>
            </div>
          )}
          <h1 id="nv-title" className="nv-title">{note.title || (note.tipo === "lista" ? "Lista" : "Sin título")}</h1>
          <p className="nv-date">
            {note.created && fdate(note.created)}
            {folder && <span> · {parent ? `${parent.name} › ` : ""}{folder.name}</span>}
          </p>
          {note.tipo === "lista" ? (
            <div className="nv-list">
              {pend.map((it) => (
                <label key={it.id} className="nv-item">
                  <input type="checkbox" checked={false} onChange={() => toggle(it)} />
                  <span>{it.t}</span>
                </label>
              ))}
              {hechas.length > 0 && (
                <>
                  <p className="nv-done">{hechas.length} {hechas.length === 1 ? "hecha" : "hechas"}</p>
                  {hechas.map((it) => (
                    <label key={it.id} className="nv-item ok">
                      <input type="checkbox" checked onChange={() => toggle(it)} />
                      <span>{it.t}</span>
                    </label>
                  ))}
                </>
              )}
              {!note.items?.length && <p className="nv-empty">Lista vacía. Toca «Editar» para añadir.</p>}
            </div>
          ) : (
            <RichView html={note.html} text={note.text} className="nv-text" />
          )}
        </article>
      </div>

      {list.length > 1 && (
        <div className="nv-nav">
          <button className="btn ghost" onClick={() => go(-1)} disabled={index === 0} aria-label="Nota anterior">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg> Anterior
          </button>
          <button className="btn ghost" onClick={() => go(1)} disabled={index >= list.length - 1} aria-label="Nota siguiente">
            Siguiente <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Editar (o crear) una nota, como Google Keep: una hoja limpia con «Título» y «Nota».
 * Las opciones están arriba a la derecha. Al volver (←) se guarda sola.
 */
function NoteEdit({ note, nueva, onDone }: { note: Nota | null; nueva?: { folder: string; tipo: "texto" | "lista" }; onDone: () => void }) {
  const { save, carpetas } = useData();
  const inicial = useRef<string>("");
  const [d, setD] = useState(() => {
    const v = {
      title: note?.title ?? "",
      folder: note?.folder ?? nueva?.folder ?? "notas",
      tipo: (note?.tipo ?? nueva?.tipo ?? "texto") as "texto" | "lista",
      html: note?.html ?? (note?.text ? `<p>${esc(note.text).replace(/\n/g, "<br>")}</p>` : ""),
      text: note?.text ?? "",
      items: note?.items?.length ? note.items : [{ id: newId(), t: "", ok: false }],
    };
    inicial.current = JSON.stringify(v);
    return v;
  });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<"" | "carpeta" | "mas">("");
  const [formato, setFormato] = useState(false);
  const items = d.items.filter((i) => i.t.trim());
  const vacia = d.tipo === "lista" ? !items.length && !d.title.trim() : !d.text.trim() && !d.title.trim();
  const opciones = folderOptions(carpetas);
  const carpeta = opciones.find((o) => o.id === d.folder)?.label ?? "Notas";

  const setTipo = () => {
    if (d.tipo === "texto") {
      const lines = d.text.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
      setD({ ...d, tipo: "lista", items: lines.length ? lines.map((t) => ({ id: newId(), t, ok: false })) : d.items });
    } else {
      const text = d.items.map((i) => i.t).filter(Boolean).join("\n");
      setD({ ...d, tipo: "texto", text, html: text ? text.split("\n").map((l) => `<p>${esc(l)}</p>`).join("") : "" });
    }
  };
  const setItem = (id: string, t: string) => setD((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? { ...i, t } : i)) }));
  const addItem = (after?: string, t = "") => {
    const it = { id: newId(), t, ok: false };
    setD((x) => {
      const i = after ? x.items.findIndex((y) => y.id === after) : x.items.length - 1;
      const next = [...x.items];
      next.splice(i + 1, 0, it);
      return { ...x, items: next };
    });
    setFocusId(it.id);
  };
  const delItem = (id: string) => setD((x) => ({ ...x, items: x.items.length > 1 ? x.items.filter((i) => i.id !== id) : [{ ...x.items[0], t: "" }] }));

  /* Volver = guardar (si hay algo y cambió) */
  const volver = () => {
    const cambio = JSON.stringify(d) !== inicial.current;
    if (!vacia && cambio) {
      const base: Nota = note ?? { id: newId(), kind: "nota", title: "", text: "", ref: "", created: new Date().toISOString() };
      const lista = d.tipo === "lista";
      save("notas", {
        ...base,
        title: d.title.trim(),
        folder: d.folder,
        tipo: d.tipo,
        items: lista ? items : undefined,
        html: lista ? undefined : d.html,
        text: lista ? textOf({ tipo: "lista", items, text: "" }) : d.text.trim(),
        updated: new Date().toISOString(),
      });
    }
    onDone();
  };

  return (
    <div className="nv ke" role="dialog" aria-modal="true" aria-label={note ? "Editar nota" : "Nueva nota"}>
      <div className="nv-bar ke-bar">
        <button className="nv-ib ke-ib" aria-label={vacia ? "Volver" : "Guardar y volver"} onClick={volver}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <span style={{ flex: 1 }} />
        {d.tipo === "texto" && (
          <button className="nv-ib ke-ib" aria-label="Formato" title="Formato" aria-pressed={formato} onClick={() => setFormato(!formato)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14M8 16l4-11 4 11M9.5 12h5" /></svg>
          </button>
        )}
        <button className="nv-ib ke-ib" aria-label={d.tipo === "lista" ? "Cambiar a texto" : "Cambiar a lista"} title={d.tipo === "lista" ? "Texto" : "Lista"} onClick={setTipo}>
          {d.tipo === "lista" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12l3 3 5-6" /></svg>
          )}
        </button>
        <VoiceButton
          compact
          onText={(p) =>
            d.tipo === "lista"
              ? setD((x) => ({ ...x, items: [...x.items.filter((i) => i.t.trim()), ...p.map((t) => ({ id: newId(), t, ok: false }))] }))
              : setD((x) => ({ ...x, ...appendParas(x.html, x.text, p) }))
          }
          onTitle={async (t) => {
            if (d.title.trim()) return;
            const title = await suggestTitle(t);
            if (title) setD((x) => (x.title.trim() ? x : { ...x, title }));
          }}
        />
        <div className="nv-more">
          <button className="nv-ib ke-ib" aria-label="Carpeta" title="Carpeta" aria-haspopup="menu" aria-expanded={menu === "carpeta"} onClick={() => setMenu(menu === "carpeta" ? "" : "carpeta")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          </button>
          {menu === "carpeta" && (
            <>
              <div className="dial-backdrop clear" onClick={() => setMenu("")} />
              <div className="menu ke-menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setMenu("")}>
                <p className="k-menulabel">Guardar en</p>
                {opciones.map((o, i) => (
                  <button key={o.id} role="menuitemradio" aria-checked={o.id === d.folder} autoFocus={o.id === d.folder || (i === 0 && !opciones.some((x) => x.id === d.folder))} onClick={() => { setD({ ...d, folder: o.id }); setMenu(""); }}>
                    <span>{o.label}</span>
                    {o.id === d.folder && <svg className="ke-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="nv-more">
          <button className="nv-ib ke-ib" aria-label="Más opciones" aria-haspopup="menu" aria-expanded={menu === "mas"} onClick={() => setMenu(menu === "mas" ? "" : "mas")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
          </button>
          {menu === "mas" && (
            <>
              <div className="dial-backdrop clear" onClick={() => setMenu("")} />
              <div className="menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setMenu("")}>
                <button role="menuitem" autoFocus onClick={onDone}>{note ? "Descartar cambios" : "Descartar nota"}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="nv-body">
        <div className="nv-paper ke-paper">
          <label htmlFor="ne-title" className="sr-only">Título</label>
          <input id="ne-title" className="ke-title" placeholder="Título" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          <p className="ke-where">En {carpeta}</p>
          {d.tipo === "texto" ? (
            <RichEditor id="ne-text" big bare tools={formato} autoFocus={!note} value={d.html} placeholder="Nota" onChange={(html, text) => setD((x) => ({ ...x, html, text }))} onSubmit={volver} />
          ) : (
            <ul className="ne-list" aria-label="Elementos de la lista">
              {d.items.map((it, i) => (
                <li key={it.id}>
                  <span className="ne-box" aria-hidden="true" />
                  <label htmlFor={`ne-i-${it.id}`} className="sr-only">Elemento {i + 1}</label>
                  <input
                    id={`ne-i-${it.id}`}
                    value={it.t}
                    placeholder="Elemento"
                    autoFocus={focusId === it.id || (!note && i === 0)}
                    enterKeyHint="next"
                    onChange={(e) => setItem(it.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addItem(it.id);
                      } else if (e.key === "Backspace" && !it.t && d.items.length > 1) {
                        e.preventDefault();
                        delItem(it.id);
                      }
                    }}
                  />
                  <button type="button" className="nv-ib sm" aria-label={`Quitar ${it.t || "elemento"}`} onClick={() => delItem(it.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="linkbtn ne-add" onClick={() => addItem()}>+ Añadir elemento</button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
