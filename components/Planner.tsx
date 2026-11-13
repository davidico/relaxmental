"use client";

import { useState } from "react";
import { newId, useData } from "@/lib/data";
import { DOW, pd } from "@/lib/dates";
import type { Tarea } from "@/lib/types";

/**
 * Weekly planner: cada día con lo que te propones, separado en Personal y Trabajo,
 * y a un lado los pendientes sin día. Todo son tareas: lo de cada día sale en Hoy
 * (y en el itinerario si tiene hora).
 */
type Lado = "personal" | "trabajo";
const LADOS: { id: Lado; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "trabajo", label: "Trabajo" },
];
const ladoDe = (x: Tarea): Lado => (x.lado === "trabajo" ? "trabajo" : "personal");
const orden = (a: Tarea, b: Tarea) => (a.hora || "99").localeCompare(b.hora || "99") || a.created.localeCompare(b.created);

/** «10:00 Llamar al banco» o «Llamar al banco 10.00» -> hora y título */
export function leerHora(texto: string): { title: string; hora?: string } {
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
          const tono = d === hoy ? "pl-hoy" : i >= 5 ? "suave" : "petroleo";
          return (
            <section key={d} className={`pl-dia${d === hoy ? " es-hoy" : ""}${d < hoy ? " pasado" : ""}`} aria-labelledby={`pl-${d}`}>
              <h2 id={`pl-${d}`} className={`pl-cab ${tono}`}>
                {`${DOW[f.getDay()]} ${f.getDate()}${d === hoy ? " · Hoy" : ""}`}
              </h2>
              <div className="pl-lados">
                {LADOS.map((l) => (
                  <Lista key={l.id} titulo={l.label} lado={l.id} due={d} items={deDia.filter((x) => ladoDe(x) === l.id)} days={days} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <section className="pl-pend" aria-labelledby="pl-pend-h">
        <h2 id="pl-pend-h">Pendientes</h2>
        <p className="pl-nota">Lo que quieres hacer esta semana, sin día fijo. Ábrelo para pasarlo a un día.</p>
        <Lista titulo="" lado="personal" due="" items={pendientes} days={days} />
      </section>
    </div>
  );
}

function Lista({ titulo, lado, due, items, days }: { titulo: string; lado: Lado; due: string; items: Tarea[]; days: string[] }) {
  const { save } = useData();
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const id = `pl-${due || "pend"}-${lado}`;
  const anadir = () => {
    const t = leerHora(nuevo ?? "");
    if (!t.title) return setNuevo(null);
    save("tareas", { id: newId(), title: t.title, step: "", due, ...(t.hora && due ? { hora: t.hora } : {}), done: false, created: new Date().toISOString(), lado });
    setNuevo("");
  };
  return (
    <div className={`pl-lado ${lado}`}>
      {titulo && <h3 className="pl-lado-h">{titulo}</h3>}
      <ul className="pl-items">
        {items.map((x) =>
          abierto === x.id ? (
            <li key={x.id}>
              <Editar x={x} days={days} onClose={() => setAbierto(null)} />
            </li>
          ) : (
            <li key={x.id} className={x.done ? "hecho" : ""}>
              <input type="checkbox" className="hy-check pl-check" checked={x.done} aria-label={`Hecho: ${x.title}`} onChange={() => save("tareas", { ...x, done: !x.done })} />
              <button className="pl-txt" onClick={() => setAbierto(x.id)} aria-label={`Cambiar: ${x.title}`}>
                {x.hora && <b>{x.hora}</b>} {x.title}
              </button>
            </li>
          ),
        )}
      </ul>
      {nuevo === null ? (
        <button className="pl-add" onClick={() => setNuevo("")} aria-label={titulo ? `Añadir en ${titulo}` : "Añadir pendiente"}>
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
          <label htmlFor={id} className="sr-only">{titulo ? `Nuevo en ${titulo}` : "Nuevo pendiente"}</label>
          <input
            id={id}
            autoFocus
            value={nuevo}
            placeholder={due ? "Ej.: 10:00 Llamar al banco" : "¿Qué quieres hacer?"}
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
  const { save, remove } = useData();
  const [txt, setTxt] = useState(`${x.hora ? x.hora + " " : ""}${x.title}`);
  const [due, setDue] = useState(x.due);
  const [lado, setLado] = useState<Lado>(ladoDe(x));
  const opciones = Array.from(new Set([...(x.due && !days.includes(x.due) ? [x.due] : []), ...days]));
  const guardar = () => {
    const t = leerHora(txt);
    if (!t.title) return;
    save("tareas", { ...x, title: t.title, hora: due ? t.hora : undefined, due, lado });
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
        <label htmlFor={`pe-l-${x.id}`} className="sr-only">Lado</label>
        <select id={`pe-l-${x.id}`} value={lado} onChange={(e) => setLado(e.target.value as Lado)}>
          <option value="personal">Personal</option>
          <option value="trabajo">Trabajo</option>
        </select>
      </div>
      <div className="pl-edit-fila">
        <button type="submit" className="btn sm">Guardar</button>
        <button type="button" className="btn ghost sm" onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className="btn ghost sm pl-borrar"
          onClick={() => {
            remove("tareas", x.id);
            onClose();
          }}
        >
          Borrar
        </button>
      </div>
    </form>
  );
}
