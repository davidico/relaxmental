"use client";

import { useEffect, useRef, useState } from "react";
import { useData, newId } from "@/lib/data";
import { fdate } from "@/lib/dates";
import type { ItemLista, Nota } from "@/lib/types";
import TextoCrece from "./TextoCrece";
import RichEditor, { RichView } from "./RichEditor";
import VoiceButton from "./VoiceButton";
import Etiqueta from "./Etiqueta";
import { appendParas, suggestTitle } from "@/lib/voice";

/** Dónde se tocó la nota para editarla */
type Foco = { titulo?: number; texto?: number; item?: string };

/** Cuántas letras hay desde el principio de `caja` hasta el punto tocado (para poner el cursor ahí al editar) */
function letrasHasta(caja: Element, x: number, y: number): number | undefined {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let nodo: Node | null = null;
  let off = 0;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (p) [nodo, off] = [p.offsetNode, p.offset];
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) [nodo, off] = [r.startContainer, r.startOffset];
  }
  if (!nodo || !caja.contains(nodo)) return undefined;
  const r = document.createRange();
  r.setStart(caja, 0);
  r.setEnd(nodo, off);
  return r.toString().length;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textOf = (n: Pick<Nota, "tipo" | "items" | "text">) =>
  n.tipo === "lista" ? (n.items ?? []).map((i) => i.t).join("\n") : n.text;

