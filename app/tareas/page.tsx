"use client";

import { useState } from "react";
import { useData, newId } from "@/lib/data";
import { AREAS, type Area } from "@/lib/types";
import { TaskRow, openTasks } from "@/components/ui";

export default function Tareas() {
  const { tareas, save } = useData();
  const [f, setF] = useState({ title: "", step: "", area: "trabajo" as Area, due: "" });
  const open = openTasks(tareas);
  const done = tareas.filter((x) => x.done);

  return (
    <>
      <h1>Tareas</h1>
      <p className="sub">Escribe siempre el primer paso: algo que puedas hacer en 2 minutos.</p>
      <div className="split">
        <div className="sticky">
          <h2>Nueva tarea</h2>
          <div className="card">
            <form
              className="add"
              onSubmit={(e) => {
                e.preventDefault();
                if (!f.title.trim()) return;
                save("tareas", { id: newId(), title: f.title.trim(), step: f.step.trim(), area: f.area, due: f.due, done: false, created: new Date().toISOString() });
                setF({ ...f, title: "", step: "", due: "" });
              }}
            >
              <input id="t-title" placeholder="Tarea (ej. Enviar candidatura)" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <input id="t-step" placeholder="Primer paso (ej. Abrir la oferta y leer requisitos)" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })} />
              <div className="row">
                <select id="t-area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as Area })}>
                  {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input id="t-due" type="date" aria-label="Fecha" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
              </div>
              <div><button className="btn" type="submit">Añadir tarea</button></div>
            </form>
          </div>
        </div>
        <div>
          <h2>Pendientes · {open.length}</h2>
          <div className="card">{open.length ? open.map((x) => <TaskRow key={x.id} x={x} />) : <div className="empty">Nada pendiente.</div>}</div>
          {done.length > 0 && (
            <>
              <h2>Hechas · {done.length}</h2>
              <div className="card">{done.map((x) => <TaskRow key={x.id} x={x} />)}</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
