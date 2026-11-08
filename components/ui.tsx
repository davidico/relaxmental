"use client";

import { useData } from "@/lib/data";
import { addD, fdate, today } from "@/lib/dates";
import type { Bloque } from "@/lib/schedule";
import { AREAS, areaColor, type Habito, type Tarea } from "@/lib/types";
import { habitColor, sortHabits, streak } from "@/lib/habits";
import { toMin } from "@/lib/dates";
import { useFocus } from "./Shell";
import type { CSSProperties } from "react";

export const cssC = (c: string) => ({ "--c": c }) as CSSProperties;

export function Timeline({ date, minute }: { date: string; minute?: number }) {
  const { planFor } = useData();
  return (
    <div className="card">
      <div className="tl">
        {planFor(date).map((b: Bloque) => {
          const live = minute !== undefined;
          const past = live && toMin(b.e) <= minute;
          const cur = live && minute >= toMin(b.s) && minute < toMin(b.e);
          const cls = ["blk", b.a === "rutina" && "rut", b.church && "church", past && "past", cur && "cur"].filter(Boolean).join(" ");
          return (
            <div key={b.s + b.t} className={cls} style={cssC(areaColor(b.a))}>
              <div className="h">
                {b.s}
                <small>{b.e}</small>
              </div>
              <div className="b">
                <span className="dot" />
                <div>
                  <b>{b.t}</b>
                  {b.sub && <small>{b.sub}</small>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function toggleHecho(h: Habito, date: string): Habito {
  const hechos = { ...h.hechos };
  if (hechos[date]) delete hechos[date];
  else hechos[date] = true;
  return { ...h, hechos };
}

export function HabitChips({ date }: { date: string }) {
  const { habitos, save } = useData();
  if (!habitos.length) return <div className="card empty">Añade tus hábitos en la sección Hábitos.</div>;
  const list = sortHabits(habitos);
  const done = list.filter((h) => h.hechos[date]).length;
  return (
    <div className="card hlist">
      <div className="hprog">
        <span><b>{done}</b> de {list.length}</span>
        <span className="pbar" aria-hidden="true"><i style={{ width: `${(done / list.length) * 100}%` }} /></span>
      </div>
      {list.map((h) => {
        const on = !!h.hechos[date];
        const s = streak(h, date);
        return (
          <button key={h.id} className="hrow" style={cssC(habitColor(h, habitos))} aria-pressed={on} onClick={() => save("habitos", toggleHecho(h, date))}>
            <span className="hcheck" aria-hidden="true">✓</span>
            <span className="hdot" aria-hidden="true" />
            <span className="hlabel">{h.name}</span>
            {s > 0 && <span className="hstreak">{s} {s === 1 ? "día" : "días"}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const openTasks = (t: Tarea[]) => t.filter((x) => !x.done).sort((a, b) => ((a.due || "9") < (b.due || "9") ? -1 : 1));
/** Pendientes para hoy (incluye las atrasadas) y el resto */
export function splitTasks(t: Tarea[], day = today()) {
  const open = openTasks(t);
  return {
    hoy: open.filter((x) => x.due && x.due <= day),
    luego: open.filter((x) => !x.due || x.due > day),
  };
}

/** Elegir fecha rápido: Hoy / Mañana / Sin fecha / otra */
export function DueChoice({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const t = today();
  const m = addD(t, 1);
  const opts: [string, string][] = [[t, "Hoy"], [m, "Mañana"], ["", "Sin fecha"]];
  return (
    <div className="duechoice" role="group" aria-label="Cuándo">
      {opts.map(([v, l]) => (
        <button key={l} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
      <input id={id} type="date" aria-label="Otra fecha" value={value} onChange={(e) => onChange(e.target.value)} className={value && value !== t && value !== m ? "on" : ""} />
    </div>
  );
}

export function TaskRow({ x }: { x: Tarea }) {
  const { save, remove } = useData();
  const startFocus = useFocus();
  const t = today();
  return (
    <div className={`task${x.done ? " done" : ""}`}>
      <input type="checkbox" className="tcheck" id={`c-${x.id}`} checked={x.done} aria-label={x.done ? "Marcar como pendiente" : "Marcar como hecha"} onChange={(e) => save("tareas", { ...x, done: e.target.checked })} />
      <div className="tt">
        <label htmlFor={`c-${x.id}`} className="ttitle">{x.title}</label>
        {x.step && !x.done && <div className="step">{x.step}</div>}
        <div className="meta">
          {x.due && !x.done && x.due < t ? (
            <span className="chip late">Atrasada · {fdate(x.due)}</span>
          ) : x.due ? (
            <span className="chip" style={cssC(x.due === t ? "var(--sage)" : "var(--stone)")}>{x.due === t ? "Hoy" : fdate(x.due)}</span>
          ) : null}
          {x.area && x.area in AREAS && <span className="chip" style={cssC(areaColor(x.area))}>{AREAS[x.area as keyof typeof AREAS]}</span>}
          {!x.done && (
            <button className="startbtn" onClick={() => startFocus(x)} aria-label={`Empezar 10 minutos: ${x.title}`}>
              <span aria-hidden="true">▶</span> 10 min
            </button>
          )}
        </div>
      </div>
      <button className="x" aria-label={`Borrar tarea: ${x.title}`} onClick={() => remove("tareas", x.id)}>✕</button>
    </div>
  );
}
