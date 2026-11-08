"use client";

import { useData } from "@/lib/data";
import { fdate } from "@/lib/dates";
import type { Bloque } from "@/lib/schedule";
import { AREAS, areaColor, type Habito, type Tarea } from "@/lib/types";
import { sortHabits } from "@/lib/habits";
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
  if (!habitos.length) return <div className="empty">Añade tus hábitos en la sección Hábitos.</div>;
  return (
    <div className="hchips">
      {sortHabits(habitos).map((h) => (
        <button key={h.id} className="hc" style={cssC(areaColor(h.area))} aria-pressed={!!h.hechos[date]} onClick={() => save("habitos", toggleHecho(h, date))}>
          {h.name}
        </button>
      ))}
    </div>
  );
}

export const openTasks = (t: Tarea[]) => t.filter((x) => !x.done).sort((a, b) => ((a.due || "9") < (b.due || "9") ? -1 : 1));

export function TaskRow({ x }: { x: Tarea }) {
  const { save, remove } = useData();
  const startFocus = useFocus();
  return (
    <div className={`task${x.done ? " done" : ""}`}>
      <input type="checkbox" id={`c-${x.id}`} checked={x.done} aria-label="Hecha" onChange={(e) => save("tareas", { ...x, done: e.target.checked })} />
      <div className="tt">
        <b>{x.title}</b>
        {x.step && <div className="step">{x.step}</div>}
        <div className="meta">
          <span className="chip" style={cssC(areaColor(x.area))}>{AREAS[x.area as keyof typeof AREAS] ?? "Casa"}</span>
          {x.due && <span className="chip" style={cssC("var(--muted)")}>{fdate(x.due)}</span>}
          {!x.done && (
            <button className="btn ghost sm" onClick={() => startFocus(x)}>
              Empezar 10 min
            </button>
          )}
        </div>
      </div>
      <button className="x" aria-label="Borrar tarea" onClick={() => remove("tareas", x.id)}>
        ✕
      </button>
    </div>
  );
}
