"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd, today } from "@/lib/dates";
import { preachesOn, rolesOn } from "@/lib/schedule";
import DayEditor from "@/components/DayEditor";
import { areaColor } from "@/lib/types";
import { cssC } from "@/components/ui";

export default function Semana() {
  const { labores, planFor, dias } = useData();
  const [editing, setEditing] = useState<string | null>(null);
  // El domingo por la tarde ya interesa la semana siguiente (revisión semanal)
  const [off, setOff] = useState(() => (new Date().getDay() === 0 && new Date().getHours() >= 14 ? 1 : 0));
  const t = today();
  const mon = addD(mondayOf(t), off * 7);
  const a = pd(mon);
  const b = pd(addD(mon, 6));
  const days = Array.from({ length: 7 }, (_, i) => addD(mon, i));
  const rango =
    a.getMonth() === b.getMonth()
      ? `Semana del ${a.getDate()} al ${b.getDate()} de ${MES[b.getMonth()]}`
      : `Semana del ${a.getDate()} de ${MES[a.getMonth()]} al ${b.getDate()} de ${MES[b.getMonth()]}`;
  const rel = off === 0 ? "Esta semana" : off === 1 ? "Próxima" : off === -1 ? "Anterior" : "Volver a hoy";
  const nLab = days.filter((x) => rolesOn(labores, x).length).length;
  const pred = days
    .filter((x) => preachesOn(labores, x))
    .map((x) => `el ${DOW[pd(x).getDay()].toLowerCase()} ${pd(x).getDate()}`)
    .join(" y ");

  return (
    <>
      <div className="top">
        <h1>{rango}</h1>
        <div className="wnav">
          <button className="ib" aria-label="Semana anterior" onClick={() => setOff(off - 1)}>‹</button>
          <button className={`btn sm${off === 0 ? "" : " ghost"}`} onClick={() => setOff(0)} title="Volver a esta semana">{rel}</button>
          <button className="ib" aria-label="Semana siguiente" onClick={() => setOff(off + 1)}>›</button>
        </div>
      </div>
      <p className="sub">{nLab} día{nLab === 1 ? "" : "s"} con labor en la iglesia{pred ? ` · predicas ${pred}` : ""}</p>
      <div className="weekgrid">
        {days.map((x) => {
          const d = pd(x);
          const bloques = planFor(x).filter((bl) => bl.a !== "rutina");
          const head = (
            <>
              <b>{DOW[d.getDay()]} {d.getDate()}</b>
              {preachesOn(labores, x) ? <span className="pill">Predicas</span> : rolesOn(labores, x).length ? <span className="pill">Culto</span> : <span className="pill free">Noche libre</span>}
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
    </>
  );
}
