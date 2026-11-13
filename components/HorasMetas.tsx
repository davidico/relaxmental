"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { useNow } from "@/lib/hooks";
import type { Tarea } from "@/lib/types";

type Propuesta = { id: string; s: string; e: string };
const KEY = (d: string) => `mi-semana-horas-${d}`;

/**
 * Metas de hoy sin hora: la IA mira tu itinerario y te propone cuándo trabajar en cada una.
 * Tú aceptas cada bloque; al aceptarlo entra en tu itinerario.
 */
export default function HorasMetas({ day, metas }: { day: string; metas: Tarea[] }) {
  const { mode, offline, planFor, perfil, save } = useData();
  const now = useNow();
  const [cerrado, setCerrado] = useState(true);
  const [estado, setEstado] = useState<"" | "pensando" | "error" | "nada">("");
  const [props, setProps] = useState<Propuesta[]>([]);
  useEffect(() => {
    try {
      setCerrado(localStorage.getItem(KEY(day)) === "1");
    } catch {
      setCerrado(false);
    }
  }, [day]);
  const sinHora = metas.filter((x) => !x.done && !x.hora);
  const vivas = props.filter((p) => sinHora.some((x) => x.id === p.id));
  if (mode !== "cloud" || offline || cerrado || (!sinHora.length && !vivas.length) || now.getHours() >= 20) return null;

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
          ahora: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
          metas: sinHora.map((x) => ({ id: x.id, t: x.title, lado: x.lado === "trabajo" ? "trabajo" : "personal" })),
          bloques: planFor(day).map((b) => `${b.s}-${b.e} ${b.t}${b.tarea ? " (tarea/meta ya puesta)" : ""}`),
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
    if (x) save("tareas", { ...x, hora: p.s, fin: p.e });
  };
  const titulo = (id: string) => sinHora.find((x) => x.id === id)?.title ?? "";

  return (
    <div className="hm-box" role="group" aria-labelledby="hm-h">
      <h3 id="hm-h" className="hm-h">¿Cuándo trabajas en tus metas?</h3>
      {vivas.length ? (
        <>
          <p className="hm-p">Mirando tu día, te propongo:</p>
          <ul className="hm-l">
            {vivas.map((p) => (
              <li key={p.id}>
                <span className="hm-t">
                  <b>{p.s}–{p.e}</b> {titulo(p.id)}
                </span>
                <span className="hm-b">
                  <button className="btn sm" onClick={() => aceptar(p)} aria-label={`Sí, poner ${titulo(p.id)} de ${p.s} a ${p.e}`}>Sí</button>
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
          <p className="hm-p">
            {sinHora.length === 1 ? "1 meta no tiene hora" : `${sinHora.length} metas no tienen hora`}. Miro tu itinerario y te propongo un hueco para cada una.
          </p>
          {estado === "error" && <p className="verr" role="alert">⚠ No pude proponerlo ahora. Inténtalo otra vez.</p>}
          {estado === "nada" && <p role="status">Hoy no veo huecos libres. Puedes ponerles hora en tu planner.</p>}
          <div className="row actions">
            <button className="btn sm" onClick={pedir} disabled={estado === "pensando"}>
              {estado === "pensando" ? "Mirando tu día…" : "Proponme horas"}
            </button>
            <button className="btn ghost sm" onClick={cerrar}>Ahora no</button>
          </div>
        </>
      )}
    </div>
  );
}
