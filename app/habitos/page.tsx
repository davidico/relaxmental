"use client";

import { useState } from "react";
import { useData, newId } from "@/lib/data";
import { MES, addD, fdate, mondayOf, pd, today } from "@/lib/dates";
import { habitColor, last30, sortHabits, streak } from "@/lib/habits";
import { useWide } from "@/lib/hooks";
import { AREAS, areaColor, type Area, type Habito } from "@/lib/types";
import { cssC, toggleHecho } from "@/components/ui";

/**
 * Mapa del hábito: empieza la semana en que lo creaste (o el primer día que lo marcaste)
 * y avanza hacia el futuro. Cuando hoy llega a la última columna, el mapa se desplaza.
 */
function Heat({ h, weeks, color }: { h: Habito; weeks: number; color: string }) {
  const t = today();
  const first = [h.created?.slice(0, 10) || t, ...Object.keys(h.hechos)].sort()[0];
  let start = mondayOf(first < t ? first : t);
  const latest = addD(mondayOf(t), -(weeks - 1) * 7);
  if (start < latest) start = latest; // hoy siempre dentro del mapa
  const end = addD(start, weeks * 7 - 1);
  const mes = (d: string) => `${MES[pd(d).getMonth()].slice(0, 3)} ${pd(d).getFullYear()}`;
  return (
    <div className="heat">
      <div className="hm" style={{ ...cssC(color), ["--w" as string]: weeks }}>
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = addD(start, i);
          const cls = [d > t ? "fut" : h.hechos[d] ? "on" : "", d === t ? "tdy" : ""].filter(Boolean).join(" ");
          return <i key={d} className={cls} title={fdate(d)} />;
        })}
      </div>
      <div className="hlegend">
        <span>{mes(start)}</span>
        <span>lunes arriba · domingo abajo</span>
        <span>{mes(end)}</span>
      </div>
    </div>
  );
}

export default function Habitos() {
  const { habitos, save, remove } = useData();
  const wide = useWide();
  const weeks = wide ? 24 : 18;
  const t = today();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [area, setArea] = useState<Area>("salud");
  const list = sortHabits(habitos);

  return (
    <>
      <h1>Hábitos</h1>
      <p className="sub">Pulsa «Hoy» cuando lo hagas. Cada cuadrito es un día: de color si lo cumpliste, clarito los que aún no llegan. Cada columna es una semana.</p>
      <div className="habgrid">
        {list.length ? (
          list.map((h) => {
            const on = !!h.hechos[t];
            const s = streak(h);
            return (
              <div className="card habit" key={h.id}>
                <div className="hhead">
                  <div className="hname">
                    {h.name}
                    <div className="hstats">
                      Racha <b>{s}</b> día{s === 1 ? "" : "s"} · <b>{last30(h)}</b>/30 en el último mes
                    </div>
                  </div>
                  <div className="row" style={{ flex: "none", gap: 6 }}>
                    <button className={`btn sm${on ? "" : " ghost"}`} aria-pressed={on} onClick={() => save("habitos", toggleHecho(h, t))}>
                      {on ? "Hecho ✓" : "Hoy"}
                    </button>
                    <button className="x" aria-label="Borrar hábito" onClick={() => setConfirm(h.id)}>✕</button>
                  </div>
                </div>
                {confirm === h.id && (
                  <div className="confirm">
                    ¿Borrar &quot;{h.name}&quot; y su historial?
                    <button className="btn sm warn" onClick={() => { remove("habitos", h.id); setConfirm(null); }}>Borrar</button>
                    <button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button>
                  </div>
                )}
                <Heat h={h} weeks={weeks} color={habitColor(h, habitos)} />
              </div>
            );
          })
        ) : (
          <div className="card empty">Todavía no tienes hábitos. Añade el primero abajo.</div>
        )}
      </div>
      <h2>Nuevo hábito</h2>
      <div className="card" style={{ maxWidth: 620 }}>
        <form
          className="add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            save("habitos", { id: newId(), name: name.trim(), area, orden: habitos.length, hechos: {}, created: new Date().toISOString() });
            setName("");
          }}
        >
          <div className="row">
            <input id="h-name" placeholder="Ej. Leer 1 capítulo" required value={name} onChange={(e) => setName(e.target.value)} />
            <select id="h-area" value={area} onChange={(e) => setArea(e.target.value as Area)}>
              {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><button className="btn" type="submit">Añadir hábito</button></div>
        </form>
      </div>
    </>
  );
}
