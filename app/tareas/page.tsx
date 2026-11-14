"use client";

import { useData } from "@/lib/data";
import { TaskRow, splitTasks } from "@/components/ui";

export default function Tareas() {
  const { tareas } = useData();
  const { hoy, luego } = splitTasks(tareas);
  const done = tareas.filter((x) => x.done);

  return (
    <>
      <h1>Tareas</h1>
      <p className="sub">Escribe siempre el primer paso: algo que puedas hacer en 2 minutos.</p>
      <button className="btn ts-open" onClick={() => dispatchEvent(new Event("mi-semana:nueva-tarea"))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> Nueva tarea
      </button>
      <div>
          <h2 className="banda">Para hoy · {hoy.length}</h2>
          <div className="card">{hoy.length ? hoy.map((x) => <TaskRow key={x.id} x={x} />) : <div className="empty">Nada para hoy. ¡Bien!</div>}</div>
          <h2 className="banda">Próximas · {luego.length}</h2>
          <div className="card">{luego.length ? luego.map((x) => <TaskRow key={x.id} x={x} />) : <div className="empty">No hay más tareas pendientes.</div>}</div>
          {done.length > 0 && (
            <>
              <h2 className="banda">Hechas · {done.length}</h2>
              <div className="card">{done.map((x) => <TaskRow key={x.id} x={x} />)}</div>
            </>
          )}
      </div>
    </>
  );
}
