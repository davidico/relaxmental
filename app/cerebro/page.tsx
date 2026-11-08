"use client";

import { useEffect, useMemo, useState } from "react";
import { useData, newId } from "@/lib/data";
import { fdate } from "@/lib/dates";
import { areaColor, type Area, type Carpeta, type Nota } from "@/lib/types";
import { cssC } from "@/components/ui";
import RichEditor, { RichView } from "@/components/RichEditor";
import NoteSheet from "@/components/NoteSheet";

const COLORS: Area[] = ["iglesia", "tukuna", "trabajo", "familia", "salud", "aleman", "casa"];
const byOrder = (a: Carpeta, b: Carpeta) => a.orden - b.orden || a.name.localeCompare(b.name);

/** Carpeta seleccionada en la dirección: /cerebro#ideas (vacío = todo) */
function useHashFolder() {
  const [sel, setSel] = useState("");
  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      setSel(h === "todo" ? "" : h);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const go = (id: string) => {
    location.hash = id;
    if (!id) history.replaceState(null, "", location.pathname);
    setSel(id);
  };
  return [sel, go] as const;
}

export default function Cerebro() {
  const { notas, carpetas, save, remove } = useData();
  const [sel, go] = useHashFolder();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", html: "", text: "", ref: "" });
  const [opened, setOpened] = useState<Nota | null>(null);
  const [folderForm, setFolderForm] = useState<{ mode: "new" | "sub" | "rename"; name: string } | null>(null);

  const byId = useMemo(() => Object.fromEntries(carpetas.map((c) => [c.id, c])), [carpetas]);
  const tops = carpetas.filter((c) => !c.parent).sort(byOrder);
  const kids = (id: string) => carpetas.filter((c) => c.parent === id).sort(byOrder);
  const current = sel ? byId[sel] : undefined;
  const top = current ? (current.parent ? byId[current.parent] : current) : undefined;
  const subtree = (id: string): string[] => [id, ...kids(id).flatMap((k) => subtree(k.id))];
  const inSel = useMemo(() => (current ? new Set(subtree(current.id)) : null), [current, carpetas]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (id: string) => {
    const ids = new Set(subtree(id));
    return notas.filter((n) => n.folder && ids.has(n.folder)).length;
  };
  const path = (c?: Carpeta) => (c ? (c.parent && byId[c.parent] ? `${byId[c.parent].name} › ${c.name}` : c.name) : "Todo");
  /* Dónde se guarda una entrada nueva: la carpeta abierta; si es una principal con subcarpetas, su primera subcarpeta; si no hay ninguna, General */
  const target = current?.id ?? "";

  const ql = q.toLowerCase();
  const list = notas
    .filter((n) => (!inSel || (n.folder && inSel.has(n.folder))) && (!ql || [n.title, n.text, n.ref].join(" ").toLowerCase().includes(ql)))
    .sort((a, b) => (b.created < a.created ? -1 : 1));

  const colorOf = (id?: string): Area => {
    const c = id ? byId[id] : undefined;
    if (!c) return "casa";
    return c.parent && byId[c.parent] ? byId[c.parent].area : c.area;
  };

  const saveFolder = () => {
    if (!folderForm || !folderForm.name.trim()) return;
    const name = folderForm.name.trim();
    if (folderForm.mode === "rename" && current) save("carpetas", { ...current, name });
    else {
      const parent = folderForm.mode === "sub" && current ? (current.parent ?? current.id) : null;
      const siblings = carpetas.filter((c) => c.parent === parent);
      const c: Carpeta = {
        id: newId(),
        name,
        parent,
        area: parent ? (byId[parent]?.area ?? "casa") : COLORS[tops.length % COLORS.length],
        orden: siblings.length,
        created: new Date().toISOString(),
      };
      save("carpetas", c);
      go(c.id);
    }
    setFolderForm(null);
  };

  const addEntry = () => {
    if (!f.text.trim() || !target) return;
    const n: Nota = { id: newId(), folder: target, kind: "nota", title: f.title.trim(), html: f.html, text: f.text.trim(), ref: f.ref.trim(), created: new Date().toISOString() };
    save("notas", n);
    setF({ title: "", html: "", text: "", ref: "" });
  };

  const canDelete = current && count(current.id) === 0 && kids(current.id).length === 0;

  return (
    <>
      <h1>Segundo cerebro</h1>
      <p className="sub">Profecías, sueños, ideas, predicaciones… Sácalo de la cabeza y guárdalo en su carpeta.</p>

      {/* Móvil: carpetas como fichas */}
      <div className="seg fchips">
        <button aria-pressed={!sel} onClick={() => go("")}>Todo · {notas.length}</button>
        {tops.map((c) => (
          <button key={c.id} aria-pressed={top?.id === c.id} onClick={() => go(c.id)}>{c.name} · {count(c.id)}</button>
        ))}
      </div>
      {top && kids(top.id).length > 0 && (
        <div className="seg fchips sub">
          <button aria-pressed={sel === top.id} onClick={() => go(top.id)}>Todas</button>
          {kids(top.id).map((k) => (
            <button key={k.id} aria-pressed={sel === k.id} onClick={() => go(k.id)}>{k.name} · {count(k.id)}</button>
          ))}
        </div>
      )}

      <div className="brain">

        <div className="bmain">
          <div className="fhead">
            <h2 className="fpath" style={cssC(areaColor(colorOf(current?.id)))}>{path(current)}</h2>
            <div className="factions">
              <button className="linkbtn" onClick={() => setFolderForm({ mode: "new", name: "" })}>+ Nueva carpeta</button>
            {current && (
              <>
                <button className="linkbtn" onClick={() => setFolderForm({ mode: "sub", name: "" })}>+ Subcarpeta</button>
                <button className="linkbtn" onClick={() => setFolderForm({ mode: "rename", name: current.name })}>Renombrar</button>
                <button className="linkbtn" onClick={() => setConfirm(canDelete ? `folder:${current.id}` : "folder-busy")}>Borrar</button>
              </>
            )}
            </div>
          </div>

          {folderForm && (
            <form className="card add folderform" onSubmit={(e) => { e.preventDefault(); saveFolder(); }}>
              <label htmlFor="fold-name" className="flabel">
                {folderForm.mode === "rename" ? "Nuevo nombre" : folderForm.mode === "sub" ? `Nueva subcarpeta en ${current?.parent ? byId[current.parent]?.name : current?.name}` : "Nueva carpeta principal"}
              </label>
              <div className="row">
                <input id="fold-name" autoFocus placeholder="Ej. Visiones, Estudios bíblicos…" value={folderForm.name} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} />
                <div className="row" style={{ flex: "none" }}>
                  <button className="btn" type="submit">Guardar</button>
                  <button className="btn ghost" type="button" onClick={() => setFolderForm(null)}>Cancelar</button>
                </div>
              </div>
            </form>
          )}
          {confirm === "folder-busy" && (
            <div className="confirm">
              Para borrar una carpeta tiene que estar vacía (sin entradas ni subcarpetas).
              <button className="btn sm ghost" onClick={() => setConfirm(null)}>Entendido</button>
            </div>
          )}
          {current && confirm === `folder:${current.id}` && (
            <div className="confirm">
              ¿Borrar la carpeta «{current.name}»?
              <button className="btn sm warn" onClick={() => { remove("carpetas", current.id); setConfirm(null); go(current.parent ?? ""); }}>Borrar</button>
              <button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button>
            </div>
          )}

          {current ? (
            <div className="card">
              <form
                className="add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addEntry();
                }}
              >
                <input id="n-title" placeholder="Título (opcional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
                <RichEditor id="n-text" value={f.html} placeholder={`Nueva entrada en ${path(current)}… (# título, - lista, [] casilla)`} onChange={(html, text) => setF((x) => ({ ...x, html, text }))} onSubmit={addEntry} />
                <input id="n-ref" placeholder="Pasaje o referencia (opcional, ej. Juan 3:16)" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} />
                <div>
                  <button className="btn" type="submit" disabled={!f.text.trim()}>Guardar en {current.name}</button>
                  <span className="kbd">Ctrl + Enter</span>
                </div>
              </form>
            </div>
          ) : (
            <p className="hint">Para escribir, entra en una carpeta desde el menú{" "}<span className="only-mobile">de arriba</span>.</p>
          )}

          <div className="row" style={{ alignItems: "center", margin: "18px 0 10px" }}>
            <h2 style={{ margin: 0, flex: "1 1 auto" }}>{list.length} entrada{list.length === 1 ? "" : "s"}</h2>
            <input id="q" type="search" placeholder="Buscar en todo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 220px" }} />
          </div>

          <div className="notes">
            {list.length ? (
              list.map((n) => {
                const fc = n.folder ? byId[n.folder] : undefined;
                return (
                  <div className="note" key={n.id}>
                    <div className="nm">
                      <div className="meta" style={{ marginTop: 0 }}>
                        <span className="chip" style={cssC(areaColor(colorOf(n.folder)))}>{fc ? path(fc) : "Sin carpeta"}</span>
                        {n.created && <small>{fdate(n.created)}</small>}
                      </div>
                      {n.title && <div className="nt">{n.title}</div>}
                      {n.ref && <div className="ref">{n.ref}</div>}
                      <button className="nbody" onClick={() => setOpened(n)} aria-label={`Abrir ${n.title || "entrada"}`}>
                        <RichView html={n.html} text={n.text} className="clamp" />
                      </button>
                      <div className="nmove">
                        <button className="btn ghost sm" onClick={() => setOpened(n)}>Abrir</button>
                        <label htmlFor={`mv-${n.id}`}>Mover a</label>
                        <select id={`mv-${n.id}`} value={n.folder ?? ""} onChange={(e) => save("notas", { ...n, folder: e.target.value })}>
                          {tops.flatMap((t) => [t, ...kids(t.id)]).map((c) => (
                            <option key={c.id} value={c.id}>{path(c)}</option>
                          ))}
                        </select>
                      </div>
                      {confirm === n.id && (
                        <div className="confirm">
                          ¿Borrar esta entrada?
                          <button className="btn sm warn" onClick={() => { remove("notas", n.id); setConfirm(null); }}>Borrar</button>
                          <button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button>
                        </div>
                      )}
                    </div>
                    <button className="x" aria-label="Borrar" onClick={() => setConfirm(n.id)}>✕</button>
                  </div>
                );
              })
            ) : (
              <div className="card empty">{q ? "Nada coincide con tu búsqueda." : current ? "Esta carpeta está vacía. Escribe la primera entrada arriba." : "Todavía no hay entradas."}</div>
            )}
          </div>
        </div>
      </div>
      {opened && <NoteSheet key={opened.id} note={opened} onClose={() => setOpened(null)} />}
    </>
  );
}
