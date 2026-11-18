"use client";

import { useData } from "@/lib/data";
import { AVISOS_DEF, leerAvisos, type Avisos as Cfg } from "@/lib/avisos";
import { usePush } from "@/lib/push";
import HoraInput from "./HoraInput";

/**
 * «Avisos» (en tu cuenta): qué te avisa la app y a qué hora. Los de tu día (cada momento, las tareas con hora y lo que quedó
 * sin hacer) salen siempre; aquí se encienden, apagan y cambian de hora los recordatorios: buenos días, hábitos, diario y planificar.
 * Se guarda en `perfil/avisos` y lo lee el Worker cada minuto.
 */
export default function Avisos() {
  const { perfil, savePerfil } = useData();
  const { st, activar } = usePush();
  const cfg = leerAvisos(perfil.avisos);
  const poner = (k: keyof Cfg, p: Partial<Cfg["habitos"]>) => savePerfil("avisos", { ...cfg, [k]: { ...cfg[k], ...p } });
  const FILAS: { k: keyof Cfg; titulo: string; txt: string; cuando?: string }[] = [
    { k: "manana", titulo: "Buenos días", txt: "Al empezar tu día te digo con qué empiezas y cuántas tareas y metas tienes hoy." },
    { k: "habitos", titulo: "Hábitos", txt: "Si a esa hora te queda algún hábito sin marcar, te los recuerdo. Si ya los marcaste todos, no te aviso." },
    { k: "diario", titulo: "Diario", txt: "Si a esa hora aún no has escrito tu diario de hoy, te lo recuerdo." },
    { k: "planificar", titulo: "Planificar la semana", txt: "Los domingos te recuerdo planificar la semana que viene en tu Planner. Si ya la marcaste como planificada, no te aviso.", cuando: "Los domingos a las" },
  ];

  return (
    <>
      {st !== "on" && st !== "hidden" && (
        <div className="card pad av-activar" role={st === "denied" || st === "error" ? "alert" : "status"}>
          <p>
            {st === "denied"
              ? "⚠ Las notificaciones están bloqueadas en este dispositivo. Actívalas en los ajustes del teléfono: Ajustes → Apps → Mi Semana (o Chrome) → Notificaciones."
              : st === "error"
                ? "⚠ No se pudieron activar los avisos. Revisa tu conexión e inténtalo otra vez."
                : "En este dispositivo los avisos están apagados."}
          </p>
          {st !== "denied" && (
            <button className="btn" onClick={activar} disabled={st === "working"}>{st === "working" ? "Activando…" : "Activar avisos aquí"}</button>
          )}
        </div>
      )}

      <h2 className="banda">Recordatorios</h2>
      <section className="card av-lista" aria-label="Recordatorios">
        {FILAS.map(({ k, titulo, txt, cuando }) => (
          <div key={k} className="av-fila">
            <div className="av-txt">
              <label htmlFor={`av-${k}`} className="av-t">{titulo}</label>
              <p id={`av-${k}-d`}>{txt}</p>
            </div>
            <input id={`av-${k}`} type="checkbox" role="switch" className="av-sw" checked={cfg[k].on} aria-describedby={`av-${k}-d`} onChange={(e) => poner(k, { on: e.target.checked })} />
            {cfg[k].on && k === "manana" && !cfg.manana.hora && (
              <div className="av-hora">
                <span>Con tu primer momento del día</span>
                <button type="button" className="linkbtn" onClick={() => poner("manana", { hora: "07:00" })}>Elegir una hora</button>
              </div>
            )}
            {cfg[k].on && (k !== "manana" || !!cfg.manana.hora) && (
              <div className="av-hora">
                <span>{cuando ?? "A las"}</span>
                <HoraInput id={`av-${k}-h`} label={`Hora del recordatorio de ${titulo.toLowerCase()}`} value={cfg[k].hora} onChange={(hora) => poner(k, { hora: hora || AVISOS_DEF[k].hora })} />
                {k === "manana" && <button type="button" className="linkbtn" onClick={() => poner("manana", { hora: "" })}>Con mi primer momento</button>}
              </div>
            )}
          </div>
        ))}
      </section>

      <h2 className="banda">Los de tu día</h2>
      <section className="card pad av-info" aria-label="Avisos de tu día">
        <p>Estos salen solos, siguiendo tu horario:</p>
        <ul>
          <li>Al empezar cada momento de tu día: solo lo que toca ahora (su nombre, lo que hay que hacer dentro y hasta qué hora). El de levantarte es tu despertador.</li>
          <li>A la hora de una tarea que tiene hora.</li>
          <li>Cuando termina un momento y le quedaron cosas sin hacer: ese vibra más y se queda en pantalla.</li>
        </ul>
        <p className="hint">Que suenen o no con el teléfono en silencio o en «No molestar» depende de los ajustes de tu teléfono.</p>
      </section>
    </>
  );
}
