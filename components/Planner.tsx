"use client";

import CuandoPendientes from "./CuandoPendientes";
import { useEffect, useState } from "react";
import { newId, useData } from "@/lib/data";
import { DOW, pd } from "@/lib/dates";
import { esMeta, type Tarea } from "@/lib/types";
import { borrarTarea } from "@/lib/deshacer";
import HoraInput from "./HoraInput";
import { useMarcarTarea } from "@/lib/usarMarcar";

/**
 * Weekly planner de un lado de tu vida (Personal o Trabajo, una pestaña cada uno): cada día con tus metas
 * (en lo que quieres avanzar) y debajo las tareas puntuales de ese día; arriba (o a un lado), las tareas sin día.
 * Todo sale en Hoy (y en el itinerario si tiene hora).
 */
export type Lado = "personal" | "trabajo";
const ladoDe = (x: Tarea): Lado => (x.lado === "trabajo" ? "trabajo" : "personal");
const orden = (a: Tarea, b: Tarea) => (a.hora || "99").localeCompare(b.hora || "99") || a.created.localeCompare(b.created);

/** «10:00 Llamar al banco», «Llamar al banco 10.00» o «9:00-11:00 Contabilidad» -> hora (y fin) y título */
export function leerHora(texto: string): { title: string; hora?: string; fin?: string } {
  const r = texto.match(/(?:^|\s)([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–|a)\s*([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s|$)/i);
  if (r) {
    const hora = `${r[1].padStart(2, "0")}:${r[2]}`;
    const fin = `${r[3].padStart(2, "0")}:${r[4]}`;
    const title = texto.replace(r[0], " ").replace(/\s+/g, " ").trim();
    if (title && fin > hora) return { title, hora, fin };
  }
  const m = texto.match(/(?:^|\s)(?:a las\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*h)?(?=\s|$)/i);
  if (!m) return { title: texto.trim() };
  const hora = `${m[1].padStart(2, "0")}:${m[2]}`;
  const title = texto.replace(m[0], " ").replace(/\s+/g, " ").trim();
  return title ? { title, hora } : { title: texto.trim() };
}

export default function Planner({ days, hoy, lado }: { days: string[]; hoy: string; lado: Lado }) {
  const { tareas } = useData();
  const pendientes = tareas.filter((x) => !x.done && !x.due && ladoDe(x) === lado).sort(orden);
  const [verPend, setVerPend] = useState(false);
  /* En pantallas anchas (dos columnas) Pendientes está siempre abierto */
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const m = matchMedia("(min-width:1180px)");
    const on = () => setAncho(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return (
    <div className="pl">
      {/* Pendientes va primero: en el móvil plegado arriba; en pantallas anchas, fijo a la derecha */}
      <section className={`pl-pend${ancho || verPend ? " abierto" : ""}`} aria-labelledby="pl-pend-h">
        <h2 id="pl-pend-h">
          {ancho ? (
            "Pendientes"
          ) : (
            <button className="pl-pend-btn" aria-expanded={verPend} aria-controls="pl-pend-cuerpo" onClick={() => setVerPend(!verPend)}>
              <span>Pendientes</span>
              <span className="pl-pend-n">{pendientes.length === 0 ? "ninguno" : pendientes.length}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
        </h2>
        {(ancho || verPend) && (
          <div id="pl-pend-cuerpo">
            <p className="pl-nota">Tareas sin día fijo. Ábrelas para pasarlas a un día.</p>
            <CuandoPendientes pendientes={pendientes} />
            <Lista titulo="" tipo="tarea" lado={lado} due="" items={pendientes} days={days} />
          </div>
        )}
      </section>
      <div className="pl-dias">
        {days.map((d, i) => {
          const f = pd(d);
          const deDia = tareas.filter((x) => x.due === d && ladoDe(x) === lado).sort(orden);
          const metas = deDia.filter(esMeta);
          const sueltas = deDia.filter((x) => !esMeta(x));
          /* Los días que ya pasaron se ven, pero apagados y sin tocar; si no tuvieron nada, en una sola línea */
          const pasado = d < hoy;
          const vacio = pasado && !deDia.length;
          const tono = d === hoy ? "pl-hoy" : pasado ? "apagado" : i >= 5 ? "suave" : "petroleo";
          return (
            <section key={d} className={`pl-dia${d === hoy ? " es-hoy" : ""}${pasado ? " pasado" : ""}${vacio ? " vacio" : ""}`} aria-labelledby={`pl-${d}`}>
              <h2 id={`pl-${d}`} className={`pl-cab ${tono}`}>
                {`${DOW[f.getDay()]} ${f.getDate()}${d === hoy ? " · Hoy" : pasado ? " · Ya pasó" : ""}`}
                {vacio && <span className="pl-cab-n"> · nada</span>}
              </h2>
              {!vacio && (
                <>
                  {(!pasado || metas.length > 0) && <Lista titulo="Metas" tipo="meta" lado={lado} due={d} items={metas} days={days} soloVer={pasado} />}
                  {(!pasado || sueltas.length > 0) && (
                    <div className="pl-tareas">
                      <Lista titulo="Tareas" tipo="tarea" lado={lado} due={d} items={sueltas} days={days} soloVer={pasado} />
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Lista({ titulo, tipo, lado, due, items, days, soloVer = false }: { titulo: string; tipo: "meta" | "tarea"; lado: Lado; due: string; items: Tarea[]; days: string[]; soloVer?: boolean }) {
  const { save } = useData();
  const marcarTarea = useMarcarTarea();
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const id = `pl-${due || "pend"}-${tipo}-${lado}`;
  const anadir = () => {
    const t = leerHora(nuevo ?? "");
    if (!t.title) return setNuevo(null);
    save("tareas", {
      id: newId(),
      title: t.title,
      step: "",
      due,
      ...(t.hora && due ? { hora: t.hora, ...(t.fin ? { fin: t.fin } : {}) } : {}),
      done: false,
      created: new Date().toISOString(),
      ...(tipo === "meta" ? { lado, meta: true } : { meta: false, ...(lado === "trabajo" ? { lado } : {}) }),
    });
    setNuevo("");
  };
  return (
    <div className={`pl-lado ${tipo === "meta" ? lado : "tarea"}`}>
      {titulo && <h3 className="pl-lado-h">{titulo}</h3>}
      <ul className="pl-items">
        {soloVer && !items.length && tipo === "meta" && <li className="pl-vacio">Nada</li>}
        {items.map((x) =>
          soloVer ? (
            <li key={x.id} className={`pl-visto${x.done ? " hecho" : ""}`}>
              <span className="pl-marca" aria-hidden="true">{x.done ? "✓" : "○"}</span>
              <span className="pl-txt">
                {x.hora && <b>{x.hora}{x.fin ? `–${x.fin}` : ""}</b>} {x.title}
                <span className="sr-only">{x.done ? " (hecho)" : " (sin hacer)"}</span>
              </span>
            </li>
          ) : (
            <li key={x.id} className={x.done ? "hecho" : ""}>
              <label className="pl-tap">
                <input type="checkbox" className="hy-check pl-check" checked={x.done} aria-label={`Hecho: ${x.title}`} onChange={() => marcarTarea(x)} />
              </label>
              <button className="pl-txt" onClick={() => setAbierto(x.id)} aria-label={`Cambiar: ${x.title}`}>
                {x.hora && <b>{x.hora}{x.fin ? `–${x.fin}` : ""}</b>} {x.title}
              </button>
              {abierto === x.id && <Editar x={x} days={days} onClose={() => setAbierto(null)} />}
            </li>
          ),
        )}
      </ul>
      {soloVer ? null : nuevo === null ? (
        <button className="pl-add" onClick={() => setNuevo("")} aria-label={`${tipo === "meta" ? "Añadir meta" : due ? "Añadir tarea" : "Añadir pendiente"} ${lado === "trabajo" ? "de trabajo" : "personal"}`}>
          + Añadir
        </button>
      ) : (
        <form
          className="pl-form"
          onSubmit={(e) => {
            e.preventDefault();
            anadir();
          }}
        >
          <label htmlFor={id} className="sr-only">{tipo === "meta" ? `Nueva meta ${lado === "trabajo" ? "de trabajo" : "personal"}` : "Nueva tarea"}</label>
          <input
            id={id}
            autoFocus
            value={nuevo}
            placeholder={tipo === "meta" ? "Ej.: Contabilidad" : due ? "Ej.: 10:00 Llamar al banco" : "¿Qué tienes que hacer?"}
            enterKeyHint="done"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNuevo(null)}
            onBlur={() => (nuevo?.trim() ? anadir() : setNuevo(null))}
          />
        </form>
      )}
    </div>
  );
}

function Editar({ x, days, onClose }: { x: Tarea; days: string[]; onClose: () => void }) {
  const { save, remove, hoy } = useData();
  const [txt, setTxt] = useState(x.title);
  const [hora, setHora] = useState(x.hora ?? "");
  const [fin, setFin] = useState(x.fin ?? "");
  const [meta, setMeta] = useState(esMeta(x));
  const [due, setDue] = useState(x.due);
  const [lado, setLado] = useState<Lado>(ladoDe(x));
  const opciones = Array.from(new Set([...(x.due ? [x.due] : []), ...days.filter((d) => d >= hoy)])).sort();
  const guardar = () => {
    /* Si escribes la hora en el texto («10:00 Llamar»), manda sobre las ruedas */
    const t = leerHora(txt);
    if (!t.title) return;
    const h = t.hora ?? hora;
    const f = t.hora ? t.fin : fin;
    save("tareas", { ...x, title: t.title, hora: due && h ? h : undefined, fin: due && h && f && f > h ? f : undefined, due, lado, meta });
    onClose();
  };
  const f = (d: string) => pd(d);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet pl-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`pe-h-${x.id}`}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <div className="sheet-head">
          <h2 id={`pe-h-${x.id}`} className="sheet-title">{meta ? "Cambiar meta" : "Cambiar tarea"}</h2>
          <button type="button" className="nv-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="pl-campos">
          <div className="pl-campo">
            <label htmlFor={`pe-t-${x.id}`}>Qué es</label>
            <input id={`pe-t-${x.id}`} autoFocus value={txt} autoComplete="off" onChange={(e) => setTxt(e.target.value)} />
          </div>
          <div className="pl-campo">
            <label htmlFor={`pe-d-${x.id}`}>Día</label>
            <select id={`pe-d-${x.id}`} value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">Sin día (queda en Pendientes)</option>
              {opciones.map((d) => (
                <option key={d} value={d}>
                  {DOW[f(d).getDay()]} {f(d).getDate()}
                </option>
              ))}
            </select>
          </div>
          <div className="pl-dos">
            <div className="pl-campo">
              <label htmlFor={`pe-m-${x.id}`}>Tipo</label>
              <select id={`pe-m-${x.id}`} value={meta ? "meta" : "tarea"} onChange={(e) => setMeta(e.target.value === "meta")}>
                <option value="meta">Meta</option>
                <option value="tarea">Tarea</option>
              </select>
            </div>
            <div className="pl-campo">
              <label htmlFor={`pe-l-${x.id}`}>Pestaña</label>
              <select id={`pe-l-${x.id}`} value={lado} onChange={(e) => setLado(e.target.value as Lado)}>
                <option value="personal">Personal</option>
                <option value="trabajo">Trabajo</option>
              </select>
            </div>
          </div>
          {due && (
            <div className="pl-campo">
              <span className="pl-etq" id={`pe-hh-${x.id}`}>Hora</span>
              <div className="pl-edit-hora" role="group" aria-labelledby={`pe-hh-${x.id}`}>
                <HoraInput label="Empieza" value={hora} onChange={setHora} vacio="Sin hora" />
                {hora && (
                  <>
                    <span aria-hidden="true">a</span>
                    <HoraInput label="Termina" value={fin} onChange={setFin} vacio="Fin" desde={hora} invalid={!!fin && fin <= hora} />
                    <button type="button" className="linkbtn" onClick={() => { setHora(""); setFin(""); }}>Quitar hora</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="sheet-foot">
          <button
            type="button"
            className="btn ghost pl-borrar"
            onClick={() => {
              borrarTarea(x, save, remove);
              onClose();
            }}
          >
            Borrar
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={!txt.trim()}>Guardar</button>
        </div>
      </form>
    </div>
  );
}
