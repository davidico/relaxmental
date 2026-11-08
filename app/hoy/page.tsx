"use client";

import { useState } from "react";
import { useData, newId } from "@/lib/data";
import { DOW, MES, ds, toMin } from "@/lib/dates";
import { nowInfo, preachesOn, rolesOn } from "@/lib/schedule";
import { KINDS, type Kind } from "@/lib/types";
import { useNow, submitOnCtrlEnter } from "@/lib/hooks";
import { HabitChips, TaskRow, Timeline, openTasks } from "@/components/ui";
import DayEditor from "@/components/DayEditor";

export default function Hoy() {
  const { labores, tareas, save, planFor } = useData();
  const now = useNow();
  const t = ds(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const { cur, nxt } = nowInfo(planFor(t), minute);
  const r = rolesOn(labores, t);
  const pend = openTasks(tareas).slice(0, 3);
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  let nowCard;
  if (cur) {
    const pct = Math.round(((minute - toMin(cur.s)) / (toMin(cur.e) - toMin(cur.s))) * 100);
    nowCard = (
      <div className="now">
        <span className="lbl">Ahora · hasta las {cur.e}</span>
        <b>{cur.t}</b>
        {cur.sub && <small>{cur.sub}</small>}
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        {nxt && <div className="next">Después: {nxt.s} · {nxt.t}</div>}
      </div>
    );
  } else if (nxt) {
    nowCard = (
      <div className="now">
        <span className="lbl">Siguiente · {nxt.s}</span>
        <b>{nxt.t}</b>
        {nxt.sub && <small>{nxt.sub}</small>}
      </div>
    );
  } else {
    nowCard = (
      <div className="now">
        <span className="lbl">Día terminado</span>
        <b>Buen trabajo. A descansar.</b>
      </div>
    );
  }

  return (
    <>
      <h1>{DOW[now.getDay()]} {now.getDate()} de {MES[now.getMonth()]}</h1>
      <p className="sub">{preachesOn(labores, t) ? "Hoy predicas." : r.length ? `Culto hoy: ${r.join(", ")}.` : "Hoy no tienes labor en la iglesia."}</p>
      <div className="hoy">
        <div className="a-now">{nowCard}</div>
        <div className="side">
          <div className="a-hab">
            <h2>Hábitos de hoy</h2>
            <HabitChips date={t} />
          </div>
          <div className="a-tasks">
            <h2>Tareas pendientes</h2>
            <div className="card">{pend.length ? pend.map((x) => <TaskRow key={x.id} x={x} />) : <div className="empty">No tienes tareas pendientes.</div>}</div>
          </div>
          <div className="a-quick">
            <h2>Captura rápida</h2>
            <div className="card">
              <form
                className="add"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  save("notas", { id: newId(), kind, title: "", text: text.trim(), ref: "", created: new Date().toISOString() });
                  setText("");
                }}
              >
                <select id="k-kind" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <textarea id="k-text" required style={{ minHeight: 70 }} placeholder="Una idea, una profecía, algo que no quieres olvidar…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={submitOnCtrlEnter} />
                <div>
                  <button className="btn" type="submit">Guardar en el cerebro</button>
                  <span className="kbd">Ctrl + Enter</span>
                </div>
              </form>
            </div>
          </div>
        </div>
        <div className="a-tl">
          <div className="top" style={{ alignItems: "center" }}>
            <h2>Tu día hora por hora</h2>
            <button className="btn ghost sm" onClick={() => setEditing(true)}>Editar hoy</button>
          </div>
          <Timeline date={t} minute={minute} />
        </div>
      </div>
      {editing && <DayEditor date={t} onClose={() => setEditing(false)} />}
    </>
  );
}
