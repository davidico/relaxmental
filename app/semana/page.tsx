"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd, today } from "@/lib/dates";
import { preachesOn, rolesOn, scheduleFor } from "@/lib/schedule";
import { areaColor } from "@/lib/types";
import { cssC } from "@/components/ui";

export default function Semana() {
  const { labores } = useData();
  // El domingo por la tarde ya interesa la semana siguiente (revisión semanal)
  const [off, setOff] = useState(() => (new Date().getDay() === 0 && new Date().getHours() >= 14 ? 1 : 0));
  const t = today();
  const mon = addD(mondayOf(t), off * 7);
  const a = pd(mon);
  const b = pd(addD(mon, 6));
  const days = Array.from({ length: 7 }, (_, i) => addD(mon, i));

  return (
    <>
      <div className="top">
        <h1>Semana</h1>
        <div className="wnav">
          <button className="ib" aria-label="Semana anterior" onClick={() => setOff(off - 1)}>‹</button>
          <button className="btn ghost sm" onClick={() => setOff(0)}>Hoy</button>
          <button className="ib" aria-label="Semana siguiente" onClick={() => setOff(off + 1)}>›</button>
        </div>
      </div>
      <p className="sub">{a.getDate()} {MES[a.getMonth()]} – {b.getDate()} {MES[b.getMonth()]}</p>
      <div className="weekgrid">
        {days.map((x) => {
          const d = pd(x);
          return (
            <div className="card" key={x}>
              <div className={`dayhead${x === t ? " today" : ""}`}>
                <b>{DOW[d.getDay()]} {d.getDate()}</b>
                {preachesOn(labores, x) ? <span className="pill">Predicas</span> : rolesOn(labores, x).length ? <span className="pill">Culto</span> : <span className="pill free">Noche libre</span>}
              </div>
              {scheduleFor(labores, x)
                .filter((bl) => bl.a !== "rutina")
                .map((bl) => (
                  <div className="mini" key={bl.s + bl.t} style={cssC(areaColor(bl.a))}>
                    <span>{bl.s}</span>
                    <i>{bl.t}</i>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
