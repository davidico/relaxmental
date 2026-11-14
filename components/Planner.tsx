"use client";

import { useState } from "react";
import { newId, useData } from "@/lib/data";
import { DOW, pd } from "@/lib/dates";
import { esMeta, type Tarea } from "@/lib/types";
import { borrarTarea } from "@/lib/deshacer";

/**
 * Weekly planner: cada día con tus metas (en lo que quieres avanzar), separadas en
 * Personal y Trabajo; debajo, las tareas puntuales de ese día; a un lado, las tareas sin día.
 * Todo sale en Hoy (y en el itinerario si tiene hora).
 */
type Lado = "personal" | "trabajo";
const LADOS: { id: Lado; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "trabajo", label: "Trabajo" },
];
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

export default function Planner({ days, hoy }: { days: string[]; hoy: string }) {
  const { tareas } = useData();
  const pendientes = tareas.filter((x) => !x.done && !x.due).sort(orden);
  return (
    <div className="pl">
      <div className="pl-dias">
        {days.map((d, i) => {
          const f = pd(d);
          const deDia = tareas.filter((x) => x.due === d).sort(orden);
          /* Los días que ya pasaron se ven, pero apagados y sin tocar */
          const pasado = d < hoy;
          const tono = d === hoy ? "pl-hoy" : pasado ? "apagado" : i >= 5 ? "suave" : "petroleo";
          return (
            <section key={d} className={`pl-dia${d === hoy ? " es-hoy" : ""}${d < hoy ? " pasado" : ""}`} aria-labelledby={`pl-${d}`}>
              <h2 id={`pl-${d}`} className={`pl-cab ${tono}`}>
                {`${DOW[f.getDay()]} ${f.getDate()}${d === hoy ? " · Hoy" : pasado ? " · Ya pasó" : ""}`}
              </h2>
              <div className="pl-lados">
                {LADOS.map((l) => (
                  <Lista key={l.id} titulo={l.label} tipo="meta" lado={l.id} due={d} items={deDia.filter((x) => esMeta(x) && ladoDe(x) === l.id)} days={days} soloVer={pasado} />
                ))}
              </div>
              {(!pasado || deDia.some((x) => !esMeta(x))) && (
                <div className="pl-tareas">
                  <Lista titulo="Tareas" tipo="tarea" lado="personal" due={d} items={deDia.filter((x) => !esMeta(x))} days={days} soloVer={pasado} />
                </div>
              )}
            </section>
          );
        })}
      </div>
      <section className="pl-pend" aria-labelledby="pl-pend-h">
        <h2 id="pl-pend-h">Pendientes</h2>
        <p className="pl-nota">Tareas sin día fijo. Ábrelas para pasarlas a un día.</p>
        <Lista titulo="" tipo="tarea" lado="personal" due="" items={pendientes} days={days} />
      </section>
    </div>
  );
}

function Lista({ titulo, tipo, lado, due, items, days, soloVer = false }: { titulo: string; tipo: "meta" | "tarea"; lado: Lado; due: string; items: Tarea[]; days: string[]; soloVer?: boolean }) {
  const { save } = useData();
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
      ...(tipo === "meta" ? { lado, meta: true } : { meta: false }),
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
          ) : abierto === x.id ? (
            <li key={x.id}>
              <Editar x={x} days={days} onClose={() => setAbierto(null)} />
            </li>
          ) : (
            <li key={x.id} className={x.done ? "hecho" : ""}>
              <input type="checkbox" className="hy-check pl-check" checked={x.done} aria-label={`Hecho: ${x.title}`} onChange={() => save("tareas", { ...x, done: !x.done })} />
              <button className="pl-txt" onClick={() => setAbierto(x.id)} aria-label={`Cambiar: ${x.title}`}>
                {x.hora && <b>{x.hora}{x.fin ? `–${x.fin}` : ""}</b>} {x.title}
              </button>
            </li>
          ),
        )}
      </ul>
      {soloVer ? null : nuevo === null ? (
        <button className="pl-add" onClick={() => setNuevo("")} aria-label={tipo === "meta" ? `Añadir meta en ${titulo}` : due ? "Añadir tarea" : "Añadir pendiente"}>
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
          <label htmlFor={id} className="sr-only">{tipo === "meta" ? `Nueva meta en ${titulo}` : "Nueva tarea"}</label>
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
  const [txt, setTxt] = useState(`${x.hora ? x.hora + (x.fin ? "-" + x.fin : "") + " " : ""}${x.title}`);
  const [meta, setMeta] = useState(esMeta(x));
  const [due, setDue] = useState(x.due);
  const [lado, setLado] = useState<Lado>(ladoDe(x));
  const opciones = Array.from(new Set([...(x.due ? [x.due] : []), ...days.filter((d) => d >= hoy)])).sort();
  const guardar = () => {
    const t = leerHora(txt);
    if (!t.title) return;
    save("tareas", { ...x, title: t.title, hora: due ? t.hora : undefined, fin: due && t.hora ? t.fin : undefined, due, lado, meta });
    onClose();
  };
  return (
    <form
      className="pl-edit"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <label htmlFor={`pe-t-${x.id}`} className="sr-only">Qué es</label>
      <input id={`pe-t-${x.id}`} autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} />
      <div className="pl-edit-fila">
        <label htmlFor={`pe-d-${x.id}`} className="sr-only">Día</label>
        <select id={`pe-d-${x.id}`} value={due} onChange={(e) => setDue(e.target.value)}>
          <option value="">Sin día</option>
          {opciones.map((d) => {
            const f = pd(d);
            return (
              <option key={d} value={d}>
                {DOW[f.getDay()]} {f.getDate()}
              </option>
            );
          })}
        </select>
        <label htmlFor={`pe-m-${x.id}`} className="sr-only">Meta o tarea</label>
        <select id={`pe-m-${x.id}`} value={meta ? "meta" : "tarea"} onChange={(e) => setMeta(e.target.value === "meta")}>
          <option value="meta">Meta</option>
          <option value="tarea">Tarea</option>
        </select>
        {meta && (
          <>
            <label htmlFor={`pe-l-${x.id}`} className="sr-only">Personal o trabajo</label>
            <select id={`pe-l-${x.id}`} value={lado} onChange={(e) => setLado(e.target.value as Lado)}>
              <option value="personal">Personal</option>
              <option value="trabajo">Trabajo</option>
            </select>
          </>
        )}
      </div>
      <div className="pl-edit-fila">
        <button type="submit" className="btn sm">Guardar</button>
        <button type="button" className="btn ghost sm" onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className="btn ghost sm pl-borrar"
          onClick={() => {
            borrarTarea(x, save, remove);
            onClose();
          }}
        >
          Borrar
        </button>
      </div>
    </form>
  );
}
