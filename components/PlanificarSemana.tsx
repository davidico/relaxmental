"use client";

import Link from "next/link";
import { useData } from "@/lib/data";
import { MES, addD, pd } from "@/lib/dates";
import { semanaPorPlanificar } from "@/lib/avisos";

/**
 * «Planifica tu semana»: el domingo (y el lunes, si quedó pendiente) recuerda poner en el Planner las metas y tareas de la semana.
 * Queda pendiente hasta que la persona toca «Listo, ya la planifiqué» en el Planner (`perfil/semanaPlanificada` = el lunes de esa semana);
 * entonces sale como hecho. Los domingos, a la hora elegida en Avisos, el Worker manda además una notificación si sigue pendiente.
 * - En Hoy (`donde="hoy"`): una tarjeta que lleva al Planner.
 * - En el Planner (`donde="planner"`): el aviso con el botón para marcarla, solo cuando se está viendo esa semana.
 */
export default function PlanificarSemana({ donde, lunesVisto }: { donde: "hoy" | "planner"; lunesVisto?: string }) {
  const { perfil, savePerfil, hoy, mode } = useData();
  const lunes = semanaPorPlanificar(hoy, pd(hoy).getDay());
  if (mode === "loading" || !lunes) return null;
  const hecha = perfil.semanaPlanificada === lunes;
  const a = pd(lunes);
  const b = pd(addD(lunes, 6));
  /* Para decir «del 16 al 22 de noviembre» */
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()} al ${b.getDate()} de ${MES[b.getMonth()]}` : `${a.getDate()} de ${MES[a.getMonth()]} al ${b.getDate()} de ${MES[b.getMonth()]}`;

  if (donde === "planner") {
    if (lunesVisto !== lunes) return null;
    return hecha ? (
      <p className="ps-hecha" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        Semana planificada.{" "}
        <button type="button" className="linkbtn" onClick={() => savePerfil("semanaPlanificada", null)}>Deshacer</button>
      </p>
    ) : (
      <section className="card pad hy-aviso ps" aria-labelledby="ps-h">
        <h2 id="ps-h" className="hy-h">Planifica tu semana</h2>
        <p>Pon las metas y tareas de cada día, del {rango}: primero lo personal y luego el trabajo. Cuando termines, márcalo aquí.</p>
        <div className="row actions">
          <button className="btn" onClick={() => savePerfil("semanaPlanificada", lunes)}>Listo, ya la planifiqué</button>
        </div>
      </section>
    );
  }

  /* En Hoy: pendiente (con el enlace al Planner) o hecho */
  return hecha ? (
    <p className="ps-hecha" role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      Ya planificaste la semana del {rango}.
    </p>
  ) : (
    <section className="card pad hy-aviso ps" aria-labelledby="ps-h">
      <h2 id="ps-h" className="hy-h">Planificar la semana</h2>
      <p>Te toca poner las metas y tareas de la semana del {rango}. Se marca como hecho cuando lo termines en tu Planner.</p>
      <div className="row actions">
        <Link className="btn" href="/semana#planificar">Abrir mi Planner</Link>
      </div>
    </section>
  );
}
