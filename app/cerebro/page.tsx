"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useData, newId } from "@/lib/data";
import { fdate } from "@/lib/dates";
import type { Area, Carpeta, Nota } from "@/lib/types";
import { RichView } from "@/components/RichEditor";
import NoteView from "@/components/NoteView";
import { IconoEtiqueta } from "@/components/Etiqueta";
import MapaNotas from "@/components/MapaNotas";

const COLORS: Area[] = ["iglesia", "tukuna", "trabajo", "familia", "salud", "aleman", "casa"];
const byOrder = (a: Carpeta, b: Carpeta) => a.orden - b.orden || a.name.localeCompare(b.name);

/** Sección y carpeta en la dirección: /cerebro#seccion o /cerebro#seccion/carpeta (vacío = Notas) */
function useHashSel() {
  const [sel, setSel] = useState({ sec: "notas", sub: "" });
  useEffect(() => {
    const read = () => {
      const [sec, sub] = decodeURIComponent(location.hash.slice(1)).split("/");
      setSel({ sec: sec && sec !== "todo" ? sec : "notas", sub: sub ?? "" });
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const go = (sec: string, sub = "") => {
    history.replaceState(null, "", `${location.pathname}#${sec}${sub ? `/${sub}` : ""}`);
    setSel({ sec, sub });
  };
  return [sel, go] as const;
}

const ORDEN = { nuevas: "Más recientes", viejas: "Más antiguas", az: "Por título (A–Z)" } as const;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return `${MESES[d.getMonth()][0].toUpperCase()}${MESES[d.getMonth()].slice(1)} ${d.getFullYear()}`;
};

function usePref<T extends string>(key: string, def: T) {
  const [v, setV] = useState<T>(def);
  useEffect(() => {
    try {
      const x = localStorage.getItem(key);
      if (x) setV(x as T);
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set] as const;
}

const Pin = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-label="Fijada" role="img"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v5" /></svg>
);
const Lock = () => (
  <svg className="k-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);

export default function Cerebro() {
  const { notas, carpetas, save, remove } = useData();
  const [sel, go] = useHashSel();
  const [q, setQ] = useState("");
  const [orden, setOrden] = usePref<"nuevas" | "viejas" | "az">("cerebro-orden", "nuevas");
  const [vista, setVista] = usePref<"grid" | "una">("cerebro-vista2", "grid");
  const [ordMenu, setOrdMenu] = useState(false);
  /* La nota abierta, por su id: si la lista cambia de orden (al fijarla), sigue siendo la misma nota */
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [mapa, setMapa] = useState(false);
  const [deMapa, setDeMapa] = useState<string | null>(null);
  const [nueva, setNueva] = useState<"texto" | "lista" | null>(null);
  const [secMenu, setSecMenu] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [form, setForm] = useState<{ mode: "seccion" | "carpeta" | "renombrar"; name: string; privada: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const byId = useMemo(() => Object.fromEntries(carpetas.map((c) => [c.id, c])), [carpetas]);
  const secciones = carpetas.filter((c) => !c.parent).sort(byOrder);
  const visibles = secciones.filter((c) => !c.privada);
  const privadas = secciones.filter((c) => c.privada);
  const h = byId[sel.sec];
  const sec = h ? (h.parent ? byId[h.parent] : h) : (byId.notas ?? visibles[0]);
  const kids = sec ? carpetas.filter((c) => c.parent === sec.id).sort(byOrder) : [];
  const subId = h?.parent ? h.id : sel.sub;
  const sub = subId && byId[subId]?.parent === sec?.id ? byId[subId] : undefined;
  const ids = new Set(sub ? [sub.id] : sec ? [sec.id, ...kids.map((k) => k.id)] : []);
  const count = (c: Carpeta) => notas.filter((n) => n.folder === c.id || byId[n.folder ?? ""]?.parent === c.id).length;

  const ql = q.toLowerCase();
  const list = notas
    .filter((n) => n.folder && ids.has(n.folder) && (!ql || [n.title, n.text, n.ref].join(" ").toLowerCase().includes(ql)))
    /* Las fijadas, siempre arriba; dentro de cada grupo, el orden elegido */
    .sort((a, b) =>
      !!a.fijada !== !!b.fijada
        ? Number(!!b.fijada) - Number(!!a.fijada)
        : orden === "az"
        ? (a.title || a.text).localeCompare(b.title || b.text, "es")
        : orden === "viejas"
          ? (a.created < b.created ? -1 : 1)
          : (b.created < a.created ? -1 : 1),
    );
  /* El nombre de la carpeta en la tarjeta solo hace falta si la lista mezcla carpetas */
  const mezcla = new Set(list.map((n) => n.folder)).size > 1;
  const hayFijadas = list.some((n) => n.fijada);
  const groups: { label: string; items: { n: Nota; i: number }[] }[] = [];
  list.forEach((n, i) => {
    /* Con notas fijadas hay dos grupos (como en Keep): «Fijadas» y las demás */
    const label = n.fijada ? "Fijadas" : vista === "grid" || orden === "az" || !n.created ? (hayFijadas ? "Otras" : "") : monthLabel(n.created); // en cuadros, todo seguido
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push({ n, i });
    else groups.push({ label, items: [{ n, i }] });
  });

  const abierta = abiertaId ? list.findIndex((n) => n.id === abiertaId) : -1;
  const setAbierta = (i: number | null) => setAbiertaId(i === null ? null : (list[i]?.id ?? null));

  const guardarForm = () => {
    if (!form || !form.name.trim() || !sec) return;
    const name = form.name.trim();
    if (form.mode === "renombrar") save("carpetas", sub ? { ...sub, name } : { ...sec, name, privada: form.privada });
    else if (form.mode === "seccion") {
      const c: Carpeta = { id: newId(), name, parent: null, privada: form.privada, area: COLORS[secciones.length % COLORS.length], orden: secciones.length, created: new Date().toISOString() };
      save("carpetas", c);
      go(c.id);
    } else {
      const c: Carpeta = { id: newId(), name, parent: sec.id, area: sec.area, orden: kids.length, created: new Date().toISOString() };
      save("carpetas", c);
      go(sec.id, c.id);
    }
    setForm(null);
  };
  const borrable = (c: Carpeta) => count(c) === 0 && !carpetas.some((x) => x.parent === c.id) && c.id !== "notas";

  if (!sec) return <div className="card empty">Cargando tus secciones…</div>;

  return (
    <>
      <div className="k-head">
        <div className="k-sec">
          <button className="nv-ib k-burger" aria-label="Secciones y etiquetas" aria-haspopup="dialog" aria-expanded={secMenu} onClick={() => setSecMenu(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <h1 className="k-titulo">{sub?.name ?? sec.name}</h1>
          {sec.privada && <Lock />}
        </div>
        <div className="k-actions">
          <div className="nv-more k-nueva">
            <button className="btn sm" aria-haspopup="menu" aria-expanded={newMenu} onClick={() => setNewMenu(!newMenu)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> Nueva
            </button>
            {newMenu && (
              <>
                <div className="dial-backdrop clear" onClick={() => setNewMenu(false)} />
                <div className="menu k-newmenu" role="menu" onKeyDown={(e) => e.key === "Escape" && setNewMenu(false)}>
                  <button role="menuitem" autoFocus onClick={() => { setNewMenu(false); setNueva("texto"); }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" /></svg> Nota de texto
                  </button>
                  <button role="menuitem" onClick={() => { setNewMenu(false); setNueva("lista"); }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12l3 3 5-6" /></svg> Lista
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {secMenu && createPortal(
        <div className="kd-fondo" onClick={(e) => e.target === e.currentTarget && setSecMenu(false)} onKeyDown={(e) => e.key === "Escape" && setSecMenu(false)}>
          <nav className="kd" aria-label="Secciones y etiquetas">
            <div className="kd-head">
              <p className="kd-marca">Cerebro</p>
              <button className="nv-ib" aria-label="Cerrar" onClick={() => setSecMenu(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {[...visibles, ...privadas].map((c, i) => {
              const hijas = carpetas.filter((x) => x.parent === c.id).sort(byOrder);
              const ir = (sub2 = "") => { setSecMenu(false); setQ(""); go(c.id, sub2); };
              return (
                <div key={c.id} className="kd-grupo">
                  {i === visibles.length && <p className="kd-lbl">Privadas</p>}
                  <button className="kd-fila" autoFocus={c.id === sec.id && !sub} aria-current={c.id === sec.id && !sub ? "page" : undefined} onClick={() => ir()}>
                    {c.privada ? <Lock /> : c.id === "notas" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>}
                    <span>{c.name}</span>
                    <small>{count(c)}</small>
                  </button>
                  {hijas.map((k) => (
                    <button key={k.id} className="kd-fila hija" autoFocus={sub?.id === k.id} aria-current={sub?.id === k.id ? "page" : undefined} onClick={() => ir(k.id)}>
                      <IconoEtiqueta />
                      <span>{k.name}</span>
                      <small>{count(k)}</small>
                    </button>
                  ))}
                </div>
              );
            })}
            <hr />
            <button className="kd-fila" onClick={() => { setSecMenu(false); setForm({ mode: "carpeta", name: "", privada: false }); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span>Nueva etiqueta en {sec.name}</span>
            </button>
            <button className="kd-fila" onClick={() => { setSecMenu(false); setForm({ mode: "seccion", name: "", privada: false }); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span>Nueva sección</span>
            </button>
            <hr />
            <button className="kd-fila" onClick={() => { setSecMenu(false); setForm({ mode: "renombrar", name: (sub ?? sec).name, privada: !!sec.privada }); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
              <span>Renombrar «{(sub ?? sec).name}»</span>
            </button>
            {(sub || sec.id !== "notas") && (
              <button className="kd-fila kd-borrar" onClick={() => { setSecMenu(false); const c = sub ?? sec; setConfirm(borrable(c) ? `c:${c.id}` : "ocupada"); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg>
                <span>Borrar «{(sub ?? sec).name}»</span>
              </button>
            )}
          </nav>
        </div>,
        document.body,
      )}
      <div className="k-dots" aria-hidden="true" />

      {form && (
        <form className="card pad k-form" onSubmit={(e) => { e.preventDefault(); guardarForm(); }}>
          <label htmlFor="k-name" className="flabel">
            {form.mode === "seccion" ? "Nombre de la nueva sección" : form.mode === "carpeta" ? `Nueva etiqueta en ${sec.name}` : sub ? "Nombre de la etiqueta" : "Nombre de la sección"}
          </label>
          <input id="k-name" autoFocus placeholder={form.mode === "carpeta" ? "Ej. Cosas por orar, Inspiración…" : "Ej. Espiritual, Trabajo…"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {form.mode !== "carpeta" && !(form.mode === "renombrar" && sub) && (
            <label className="k-check">
              <input type="checkbox" checked={form.privada} onChange={(e) => setForm({ ...form, privada: e.target.checked })} />
              <span>Privada: no se muestra al abrir Cerebro, solo desde el menú ☰</span>
            </label>
          )}
          <div className="row actions">
            <button className="btn" type="submit" disabled={!form.name.trim()}>Guardar</button>
            <button className="btn ghost" type="button" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {confirm === "ocupada" && (
        <div className="confirm">
          Para borrarla tiene que estar vacía (sin notas ni etiquetas).
          <button className="btn sm ghost" onClick={() => setConfirm(null)}>Entendido</button>
        </div>
      )}
      {confirm?.startsWith("c:") && (
        <div className="confirm">
          ¿Borrar «{byId[confirm.slice(2)]?.name}»?
          <button className="btn sm warn" onClick={() => { const id = confirm.slice(2); remove("carpetas", id); setConfirm(null); go(id === sec.id ? "notas" : sec.id); }}>Borrar</button>
          <button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button>
        </div>
      )}

      <div className="k-search">
        <svg className="k-sico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <label htmlFor="q" className="sr-only">Buscar en {sub?.name ?? sec.name}</label>
        <input id="q" type="search" placeholder={`Buscar en ${sub?.name ?? sec.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {/* La estrellita: la misma «Pregúntale a la IA» del botón + */}
        <button className="k-sbtn k-ia" aria-label="Pregúntale a la IA" title="Pregúntale a la IA" onClick={() => dispatchEvent(new CustomEvent("mi-semana:preguntar"))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4l1.7 4.6a2 2 0 0 0 1.2 1.2L18.5 11.5l-4.6 1.7a2 2 0 0 0-1.2 1.2L11 19l-1.7-4.6a2 2 0 0 0-1.2-1.2L3.5 11.5l4.6-1.7a2 2 0 0 0 1.2-1.2zM18.5 3.5v3M17 5h3M19 17v2.5M17.75 18.25h2.5" /></svg>
        </button>
        {/* El mapa de las notas: solo en pantallas anchas (es para verlo, por gusto) */}
        <button className="k-sbtn k-mapa" aria-label="Ver el mapa de mis notas" title="Mapa de mis notas" onClick={() => setMapa(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="17" r="2.6" /><path d="M7.8 8.3l3 6.5M16.6 7.8l-3.4 7M8.2 7l7.6-.8" /></svg>
        </button>
        <button className="k-sbtn" aria-label={vista === "grid" ? "Ver una debajo de otra" : "Ver en cuadros"} title={vista === "grid" ? "Una debajo de otra" : "Cuadros"} onClick={() => setVista(vista === "grid" ? "una" : "grid")}>
          {vista === "grid" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="13" width="16" height="7" rx="2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
          )}
        </button>
        <div className="nv-more">
          <button className="k-sbtn" aria-label={`Ordenar: ${ORDEN[orden]}`} title="Ordenar" aria-haspopup="menu" aria-expanded={ordMenu} onClick={() => setOrdMenu(!ordMenu)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" /></svg>
          </button>
          {ordMenu && (
            <>
              <div className="dial-backdrop clear" onClick={() => setOrdMenu(false)} />
              <div className="menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setOrdMenu(false)}>
                <p className="k-menulabel">Ordenar</p>
                {(Object.keys(ORDEN) as (keyof typeof ORDEN)[]).map((k) => (
                  <button key={k} role="menuitemradio" aria-checked={orden === k} autoFocus={orden === k} onClick={() => { setOrden(k); setOrdMenu(false); }}>
                    <span>{ORDEN[k]}</span>
                    {orden === k && <svg className="ke-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {list.length ? (
        groups.map((g, gi) => (
          <section key={gi + g.label} className="k-group">
            {g.label && <h2 className="k-month">{g.label} <span>· {g.items.length}</span></h2>}
            <div className={vista === "grid" ? "k-grid" : "k-grid una"}>
              {g.items.map(({ n, i }) => (
                <button key={n.id} className="k-card" onClick={() => setAbierta(i)}>
                  {n.fijada && <Pin className="k-pin" />}
                  {n.title && <span className="k-title">{n.title}</span>}
                  {n.created && <span className="k-date">{fdate(n.created)}</span>}
                  {n.tipo === "lista" ? (
                    <span className="k-items">
                      {(n.items ?? []).filter((x) => !x.ok).slice(0, 6).map((x) => (
                        <span key={x.id} className="k-item"><i aria-hidden="true" />{x.t}</span>
                      ))}
                      {(n.items ?? []).filter((x) => x.ok).length > 0 && <span className="k-more">+ {(n.items ?? []).filter((x) => x.ok).length} hechas</span>}
                    </span>
                  ) : (
                    <RichView html={n.html} text={n.text} className="k-text" />
                  )}
                  {mezcla && n.folder !== sec.id && byId[n.folder ?? ""] && <span className="et-chip mini">{byId[n.folder ?? ""].name}</span>}
                </button>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="card empty">
          {q ? "Nada coincide con tu búsqueda." : <>Aún no hay notas aquí. Toca <b>Nueva</b> para escribir una, o el cuadrito para una lista.</>}
        </div>
      )}

      {mapa && (
        <MapaNotas
          notas={notas}
          carpetas={carpetas}
          onNota={setDeMapa}
          onCarpeta={(id) => {
            const c = byId[id];
            if (!c) return;
            setMapa(false);
            setQ("");
            if (c.parent) go(c.parent, c.id);
            else go(c.id);
          }}
          onClose={() => setMapa(false)}
        />
      )}
      {/* Una nota abierta desde el mapa: se ve encima y al cerrarla sigues en el mapa */}
      {deMapa && notas.some((n) => n.id === deMapa) && <NoteView list={notas.filter((n) => n.id === deMapa)} index={0} onIndex={() => {}} onClose={() => setDeMapa(null)} />}
      {abierta >= 0 && <NoteView list={list} index={abierta} onIndex={setAbierta} onClose={() => setAbierta(null)} />}
      {nueva && <NoteView list={[]} index={0} nueva={{ folder: sub?.id ?? sec.id, tipo: nueva }} onClose={() => setNueva(null)} />}
    </>
  );
}