/**
 * Una nota a pantalla completa.
 * - Lectura (por defecto): título, fecha y texto. Deslizar o las flechas pasan a la anterior/siguiente.
 *   «Editar» a la derecha. En una lista se pueden marcar casillas sin entrar a editar.
 * - Edición: título, texto o lista, etiqueta (su carpeta, en la cajita de abajo) y dictado.
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
  const { save, remove } = useData();
  const note = nueva ? null : list[index];
  const [editing, setEditing] = useState(!!nueva);
  /* Dónde se tocó la nota para editarla: en el título, en el texto (cuántas letras desde el principio) o en un elemento de la lista */
  const [foco, setFoco] = useState<Foco>({});
  const [confirm, setConfirm] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const go = (d: number) => {
    const i = index + d;
    if (!onIndex || i < 0 || i >= list.length) return;
    setConfirm(false);
    onIndex(i);
    box.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      /* Editando, Escape lo maneja el editor (guarda y cierra) */
      if (editing) return;
      if (e.key === "Escape") onClose();
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

  /* Como en Google Keep: al volver de editar se guarda y se cierra la nota */
  if (editing) return <NoteEdit key={note?.id ?? "nueva"} note={note} nueva={nueva} foco={foco} onDone={onClose} />;
  if (!note) return null;

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
        <button className="nv-ib nv-pin" aria-pressed={!!note.fijada} aria-label={note.fijada ? "Quitar de fijadas" : "Fijar arriba"} title={note.fijada ? "Quitar de fijadas" : "Fijar arriba"} onClick={() => save("notas", { ...note, fijada: !note.fijada })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v5" /></svg>
        </button>
        <button className="nv-ib nv-borrar" aria-label="Borrar nota" title="Borrar nota" onClick={() => setConfirm(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6" /></svg>
        </button>
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
        <article
          className="nv-paper nv-tocar"
          onClick={(e) => {
            /* Tocar en cualquier parte de la nota la abre para editar, con el cursor donde se tocó (menos en botones, casillas y enlaces) */
            const t = e.target as HTMLElement;
            if (t.closest("button, a, input, label, .confirm")) return;
            if (t.closest(".nv-title")) setFoco({ titulo: letrasHasta(t.closest(".nv-title")!, e.clientX, e.clientY) });
            else if (t.closest(".nv-item")) setFoco({ item: t.closest<HTMLElement>(".nv-item")!.dataset.id });
            else if (t.closest(".nv-text")) setFoco({ texto: letrasHasta(t.closest(".nv-text")!, e.clientX, e.clientY) });
            else setFoco({});
            setEditing(true);
          }}
        >
          {confirm && (
            <div className="confirm">
              ¿Borrar esta nota?
              <button className="btn sm warn" onClick={() => {
                /* Antes de borrar, se pasa a la nota vecina (la siguiente o, si era la última, la anterior) */
                const vecina = index + 1 < list.length ? index + 1 : index - 1;
                if (vecina >= 0 && onIndex) onIndex(vecina);
                else onClose();
                setConfirm(false);
                remove("notas", note.id);
              }}>Borrar</button>
              <button className="btn sm ghost" onClick={() => setConfirm(false)}>No</button>
            </div>
          )}
          <h1 id="nv-title" className="nv-title">{note.title || (note.tipo === "lista" ? "Lista" : "Sin título")}</h1>
          <p className="nv-date">
            {note.created && fdate(note.created)}
          </p>
          {note.tipo === "lista" ? (
            <div className="nv-list">
              {pend.map((it) => (
                <div key={it.id} className="nv-item" data-id={it.id}>
                  <label className="nv-ck"><input type="checkbox" checked={false} aria-label={`Marcar hecho: ${it.t}`} onChange={() => toggle(it)} /></label>
                  <span>{it.t}</span>
                </div>
              ))}
              {hechas.length > 0 && (
                <>
                  <p className="nv-done">{hechas.length} {hechas.length === 1 ? "hecha" : "hechas"}</p>
                  {hechas.map((it) => (
                    <div key={it.id} className="nv-item ok" data-id={it.id}>
                      <label className="nv-ck"><input type="checkbox" checked aria-label={`Desmarcar: ${it.t}`} onChange={() => toggle(it)} /></label>
                      <span>{it.t}</span>
                    </div>
                  ))}
                </>
              )}
              {!note.items?.length && <p className="nv-empty">Lista vacía. Toca aquí para añadir.</p>}
            </div>
          ) : (
            <RichView html={note.html} text={note.text} className="nv-text" />
          )}
          <div className="et-fila">
            <Etiqueta folder={note.folder ?? "notas"} onChange={(id) => save("notas", { ...note, folder: id, updated: new Date().toISOString() })} />
          </div>
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
function NoteEdit({ note, nueva, foco = {}, onDone }: { note: Nota | null; nueva?: { folder: string; tipo: "texto" | "lista" }; foco?: Foco; onDone: () => void }) {
  const { save, remove } = useData();
  const [confirm, setConfirm] = useState(false);
  const tituloRef = useRef<HTMLTextAreaElement>(null);
  /* Si se tocó el título, el cursor va ahí */
  useEffect(() => {
    if (foco.titulo === undefined || !tituloRef.current) return;
    tituloRef.current.focus();
    tituloRef.current.setSelectionRange(foco.titulo, foco.titulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const inicial = useRef<string>("");
  const [d, setD] = useState(() => {
    const v = {
      title: note?.title ?? "",
      folder: note?.folder ?? nueva?.folder ?? "notas",
      tipo: (note?.tipo ?? nueva?.tipo ?? "texto") as "texto" | "lista",
      html: note?.html ?? (note?.text ? `<p>${esc(note.text).replace(/\n/g, "<br>")}</p>` : ""),
      text: note?.text ?? "",
      items: note?.items?.length ? note.items : [{ id: newId(), t: "", ok: false }],
      fijada: !!note?.fijada,
    };
    inicial.current = JSON.stringify(v);
    return v;
  });
  const [focusId, setFocusId] = useState<string | null>(foco.item ?? null);
  const [formato, setFormato] = useState(false);
  const items = d.items.filter((i) => i.t.trim());
  const vacia = d.tipo === "lista" ? !items.length && !d.title.trim() : !d.text.trim() && !d.title.trim();

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
        fijada: d.fijada || undefined,
        tipo: d.tipo,
        items: lista ? items : undefined,
        html: lista ? undefined : d.html,
        text: lista ? textOf({ tipo: "lista", items, text: "" }) : d.text.trim(),
        updated: new Date().toISOString(),
      });
    }
    onDone();
  };  /* Escape = volver (guardando), salvo que haya una hoja o un aviso abiertos encima */
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".et-sheet, .wd") && volver();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });


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
        <button className="nv-ib ke-ib nv-pin" aria-pressed={d.fijada} aria-label={d.fijada ? "Quitar de fijadas" : "Fijar arriba"} title={d.fijada ? "Quitar de fijadas" : "Fijar arriba"} onClick={() => setD((x) => ({ ...x, fijada: !x.fijada }))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v5" /></svg>
        </button>
        {/* El basurero: una nota nueva se descarta; una que ya existía se borra (después de preguntar) */}
        <button className="nv-ib ke-ib nv-borrar" aria-label={note ? "Borrar nota" : "Descartar nota"} title={note ? "Borrar nota" : "Descartar nota"} onClick={() => (note ? setConfirm(true) : onDone())}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v6M14 11v6" /></svg>
        </button>
      </div>

      <div className="nv-body">
        <div className="nv-paper ke-paper">
          {confirm && note && (
            <div className="confirm">
              ¿Borrar esta nota?
              <button className="btn sm warn" onClick={() => { remove("notas", note.id); onDone(); }}>Borrar</button>
              <button className="btn sm ghost" onClick={() => setConfirm(false)}>No</button>
            </div>
          )}
          <label htmlFor="ne-title" className="sr-only">Título</label>
          <TextoCrece ref={tituloRef} id="ne-title" className="ke-title" placeholder="Título" value={d.title} onTexto={(title) => setD((x) => ({ ...x, title }))} />
          {d.tipo === "texto" ? (
            <RichEditor id="ne-text" big bare tools={formato} autoFocus={!note} foco={foco.titulo === undefined && foco.item === undefined ? (foco.texto ?? (note ? -1 : undefined)) : undefined} value={d.html} placeholder="Nota" onChange={(html, text) => setD((x) => ({ ...x, html, text }))} onSubmit={volver} />
          ) : (
            <ul className="ne-list" aria-label="Elementos de la lista">
              {d.items.map((it, i) => (
                <li key={it.id}>
                  <span className={`ne-box${it.ok ? " ok" : ""}`} aria-hidden="true" />
                  <label htmlFor={`ne-i-${it.id}`} className="sr-only">Elemento {i + 1}</label>
                  <TextoCrece
                    id={`ne-i-${it.id}`}
                    className={it.ok ? "ok" : undefined}
                    value={it.t}
                    placeholder="Elemento"
                    autoFocus={focusId === it.id || (!note && i === 0)}
                    enterKeyHint="next"
                    onTexto={(t) => setItem(it.id, t)}
                    onEnter={() => addItem(it.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !it.t && d.items.length > 1) {
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
          <div className="et-fila">
            <Etiqueta folder={d.folder} onChange={(folder) => setD((x) => ({ ...x, folder }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
