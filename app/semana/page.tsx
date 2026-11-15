"use client";

import { useEffect, useState } from "react";
import Planner, { type Lado } from "@/components/Planner";
import { MES, addD, mondayOf, pd, today } from "@/lib/dates";

/** Semana: el planner de lo que te propones, con una pestaña para tu vida personal y otra para el trabajo */
export default function Semana() {
  const [lado, setLado] = useState<Lado>("personal");
  useEffect(() => {
    try {
      if (localStorage.getItem("mi-semana-lado") === "trabajo") setLado("trabajo");
    } catch {}
  }, []);
  const cambiar = (l: Lado) => {
    setLado(l);
    try {
      localStorage.setItem("mi-semana-lado", l);
    } catch {}
  };
  // El domingo por la tarde ya interesa la semana siguiente (revisión semanal)
  const [off, setOff] = useState(() => (new Date().getDay() === 0 && new Date().getHours() >= 14 ? 1 : 0));
  const t = today();
  const mon = addD(mondayOf(t), off * 7);
  const a = pd(mon);
  const b = pd(addD(mon, 6));
  const days = Array.from({ length: 7 }, (_, i) => addD(mon, i));
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]}` : `${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]}`;

  return (
    <>
      <h1>Semana</h1>
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
      <div className="sem-vista" role="tablist" aria-label="Qué parte de tu vida">
        <button role="tab" aria-selected={lado === "personal"} onClick={() => cambiar("personal")}>Personal</button>
        <button role="tab" aria-selected={lado === "trabajo"} onClick={() => cambiar("trabajo")}>Trabajo</button>
      </div>
      <Planner days={days} hoy={t} lado={lado} />
    </>
  );
}
