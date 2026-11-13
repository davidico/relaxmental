"use client";

import { useEffect, useMemo, useState } from "react";
import { useData, newId } from "@/lib/data";
import { fdate } from "@/lib/dates";
import type { Area, Carpeta, Nota } from "@/lib/types";
import { RichView } from "@/components/RichEditor";
import NoteView from "@/components/NoteView";

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
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nueva, setNueva] = useState<"texto" | "lista" | null>(null);
  const [secMenu, setSecMenu] = useState(false);
  const [menu, setMenu] = useState(false);
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
    .sort((a, b) =>
      orden === "az"
        ? (a.title || a.text).localeCompare(b.title || b.text, "es")
        : orden === "viejas"
          ? (a.created < b.created ? -1 : 1)
          : (b.created < a.created ? -1 : 1),
    );
  /* El nombre de la carpeta en la tarjeta solo hace falta si la lista mezcla carpetas */
  const mezcla = new Set(list.map((n) => n.folder)).size > 1;
  const groups: { label: string; items: { n: Nota; i: number }[] }[] = [];
  list.forEach((n, i) => {
    const label = orden === "az" || !n.created ? "" : monthLabel(n.created);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push({ n, i });
    else groups.push({ label, items: [{ n, i }] });
  });

  /* Si cambia la lista mientras lees (p. ej. borraste), no salirse del rango */
  useEffect(() => {
    if (abierta !== null && abierta >= list.length) setAbierta(list.length ? list.length - 1 : null);
  }, [abierta, list.length]);

  const guardarForm = () => {
    if (!form || !form.name.trim() || !sec) return;
    const name = form.name.trim();
    if (form.mode === "renombrar") save("carpetas", { ...sec, name, privada: form.privada });
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
          <button className="k-secbtn" aria-haspopup="menu" aria-expanded={secMenu} onClick={() => setSecMenu(!secMenu)}>
            <h1>{sec.name}</h1>
            {sec.privada && <Lock />}
            <svg className="k-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            <span className="sr-only">Cambiar de sección</span>
          </button>
          {secMenu && (
            <>
              <div className="dial-backdrop clear" onClick={() => setSecMenu(false)} />
              <div className="menu k-secmenu" role="menu" onKeyDown={(e) => e.key === "Escape" && setSecMenu(false)}>
                {visibles.map((c, i) => (
                  <button key={c.id} role="menuitem" autoFocus={i === 0} aria-current={c.id === sec.id || undefined} onClick={() => { setSecMenu(false); setQ(""); go(c.id); }}>
                    <span>{c.name}</span><small>{count(c)}</small>
                  </button>
                ))}
                {privadas.length > 0 && <p className="k-menulabel">Privadas</p>}
                {privadas.map((c) => (
                  <button key={c.id} role="menuitem" aria-current={c.id === sec.id || undefined} onClick={() => { setSecMenu(false); setQ(""); go(c.id); }}>
                    <span><Lock /> {c.name}</span><small>{count(c)}</small>
                  </button>
                ))}
                <hr />
                <button role="menuitem" onClick={() => { setSecMenu(false); setForm({ mode: "seccion", name: "", privada: false }); }}>+ Nueva sección</button>
              </div>
            </>
          )}
        </div>
        <div className="k-actions">
          <div className="nv-more">
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
          <div className="nv-more">
            <button className="nv-ib" aria-haspopup="menu" aria-expanded={menu} aria-label={`Opciones de ${sec.name}`} onClick={() => setMenu(!menu)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            </button>
            {menu && (
              <>
                <div className="dial-backdrop clear" onClick={() => setMenu(false)} />
                <div className="menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setMenu(false)}>
                  <button role="menuitem" autoFocus onClick={() => { setMenu(false); setForm({ mode: "carpeta", name: "", privada: false }); }}>Nueva carpeta en {sec.name}</button>
                  <button role="menuitem" onClick={() => { setMenu(false); setForm({ mode: "renombrar", name: sec.name, privada: !!sec.privada }); }}>Renombrar o hacer privada</button>
                  {sub && <button role="menuitem" className="danger" onClick={() => { setMenu(false); setConfirm(borrable(sub) ? `c:${sub.id}` : "ocupada"); }}>Borrar carpeta «{sub.name}»</button>}
                  {!sub && sec.id !== "notas" && <button role="menuitem" className="danger" onClick={() => { setMenu(false); setConfirm(borrable(sec) ? `c:${sec.id}` : "ocupada"); }}>Borrar sección</button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="k-dots" aria-hidden="true" />

      {form && (
        <form className="card pad k-form" onSubmit={(e) => { e.preventDefault(); guardarForm(); }}>
          <label htmlFor="k-name" className="flabel">
            {form.mode === "seccion" ? "Nombre de la nueva sección" : form.mode === "carpeta" ? `Nueva carpeta en ${sec.name}` : "Nombre de la sección"}
          </label>
          <input id="k-name" autoFocus placeholder={form.mode === "carpeta" ? "Ej. Cosas por orar, Inspiración…" : "Ej. Espiritual, Trabajo…"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {form.mode !== "carpeta" && (
            <label className="k-check">
              <input type="checkbox" checked={form.privada} onChange={(e) => setForm({ ...form, privada: e.target.checked })} />
              <span>Privada: no se muestra al abrir Cerebro, solo desde el menú de secciones</span>
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
          Para borrarla tiene que estar vacía (sin notas ni carpetas).
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

      {kids.length > 0 && (
        <div className="seg k-chips" role="group" aria-label={`Carpetas de ${sec.name}`}>
          <button aria-pressed={!sub} onClick={() => go(sec.id)}>Todo · {count(sec)}</button>
          {kids.map((k) => (
            <button key={k.id} aria-pressed={sub?.id === k.id} onClick={() => go(sec.id, k.id)}>{k.name} · {count(k)}</button>
          ))}
        </div>
      )}

      <div className="k-search">
        <svg className="k-sico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <label htmlFor="q" className="sr-only">Buscar en {sub?.name ?? sec.name}</label>
        <input id="q" type="search" placeholder={`Buscar en ${sub?.name ?? sec.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
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
                  {n.title && <span className="k-title">{n.title}</span>}
                  {n.created && <span className="k-date">{fdate(n.created)}{mezcla && n.folder !== sec.id && byId[n.folder ?? ""] ? ` · ${byId[n.folder ?? ""].name}` : ""}</span>}
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

      {abierta !== null && list[abierta] && <NoteView list={list} index={abierta} onIndex={setAbierta} onClose={() => setAbierta(null)} />}
      {nueva && <NoteView list={[]} index={0} nueva={{ folder: sub?.id ?? sec.id, tipo: nueva }} onClose={() => setNueva(null)} />}
    </>
  );
}
