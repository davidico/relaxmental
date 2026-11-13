"use client";

import { useEffect, useState } from "react";
import Planner from "@/components/Planner";
import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd, today } from "@/lib/dates";

import DayEditor from "@/components/DayEditor";
import { areaColor } from "@/lib/types";
import { cssC } from "@/components/ui";

export default function Semana() {
  const { eventos, planFor, dias } = useData();
  const [editing, setEditing] = useState<string | null>(null);
  /* Dos vistas: el planner (lo que te propones) y el horario hora por hora */
  const [vista, setVista] = useState<"planner" | "horario">("planner");
  useEffect(() => {
    try {
      if (localStorage.getItem("mi-semana-vista") === "horario") setVista("horario");
    } catch {}
  }, []);
  const cambiarVista = (v: "planner" | "horario") => {
    setVista(v);
    try {
      localStorage.setItem("mi-semana-vista", v);
    } catch {}
  };
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
  const nLab = days.filter((x) => eventos[x]?.length).length;

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
      <div className="sem-vista" role="tablist" aria-label="Cómo ver la semana">
        <button role="tab" aria-selected={vista === "planner"} onClick={() => cambiarVista("planner")}>Planner</button>
        <button role="tab" aria-selected={vista === "horario"} onClick={() => cambiarVista("horario")}>Horario</button>
      </div>
      {vista === "planner" ? (
        <Planner days={days} hoy={t} />
      ) : (
      <>
      <p className="sub">{nLab ? `${nLab} día${nLab === 1 ? "" : "s"} con compromisos` : "Sin compromisos esta semana"}</p>
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
      </>
      )}
      {editing && <DayEditor date={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
