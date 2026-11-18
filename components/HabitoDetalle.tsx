"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useData } from "@/lib/data";
import { DOW, MES, addD, ds, pd } from "@/lib/dates";
import { anotar, bestStreak, cantidad, conUnidad, sinDias, streak, tipoDe, total, type TipoHabito, textoVeces } from "@/lib/habits";
import type { Habito } from "@/lib/types";
import { toggleHecho } from "./ui";
import HabitoAnotar from "./HabitoAnotar";
import TextoCrece from "./TextoCrece";
import HoraInput from "./HoraInput";

const LETRAS = ["L", "M", "M", "J", "V", "S", "D"];

/** Campos para crear o cambiar un hábito: nombre, tipo y, si es medible, unidad y meta diaria */
export function CamposHabito({
  v,
  onChange,
  idp,
  sinNombre,
  onSalir,
}: {
  v: CamposV;
  onChange: (p: Partial<CamposV>) => void;
  idp: string;
  /** Sin el campo del nombre (cuando el nombre se cambia en otro sitio) */
  sinNombre?: boolean;
  /** Al salir de un campo de texto (para guardar al momento) */
  onSalir?: () => void;
}) {
  return (
    <>
      {!sinNombre && (
      <div className="hf-campo">
        <label htmlFor={`${idp}-n`}>Nombre</label>
        <TextoCrece id={`${idp}-n`} className="campo1" required autoFocus autoComplete="off" enterKeyHint="done" placeholder={v.tipo === "dejar" ? "Ej.: Redes sociales…" : v.tipo === "medible" ? "Ej.: Correr…" : "Ej.: Leer un capítulo…"} value={v.name} onTexto={(name) => onChange({ name })} />
      </div>
      )}
      <div className="hf-campo">
        <label htmlFor={`${idp}-t`}>Tipo</label>
        <select id={`${idp}-t`} value={v.tipo} onChange={(e) => onChange({ tipo: e.target.value as TipoHabito })}>
          <option value="marca">De marca: lo hice o no</option>
          <option value="medible">Medible: con cantidad (km, páginas…)</option>
          <option value="dejar">Para dejar: marco los días que lo logro</option>
        </select>
      </div>
      {/* Cuándo prefiere hacerlo y cuántos días por semana (un mal hábito para dejar es de todos los días) */}
      {v.tipo !== "dejar" && (
        <>
          <div className="hf-campo" role="group" aria-labelledby={`${idp}-v`}>
            <p id={`${idp}-v`} className="hf-lbl">¿Cuántos días por semana?</p>
            <div className="rd-chips hf-veces">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button key={n} type="button" aria-pressed={v.veces === n} aria-label={textoVeces(n)} onClick={() => onChange({ veces: n })}>
                  {n === 7 ? "Todos los días" : n}
                </button>
              ))}
            </div>
          </div>
          <div className="hf-campo">
            <span className="hf-lbl" id={`${idp}-h`}>¿A qué hora prefieres hacerlo?</span>
            <div className="hf-hora">
              <HoraInput id={`${idp}-hr`} label="Hora preferida" value={v.hora} onChange={(hora) => onChange({ hora })} vacio="Sin hora" />
              {v.hora && <button type="button" className="linkbtn" onClick={() => onChange({ hora: "" })}>Quitar la hora</button>}
            </div>
            <p className="hf-ayuda">{v.hora ? `A las ${v.hora} te aviso si aún no lo marcaste.` : "Si le pones hora, te aviso a esa hora si aún no lo marcaste."}</p>
          </div>
        </>
      )}
      {v.tipo === "medible" && (
        <div className="hf-dos">
          <div className="hf-campo">
            <label htmlFor={`${idp}-u`}>Unidad</label>
            <input id={`${idp}-u`} autoComplete="off" autoCapitalize="none" maxLength={12} placeholder="km, páginas, min…" value={v.unidad} onChange={(e) => onChange({ unidad: e.target.value })} onBlur={onSalir} />
          </div>
          <div className="hf-campo">
            <label htmlFor={`${idp}-o`}>Meta del día (opcional)</label>
            <input id={`${idp}-o`} inputMode="decimal" autoComplete="off" placeholder="Ej.: 5" value={v.objetivo} onChange={(e) => onChange({ objetivo: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })} onBlur={onSalir} />
          </div>
        </div>
      )}
    </>
  );
}
export const leerCampos = (v: CamposV) => {
  const objetivo = Number(v.objetivo.replace(",", ".")) || 0;
  return {
    name: v.name.trim(),
    tipo: v.tipo,
    unidad: v.tipo === "medible" ? v.unidad.trim() || undefined : undefined,
    objetivo: v.tipo === "medible" && objetivo > 0 ? objetivo : undefined,
    hora: v.tipo !== "dejar" && /^\d{2}:\d{2}$/.test(v.hora) ? v.hora : undefined,
    /* 7 también se guarda: así se sabe que ya se respondió */
    veces: v.tipo !== "dejar" && v.veces >= 1 && v.veces <= 7 ? v.veces : undefined,
  };
};
/** Lo que se escribe al crear o ajustar un hábito */
export type CamposV = { name: string; tipo: TipoHabito; unidad: string; objetivo: string; hora: string; veces: number };

