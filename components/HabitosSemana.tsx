"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd } from "@/lib/dates";
import { cantidad, conUnidad, num, sortHabits, tipoDe, total } from "@/lib/habits";
import type { Habito } from "@/lib/types";
import { toggleHecho } from "./ui";
import HabitoAnotar from "./HabitoAnotar";

const LETRAS = ["L", "M", "M", "J", "V", "S", "D"];

/** Todos los hábitos en una semana: una fila por hábito, un círculo por día (se pueden marcar los días pasados) */
export default function HabitosSemana({ onAbrir }: { onAbrir: (id: string) => void }) {
  const { habitos, save, hoy } = useData();
  const [off, setOff] = useState(0);
  const [anotando, setAnotando] = useState<{ h: Habito; dia: string } | null>(null);
  const lunes = addD(mondayOf(hoy), off * 7);
  const dias = Array.from({ length: 7 }, (_, i) => addD(lunes, i));
  const a = pd(lunes);
  const b = pd(dias[6]);
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]}` : `${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]}`;
  const lista = sortHabits(habitos);

  return (
    <div className="hs">
      <div className="sem-nav">
        <p className="sem-rango">{rango}</p>
        <div className="wnav">
          <button className="ib" aria-label="Semana anterior" onClick={() => setOff(off - 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button className="btn ghost sm" onClick={() => setOff(0)} disabled={off === 0}>Esta semana</button>
          <button className="ib" aria-label="Semana siguiente" disabled={off >= 0} onClick={() => setOff(off + 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
      {lista.length ? (
        <div className="card hs-tabla">
          <div className="hs-dias" aria-hidden="true">
            {dias.map((d, i) => (
              <span key={d} className={d === hoy ? "hs-hoy" : undefined}>
                {LETRAS[i]}
                <b>{pd(d).getDate()}</b>
              </span>
            ))}
          </div>
          {lista.map((h) => {
            const tipo = tipoDe(h);
            const hechos = dias.filter((d) => h.hechos[d]).length;
            return (
              <div className="hs-fila" key={h.id} role="group" aria-label={h.name}>
                <div className="hs-nombre">
                  <button className="hs-abrir" onClick={() => onAbrir(h.id)} aria-label={`Ver el mes de ${h.name}`}>
                    {h.name}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                  <span className="hs-suma">{tipo === "medible" ? conUnidad(h, total(h, dias[0], dias[6])) : `${hechos} de 7`}</span>
                </div>
                <div className="hs-celdas">
                  {dias.map((d) => {
                    const c = cantidad(h, d);
                    const on = !!h.hechos[d];
                    const etq = `${DOW[pd(d).getDay()]} ${pd(d).getDate()}`;
                    return tipo === "medible" ? (
                      <button key={d} className={`hs-c num${on ? " on" : c ? " parte" : ""}`} disabled={d > hoy} aria-label={`${etq}: ${c ? conUnidad(h, c) : "sin anotar"}`} onClick={() => setAnotando({ h, dia: d })}>
                        {c ? num(c) : ""}
                      </button>
                    ) : (
                      <button key={d} className={`hs-c${on ? " on" : ""}`} disabled={d > hoy} aria-pressed={on} aria-label={`${etq}: ${on ? (tipo === "dejar" ? "lo lograste" : "hecho") : "sin marcar"}`} onClick={() => save("habitos", toggleHecho(h, d))}>
                        {on && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card empty">Todavía no tienes hábitos. Añade el primero en «Mis hábitos».</div>
      )}
      {anotando && <HabitoAnotar h={habitos.find((x) => x.id === anotando.h.id) ?? anotando.h} dia={anotando.dia} onClose={() => setAnotando(null)} />}
    </div>
  );
}
