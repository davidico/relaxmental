"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { useNow } from "@/lib/hooks";
import { esMeta } from "@/lib/types";
import { bloqueDeSub } from "@/lib/momentos";

type Propuesta = { id: string; s?: string; e?: string; momento?: string };
const KEY = (d: string) => `mi-semana-horas-${d}`;

/**
 * Las metas de un día sin hora (hoy y los que vienen). Las metas no son tareas para tachar: son en lo que quieres avanzar,
 * así que salen aquí, aparte, y la IA mira tu día y te propone cuándo trabajar en cada una. Al aceptar, entra en tu día con su hora.
 */
export default function HorasMetas({ day, hoy }: { day: string; hoy: string }) {
  const { mode, offline, planFor, perfil, save, tareas } = useData();
  const now = useNow();
  const [cerrado, setCerrado] = useState(true);
  const [estado, setEstado] = useState<"" | "pensando" | "error" | "nada">("");
  const [props, setProps] = useState<Propuesta[]>([]);
  useEffect(() => {
    setProps([]);
    setEstado("");
    try {
      setCerrado(localStorage.getItem(KEY(day)) === "1");
    } catch {
      setCerrado(false);
    }
  }, [day]);
  const bloques = planFor(day);
  const sinHora = tareas.filter((x) => x.due === day && esMeta(x) && !x.done && !x.hora && !(x.momento && bloqueDeSub(x.momento, bloques)));
  const vivas = props.filter((p) => sinHora.some((x) => x.id === p.id));
  if (day < hoy || cerrado || (!sinHora.length && !vivas.length)) return null;
  const puede = mode === "cloud" && !offline && (day > hoy || now.getHours() < 21);

  const cerrar = () => {
    setCerrado(true);
    try {
      localStorage.setItem(KEY(day), "1");
    } catch {}
  };
  const pedir = async () => {
    setEstado("pensando");
    try {
      const r = await fetch("/api/ai/metas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fecha: day,
          ahora: day === hoy ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "00:00",
          metas: sinHora.map((x) => ({ id: x.id, t: x.title, lado: x.lado === "trabajo" ? "trabajo" : "personal" })),
          bloques: bloques.map((b) => `${b.s}-${b.e} ${b.t}${b.tarea ? " (tarea/meta ya puesta)" : ` [${b.s}|${b.t}]`}`),
          reglas: perfil.reglas?.text ?? "",
        }),
      });
      if (!r.ok) throw new Error();
      const { propuestas } = (await r.json()) as { propuestas: Propuesta[] };
      setProps(propuestas ?? []);
      setEstado(propuestas?.length ? "" : "nada");
    } catch {
      setEstado("error");
    }
  };
  const aceptar = (p: Propuesta) => {
    const x = sinHora.find((m) => m.id === p.id);
    if (!x) return;
    const { hora: _h, fin: _f, momento: _m, ...resto } = x;
    /* Dentro de un momento del día (sale debajo de él en la línea) o con su hora */
    save("tareas", p.momento ? { ...resto, momento: p.momento } : { ...resto, hora: p.s, fin: p.e });
  };
  const titulo = (id: string) => sinHora.find((x) => x.id === id)?.title ?? "";

  return (
    <section className="hy-sec" aria-labelledby="hm-h">
      <div className="hy-sechead">
        <h2 id="hm-h" className="hy-h">{day === hoy ? "Tus metas de hoy" : "Metas de este día"}</h2>
      </div>
      <div className="hm-box">
        {vivas.length ? (
          <>
            <p className="hm-p">Mirando tu día, te propongo:</p>
            <ul className="hm-l">
              {vivas.map((p) => (
                <li key={p.id}>
                  <span className="hm-t">
                    <b>{p.momento ? `En «${p.momento.slice(p.momento.indexOf("|") + 1)}»` : `${p.s}–${p.e}`}</b> {titulo(p.id)}
                  </span>
                  <span className="hm-b">
                    <button className="btn sm" onClick={() => aceptar(p)} aria-label={`Sí, poner ${titulo(p.id)} ${p.momento ? `dentro de ${p.momento.slice(p.momento.indexOf("|") + 1)}` : `de ${p.s} a ${p.e}`}`}>Sí</button>
                    <button className="btn ghost sm" onClick={() => setProps((xs) => xs.filter((y) => y.id !== p.id))} aria-label={`No: ${titulo(p.id)}`}>No</button>
                  </span>
                </li>
              ))}
            </ul>
            {vivas.length > 1 && (
              <button className="linkbtn" onClick={() => vivas.forEach(aceptar)}>
                Sí a todas
              </button>
            )}
          </>
        ) : (
          <>
            <ul className="hm-metas">
              {sinHora.map((x) => (
                <li key={x.id} className={x.lado === "trabajo" ? "trabajo" : "personal"}>
                  <span className="hm-punto" aria-hidden="true" />
                  <span>{x.title}</span>
                  <span className="sr-only">{x.lado === "trabajo" ? " (trabajo)" : " (personal)"}</span>
                </li>
              ))}
            </ul>
            <p className="hm-p">{sinHora.length === 1 ? "Aún no tiene hora." : "Aún no tienen hora."} {puede ? (sinHora.length === 1 ? "Miro tu día y te propongo cuándo trabajar en ella." : "Miro tu día y te propongo cuándo trabajar en cada una.") : ""}</p>
            {estado === "error" && <p className="verr" role="alert">⚠ No pude proponerlo ahora. Inténtalo otra vez.</p>}
            {estado === "nada" && <p role="status">No veo huecos libres ese día. Puedes ponerles hora en el Planner.</p>}
            <div className="row actions">
              {puede && (
                <button className="btn sm" onClick={pedir} disabled={estado === "pensando"}>
                  {estado === "pensando" ? "Mirando tu día…" : "Proponme horas"}
                </button>
              )}
              <button className="btn ghost sm" onClick={cerrar}>Ahora no</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
