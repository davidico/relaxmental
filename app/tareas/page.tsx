"use client";

import { useEffect, useState } from "react";
import { useData, newId } from "@/lib/data";
import { today } from "@/lib/dates";
import { DueChoice, TaskRow, splitTasks } from "@/components/ui";

export default function Tareas() {
  const { tareas, save, hoy: dia } = useData();
  const [f, setF] = useState({ title: "", step: "", due: today() });
  /* Si la app quedó abierta pasada la medianoche, "hoy" pasa al día nuevo */
  useEffect(() => setF((x) => (x.due && x.due < dia ? { ...x, due: dia } : x)), [dia]);
  const { hoy, luego } = splitTasks(tareas);
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
                save("tareas", { id: newId(), title: f.title.trim(), step: f.step.trim(), due: f.due, done: false, created: new Date().toISOString() });
                setF({ ...f, title: "", step: "" });
              }}
            >
              <input id="t-title" placeholder="Qué hay que hacer" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <input id="t-step" placeholder="Primer paso de 2 minutos (opcional)" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })} />
              <DueChoice id="t-due" value={f.due} onChange={(due) => setF({ ...f, due })} />
              <div><button className="btn" type="submit">Añadir tarea</button></div>
            </form>
          </div>
        </div>
        <div>
          <h2>Para hoy · {hoy.length}</h2>
          <div className="card">{hoy.length ? hoy.map((x) => <TaskRow key={x.id} x={x} />) : <div className="empty">Nada para hoy. ¡Bien!</div>}</div>
          <h2>Te faltan · {luego.length}</h2>
          <div className="card">{luego.length ? luego.map((x) => <TaskRow key={x.id} x={x} />) : <div className="empty">No hay más tareas pendientes.</div>}</div>
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
