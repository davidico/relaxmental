"use client";

import { useState } from "react";
import { useData, newId } from "@/lib/data";
import { fdate } from "@/lib/dates";
import { submitOnCtrlEnter } from "@/lib/hooks";
import { KINDS, areaColor, type Kind } from "@/lib/types";
import { cssC } from "@/components/ui";

export default function Cerebro() {
  const { notas, save, remove } = useData();
  const [filter, setFilter] = useState<Kind | "todo">("todo");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [f, setF] = useState({ kind: "idea" as Kind, title: "", text: "", ref: "" });

  const ql = q.toLowerCase();
  const list = notas
    .filter((n) => (filter === "todo" || n.kind === filter) && (!ql || [n.title, n.text, n.ref].join(" ").toLowerCase().includes(ql)))
    .sort((a, b) => (b.created < a.created ? -1 : 1));
  const count = (k: Kind) => notas.filter((n) => n.kind === k).length;

  return (
    <>
      <h1>Segundo cerebro</h1>
      <p className="sub">Ideas, profecías, predicaciones y notas. Sácalo de la cabeza y guárdalo aquí.</p>
      <div className="split">
        <div className="sticky">
          <h2>Nueva entrada</h2>
          <div className="card">
            <form
              className="add"
              onSubmit={(e) => {
                e.preventDefault();
                if (!f.text.trim()) return;
                save("notas", { id: newId(), kind: f.kind, title: f.title.trim(), text: f.text.trim(), ref: f.ref.trim(), created: new Date().toISOString() });
                setF({ ...f, title: "", text: "", ref: "" });
              }}
            >
              <div className="row">
                <select id="n-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input id="n-title" placeholder="Título (opcional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              </div>
              <textarea id="n-text" placeholder="Escribe aquí…" required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} onKeyDown={submitOnCtrlEnter} />
              <input id="n-ref" placeholder="Pasaje o referencia (ej. Juan 3:16)" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} />
              <div>
                <button className="btn" type="submit">Guardar</button>
                <span className="kbd">Ctrl + Enter</span>
              </div>
            </form>
          </div>
        </div>
        <div>
          <h2>{list.length} resultado{list.length === 1 ? "" : "s"}</h2>
          <div className="seg" role="group" aria-label="Filtrar">
            <button aria-pressed={filter === "todo"} onClick={() => setFilter("todo")}>Todo · {notas.length}</button>
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {KINDS[k].label}s · {count(k)}
              </button>
            ))}
          </div>
          <input id="q" type="search" placeholder="Buscar en todo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="notes">
            {list.length ? (
              list.map((n) => {
                const k = KINDS[n.kind] ?? KINDS.nota;
                return (
                  <div className="note" key={n.id}>
                    <div className="nm">
                      <div className="meta" style={{ marginTop: 0 }}>
                        <span className="chip" style={cssC(areaColor(k.area))}>{k.label}</span>
                        {n.created && <small>{fdate(n.created)}</small>}
                      </div>
                      {n.title && <div className="nt">{n.title}</div>}
                      {n.ref && <div className="ref">{n.ref}</div>}
                      <p>{n.text}</p>
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
              <div className="card empty">{q ? "Nada coincide con tu búsqueda." : "Todavía no hay nada aquí. Escribe tu primera entrada."}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
