"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, addD, pd } from "@/lib/dates";
import { textoEventos } from "@/lib/plan";
import type { Tarea } from "@/lib/types";

type Propuesta = { id: string; due: string; motivo: string };

/**
 * «¿Cuándo las hago?»: para las tareas sin fecha (Pendientes). Solo cuando la persona lo pide, la IA mira
 * lo que ya tiene apuntado y sus compromisos de los próximos 7 días y propone un día para cada una, con un motivo corto.
 * Ella dice sí o no a cada propuesta; al decir sí, la tarea pasa a ese día (sin hora).
 */
export default function CuandoPendientes({ pendientes }: { pendientes: Tarea[] }) {
  const { mode, offline, tareas, eventos, perfil, save, hoy } = useData();
  const [estado, setEstado] = useState<"" | "pensando" | "error" | "nada">("");
  const [props, setProps] = useState<Propuesta[]>([]);
  const vivas = props.filter((p) => pendientes.some((x) => x.id === p.id));
  if (mode !== "cloud" || offline || (!pendientes.length && !vivas.length)) return null;

  const dia = (d: string) => `${DOW[pd(d).getDay()]} ${pd(d).getDate()} de ${MES[pd(d).getMonth()]}`;
  const pedir = async () => {
    setEstado("pensando");
    try {
      /* Cómo viene cada uno de los próximos 7 días: lo que ya hay apuntado y los compromisos */
      const dias = Array.from({ length: 7 }, (_, i) => addD(hoy, i)).map((d) => {
        const cosas = tareas.filter((x) => x.due === d && !x.done).map((x) => x.title);
        const evs = eventos[d] ?? [];
        return `${DOW[pd(d).getDay()]} ${d}: ${cosas.length ? `${cosas.length} cosas ya apuntadas (${cosas.slice(0, 8).join("; ")})` : "nada apuntado"}${evs.length ? `. Compromisos: ${textoEventos(evs)}` : ""}`;
      });
      const r = await fetch("/api/ai/pendientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hoy, pendientes: pendientes.slice(0, 20).map((x) => ({ id: x.id, t: x.title, paso: x.step })), dias, reglas: perfil.reglas?.text ?? "" }),
      });
      if (!r.ok) throw new Error();
      const { propuestas } = (await r.json()) as { propuestas?: Propuesta[] };
      setProps(propuestas ?? []);
      setEstado(propuestas?.length ? "" : "nada");
    } catch {
      setEstado("error");
    }
  };
  const aceptar = (p: Propuesta) => {
    const x = pendientes.find((m) => m.id === p.id);
    if (x) save("tareas", { ...x, due: p.due });
  };
  const titulo = (id: string) => pendientes.find((x) => x.id === id)?.title ?? "";

  if (vivas.length)
    return (
      <div className="hm-box cp" role="group" aria-labelledby="cp-h">
        <h3 id="cp-h" className="hm-h">Mi propuesta para tus pendientes</h3>
        <p className="hm-p">Mirando tu semana. Tú decides: nada cambia si no dices que sí.</p>
        <ul className="hm-l">
          {vivas.map((p) => (
            <li key={p.id}>
              <span className="hm-t cp-t">
                <b>{dia(p.due)}{p.due === hoy ? " (hoy)" : ""}</b>
                <span>{titulo(p.id)}</span>
                {p.motivo && <small>{p.motivo}</small>}
              </span>
              <span className="hm-b">
                <button className="btn sm" onClick={() => aceptar(p)} aria-label={`Sí, pasar ${titulo(p.id)} al ${dia(p.due)}`}>Sí</button>
                <button className="btn ghost sm" onClick={() => setProps((xs) => xs.filter((y) => y.id !== p.id))} aria-label={`No: ${titulo(p.id)}`}>No</button>
              </span>
            </li>
          ))}
        </ul>
        {vivas.length > 1 && <button className="linkbtn" onClick={() => vivas.forEach(aceptar)}>Sí a todas</button>}
      </div>
    );

  return (
    <div className="cp-pedir">
      {estado === "error" && <p className="verr" role="alert">⚠ No pude proponerlo ahora. Inténtalo otra vez.</p>}
      {estado === "nada" && <p role="status">Esta semana no veo un buen día para ninguna. Pueden esperar.</p>}
      <button className="btn ghost sm" onClick={pedir} disabled={estado === "pensando"}>
        {estado === "pensando" ? "Mirando tu semana…" : "¿Cuándo las hago?"}
      </button>
      <span className="cp-nota">La IA te propone un día para cada una. Tú decides.</span>
    </div>
  );
}
