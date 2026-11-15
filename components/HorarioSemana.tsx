"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd, today } from "@/lib/dates";
import DayEditor from "./DayEditor";
import ArmarSemana from "./ArmarSemana";
import { areaColor } from "@/lib/types";
import { cssC } from "./ui";

/** La semana hora por hora: cada día con sus bloques. Está en Hoy, en la pestaña «Semana» */
export default function HorarioSemana() {
  const { eventos, planFor, dias, mode, offline } = useData();
  const [armando, setArmando] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /* El domingo por la tarde ya interesa la semana siguiente (revisión semanal) */
  const [off, setOff] = useState(() => (new Date().getDay() === 0 && new Date().getHours() >= 14 ? 1 : 0));
  const t = today();
  const mon = addD(mondayOf(t), off * 7);
  const a = pd(mon);
  const b = pd(addD(mon, 6));
  const days = Array.from({ length: 7 }, (_, i) => addD(mon, i));
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]}` : `${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]}`;
  const nLab = days.filter((x) => eventos[x]?.length).length;

  return (
    <>
      <div className="sem-nav">
        <p className="sem-rango">{rango}</p>
        <div className="wnav">
          <button className="ib" aria-label="Semana anterior" onClick={() => setOff(off - 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button className="btn ghost sm" onClick={() => setOff(0)} disabled={off === 0} title="Volver a esta semana">Esta semana</button>
          <button className="ib" aria-label="Semana siguiente" onClick={() => setOff(off + 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
      <div className="sem-ia">
        <p className="sub">{nLab ? `${nLab} día${nLab === 1 ? "" : "s"} con compromisos` : "Sin compromisos esta semana"}</p>
        {/* La IA organiza esta semana partiendo de tu semana tipo (solo las semanas que no han pasado) */}
        {mode === "cloud" && !offline && addD(mon, 6) >= t && (
          <button className="btn ghost sm sem-ia-btn" onClick={() => setArmando(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4l1.7 4.6a2 2 0 0 0 1.2 1.2L18.5 11.5l-4.6 1.7a2 2 0 0 0-1.2 1.2L11 19l-1.7-4.6a2 2 0 0 0-1.2-1.2L3.5 11.5l4.6-1.7a2 2 0 0 0 1.2-1.2zM18.5 3.5v3M17 5h3" /></svg>
            Armar mi semana con IA
          </button>
        )}
      </div>
      <div className="weekgrid">
        {days.map((x) => {
          const d = pd(x);
          const bloques = planFor(x).filter((bl) => bl.a !== "rutina");
          const head = (
            <>
              <b>{DOW[d.getDay()]} {d.getDate()}</b>
              {eventos[x]?.length ? <span className="pill">{eventos[x][0].t.split(" · ")[0]}</span> : null}
              {dias[x] && x >= t && <span className="pill mine">Editado</span>}
            </>
          );
          const cuerpo = bloques.map((bl) => (
            <div className="mini" key={bl.s + bl.t} style={cssC(areaColor(bl.a))}>
              <span>{bl.s}</span>
              <i>{bl.t}</i>
            </div>
          ));
          /* Los días que ya pasaron se pliegan: se abren tocándolos */
          if (x < t)
            return (
              <details className="card daypast" key={x}>
                <summary className="dayhead">
                  {head}
                  <span className="dp-n">{bloques.length} {bloques.length === 1 ? "bloque" : "bloques"}</span>
                  <svg className="dp-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </summary>
                {cuerpo}
              </details>
            );
          return (
            <div className="card" key={x}>
              <div className={`dayhead${x === t ? " today" : ""}`}>
                {head}
                <button className="edit" onClick={() => setEditing(x)} aria-label={`Editar ${DOW[d.getDay()]} ${d.getDate()}`}>Editar</button>
              </div>
              {cuerpo}
            </div>
          );
        })}
      </div>
      {editing && <DayEditor date={editing} onClose={() => setEditing(null)} />}
      {armando && <ArmarSemana lunes={mon} onClose={() => setArmando(false)} />}
    </>
  );
}
