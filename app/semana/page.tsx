"use client";

import { useEffect, useState } from "react";
import Planner from "@/components/Planner";
import PlanificarSemana from "@/components/PlanificarSemana";
import { MES, addD, mondayOf, pd, today } from "@/lib/dates";

/** Planner: la semana, día por día, con su parte de Trabajo y su parte Personal. Cada semana se planea primero (por metas o por días) */
export default function Semana() {
  // El domingo por la tarde ya interesa la semana siguiente (revisión semanal)
  const [off, setOff] = useState(() => (new Date().getDay() === 0 && new Date().getHours() >= 14 ? 1 : 0));
  /* El aviso de «Planifica tu semana» (y la tarjeta de Hoy) abren el Planner en la semana que toca: el domingo, la que viene */
  useEffect(() => {
    if (location.hash !== "#planificar") return;
    if (new Date().getDay() === 0) setOff(1);
    history.replaceState(null, "", location.pathname);
  }, []);
  const t = today();
  const mon = addD(mondayOf(t), off * 7);
  const a = pd(mon);
  const b = pd(addD(mon, 6));
  const days = Array.from({ length: 7 }, (_, i) => addD(mon, i));
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]}` : `${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]}`;

  return (
    <>
      <h1>Planner</h1>
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
      <PlanificarSemana donde="planner" lunesVisto={mon} />
      {/* Cada día, como en un planner de papel, con su parte de Trabajo (dorado) y su parte Personal (petróleo), los colores del logo */}
      <div className="plan">
        <Planner days={days} hoy={t} />
      </div>
    </>
  );
}