/**
 * Un hábito a pantalla completa: su mes en un calendario (tocas un día para marcarlo, también los pasados),
 * y sus rachas. El nombre se cambia arriba (se toca y se escribe; se guarda solo). Los tres puntitos abren el menú:
 * cambiar nombre, «Hora, días y tipo» y borrar; estas dos últimas en una ventanita.
 */
export default function HabitoDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const { habitos, save, remove, hoy } = useData();
  const h = habitos.find((x) => x.id === id);
  const [mes, setMes] = useState(() => {
    const d = pd(hoy);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [anotando, setAnotando] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  /* Las opciones de los tres puntitos se abren en una ventanita: el tipo y la meta, o borrar */
  const [ventana, setVentana] = useState<"" | "ajustes" | "borrar">("");
  const [campos, setCampos] = useState(() => ({
    name: h?.name ?? "",
    tipo: (h ? tipoDe(h) : "marca") as TipoHabito,
    unidad: h?.unidad ?? "",
    objetivo: h?.objetivo ? String(h.objetivo).replace(".", ",") : "",
    hora: h?.hora ?? "",
    veces: h?.veces ?? 7,
  }));
  const [nombre, setNombre] = useState(h?.name ?? "");
  const [guardado, setGuardado] = useState(false);
  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(false), 2500);
    return () => clearTimeout(t);
  }, [guardado]);

  useEffect(() => {
    /* Escape cierra primero lo que esté abierto encima (el menú o la ventanita) y luego el hábito */
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".ha-back")) return;
      if (menu) setMenu(false);
      else if (ventana) setVentana("");
      else onClose();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose, menu, ventana]);
  if (!h) return null;

  const tipo = tipoDe(h);
  /* Guarda los ajustes al momento. Al cambiar el tipo o la meta de un medible, se recalcula qué días cuentan como hechos */
  const guardar = (v: typeof campos) => {
    const c = leerCampos({ ...v, name: h.name });
    let nuevo: Habito = { ...h, ...c };
    if (c.tipo === "medible") for (const [d, x] of Object.entries(nuevo.cantidades ?? {})) nuevo = anotar(nuevo, d, x);
    if (JSON.stringify(nuevo) === JSON.stringify(h)) return;
    save("habitos", nuevo);
    setGuardado(true);
  };
  const guardarNombre = () => {
    const n = nombre.trim();
    if (!n) return setNombre(h.name);
    if (n === h.name) return;
    save("habitos", { ...h, name: n });
    setGuardado(true);
  };
  const s = streak(h, hoy);
  const mejor = bestStreak(h);
  const primero = ds(mes);
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const hueco = (mes.getDay() + 6) % 7; // lunes primero
  const celdas: (string | null)[] = [...Array.from({ length: hueco }, () => null), ...Array.from({ length: diasMes }, (_, i) => addD(primero, i))];
  const ultimo = addD(primero, diasMes - 1);
  const esMesActual = hoy >= primero && hoy <= ultimo;
  const hechosMes = celdas.filter((d) => d && h.hechos[d]).length;
  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1, 12));
  const tocar = (d: string) => (tipo === "medible" ? setAnotando(d) : save("habitos", toggleHecho(h, d)));
  const estado = (d: string) => {
    const c = cantidad(h, d);
    if (tipo === "medible") return c ? `${conUnidad(h, c)}${h.hechos[d] ? "" : " (sin llegar a la meta)"}` : "sin anotar";
    return h.hechos[d] ? (tipo === "dejar" ? "lo lograste" : "hecho") : "sin marcar";
  };

  return (
    <div className="nv" role="dialog" aria-modal="true" aria-label={`Hábito: ${h.name}`}>
      <div className="nv-bar ke-bar">
        <button className="nv-ib ke-ib" aria-label="Cerrar" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        {/* El nombre se cambia tocándolo: se guarda al salir o con Enter */}
        <label htmlFor="hd-nombre" className="sr-only">Nombre del hábito</label>
        <TextoCrece
          id="hd-nombre"
          className="hd-nombre"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={80}
          value={nombre}
          onTexto={setNombre}
          onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
          onBlur={guardarNombre}
        />
        <span className="vok sr-only" role="status">{guardado ? "Guardado" : ""}</span>
        <div className="nv-more">
          <button className="nv-ib ke-ib" aria-label="Opciones del hábito" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menu && (
            <>
              <div className="dial-backdrop clear" onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <button role="menuitem" autoFocus onClick={() => { setMenu(false); const c = document.getElementById("hd-nombre") as HTMLTextAreaElement | null; c?.focus(); c?.setSelectionRange(c.value.length, c.value.length); }}>Cambiar nombre</button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setCampos({ name: h.name, tipo: tipoDe(h), unidad: h.unidad ?? "", objetivo: h.objetivo ? String(h.objetivo).replace(".", ",") : "", hora: h.hora ?? "", veces: h.veces ?? 7 });
                    setVentana("ajustes");
                  }}
                >
                  Hora, días y tipo
                </button>
                <button role="menuitem" className="danger" onClick={() => { setMenu(false); setVentana("borrar"); }}>Borrar hábito</button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="nv-body">
        <div className="nv-paper hd">
          {sinDias(h) && <PreguntaDias h={h} />}
          <div className="hd-datos">
            <p>
              <b>{s}</b>
              <span>{s === 1 ? "día seguido" : "días seguidos"}{tipo === "dejar" ? " lográndolo" : ""}</span>
            </p>
            <p>
              <b>{mejor}</b>
              <span>tu mejor racha</span>
            </p>
            <p>
              <b>{tipo === "medible" ? conUnidad(h, total(h, primero, ultimo)) : hechosMes}</b>
              <span>{tipo === "medible" ? "este mes" : hechosMes === 1 ? "día este mes" : "días este mes"}</span>
            </p>
          </div>

          <section className="card hd-cal" aria-labelledby="hd-mes">
            <div className="hd-cal-cab">
              <button className="nv-ib" aria-label="Mes anterior" onClick={() => mover(-1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <h3 id="hd-mes">{MES[mes.getMonth()][0].toUpperCase() + MES[mes.getMonth()].slice(1)} {mes.getFullYear()}</h3>
              <button className="nv-ib" aria-label="Mes siguiente" disabled={esMesActual} onClick={() => mover(1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="hd-grid" role="group" aria-label="Días del mes">
              {LETRAS.map((l, i) => (
                <span key={i} className="hd-dow" aria-hidden="true">{l}</span>
              ))}
              {celdas.map((d, i) =>
                d ? (
                  <button
                    key={d}
                    className={`hd-dia${h.hechos[d] ? " on" : cantidad(h, d) ? " parte" : ""}${d === hoy ? " hd-hoy" : ""}`}
                    disabled={d > hoy}
                    aria-pressed={tipo === "medible" ? undefined : !!h.hechos[d]}
                    aria-label={`${DOW[pd(d).getDay()]} ${pd(d).getDate()}: ${estado(d)}`}
                    onClick={() => tocar(d)}
                  >
                    {pd(d).getDate()}
                  </button>
                ) : (
                  <span key={`v${i}`} />
                ),
              )}
            </div>
            <p className="hint hd-ayuda">
              {tipo === "medible" ? "Toca un día para anotar o cambiar la cantidad." : tipo === "dejar" ? "Toca los días que lo lograste. También puedes marcar días anteriores." : "Toca un día para marcarlo o desmarcarlo. También los anteriores."}
            </p>
          </section>

        </div>
      </div>
      {anotando && <HabitoAnotar h={h} dia={anotando} onClose={() => setAnotando(null)} />}
      {ventana === "ajustes" && createPortal(
        <div className="modal hd-modal" onClick={(e) => e.target === e.currentTarget && setVentana("")}>
          <form
            className="sheet hf hd-hoja"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hd-aj"
            onSubmit={(e) => {
              e.preventDefault();
              guardar(campos);
              setVentana("");
            }}
          >
            <h2 id="hd-aj" className="hd-hoja-h">Hora, días y tipo</h2>
            <CamposHabito v={campos} idp="hd" sinNombre onChange={(p) => setCampos((v) => ({ ...v, ...p }))} />
            <div className="hd-hoja-pie">
              <button type="button" className="btn ghost" onClick={() => setVentana("")}>Cancelar</button>
              <button type="submit" className="btn">Guardar</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
      {ventana === "borrar" && createPortal(
        <div className="modal hd-modal" onClick={(e) => e.target === e.currentTarget && setVentana("")}>
          <div className="sheet hd-hoja" role="alertdialog" aria-modal="true" aria-labelledby="hd-bo" aria-describedby="hd-bo-d">
            <h2 id="hd-bo" className="hd-hoja-h">¿Borrar «{h.name}»?</h2>
            <p id="hd-bo-d" className="hd-hoja-txt">Se borra el hábito con todo su historial. No se puede deshacer.</p>
            <div className="hd-hoja-pie">
              <button type="button" className="btn ghost" autoFocus onClick={() => setVentana("")}>No, dejarlo</button>
              <button type="button" className="btn warn" onClick={() => { remove("habitos", h.id); onClose(); }}>Borrar</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** «¿Cuántos días por semana?» para un hábito que aún no lo dijo: se guarda al tocar */
export function PreguntaDias({ h, conNombre }: { h: Habito; conNombre?: boolean }) {
  const { save } = useData();
  return (
    <div className="hb-dias" role="group" aria-label={`¿Cuántos días por semana quieres hacer ${h.name}?`}>
      <p className="hb-dias-t">{conNombre ? h.name : `¿Cuántos días por semana quieres hacer «${h.name}»?`}</p>
      <div className="rd-chips hf-veces">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button key={n} type="button" aria-label={textoVeces(n)} onClick={() => save("habitos", { ...h, veces: n })}>
            {n === 7 ? "Todos los días" : n}
          </button>
        ))}
      </div>
    </div>
  );
}
