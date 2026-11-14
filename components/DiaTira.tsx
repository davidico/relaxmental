"use client";

import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd, toMin } from "@/lib/dates";
import type { Bloque } from "@/lib/plan";

const dur = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
/** Cómo se guarda que un bloque del horario está hecho: por su hora de inicio y su nombre */
const clave = (b: Bloque) => `${b.s}|${b.t}`;

/** La semana en una tira: tocas un día y ves ese día */
export function SemanaTira({ dia, hoy, onElegir }: { dia: string; hoy: string; onElegir: (d: string) => void }) {
  const lunes = mondayOf(dia);
  return (
    <nav className="st" aria-label="Días de la semana">
      {Array.from({ length: 7 }, (_, i) => addD(lunes, i)).map((d) => {
        const f = pd(d);
        return (
          <button
            key={d}
            className={d === hoy ? "st-hoy" : undefined}
            aria-pressed={d === dia}
            aria-current={d === hoy ? "date" : undefined}
            aria-label={`${DOW[f.getDay()]} ${f.getDate()} de ${MES[f.getMonth()]}${d === hoy ? ", hoy" : ""}`}
            onClick={() => onElegir(d)}
          >
            <span className="st-d" aria-hidden="true">{DOW[f.getDay()].slice(0, 3).toLowerCase()}</span>
            <span className="st-n" aria-hidden="true">{f.getDate()}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * El día en una línea de tiempo: cada bloque con su hora y un círculo para decir «lo hice».
 * Entre bloques, el tiempo libre con «Planificar». Las metas y tareas con hora van aquí también.
 * `minuto` es el minuto actual si el día es hoy; -1 si es un día futuro; 1440 si ya pasó.
 */
export function Tira({ dia, blocks, minuto, onEditar }: { dia: string; blocks: Bloque[]; minuto: number; onEditar: () => void }) {
  const { perfil, savePerfil, tareas, save, hoy } = useData();
  const hechos = new Set(perfil.hechos?.[dia] ?? []);
  const estaHecho = (b: Bloque) => (b.tarea ? !!b.hecha : hechos.has(clave(b)));
  const marcar = (b: Bloque) => {
    if (b.tarea) {
      const t = tareas.find((x) => x.id === b.tarea);
      if (t) save("tareas", { ...t, done: !t.done });
      return;
    }
    const k = clave(b);
    const lista = hechos.has(k) ? [...hechos].filter((x) => x !== k) : [...hechos, k];
    /* Se guardan los últimos 45 días */
    const desde = addD(hoy, -45);
    const todos = Object.fromEntries(Object.entries({ ...(perfil.hechos ?? {}), [dia]: lista }).filter(([f, xs]) => f >= desde && xs.length));
    savePerfil("hechos", todos);
  };
  const planificar = (hora: string) => dispatchEvent(new CustomEvent("mi-semana:nueva-tarea", { detail: { due: dia, hora } }));
  const nHechos = blocks.filter(estaHecho).length;
  const esHoy = minuto >= 0 && minuto < 1440;

  return (
    <section className="hy-sec tr-sec" aria-labelledby="tr-h">
      <div className="hy-sechead">
        <h2 id="tr-h" className="hy-h">{esHoy ? "Tu día" : "Ese día"}</h2>
        {blocks.length > 0 && <span className="hy-count">{nHechos} de {blocks.length}</span>}
      </div>
      {blocks.length ? (
        <ol className="tr">
          {blocks.map((b, i) => {
            const sig = blocks[i + 1];
            const hueco = sig ? toMin(sig.s) - toMin(b.e) : 0;
            const ahora = minuto >= toMin(b.s) && minuto < toMin(b.e);
            const paso = toMin(b.e) <= minuto;
            const hecho = estaHecho(b);
            const id = `tr-${dia}-${i}`;
            const largo = toMin(b.e) - toMin(b.s);
            return [
              <li key={id} className={`tr-fila${ahora ? " ahora" : ""}${paso ? " paso" : ""}${hecho ? " hecho" : ""}`} aria-current={ahora ? "step" : undefined}>
                <span className="tr-hora">{b.s}</span>
                <span className="tr-punto" aria-hidden="true" />
                <span className="tr-b">
                  <label htmlFor={id} className="tr-t">{b.t}</label>
                  <span className="tr-s">
                    {ahora ? `Ahora, hasta las ${b.e}` : dur(largo)}
                    {b.sub ? ` · ${b.sub}` : ""}
                  </span>
                </span>
                <input type="checkbox" className="hy-check" id={id} checked={hecho} onChange={() => marcar(b)} />
              </li>,
              hueco >= 15 && (
                <li key={id + "h"} className="tr-hueco">
                  <span className="tr-hora">{b.e}</span>
                  <span className="tr-punto" aria-hidden="true" />
                  <span className="tr-b">
                    <span className="tr-s">{dur(hueco)} libres</span>
                    {dia >= hoy && (
                      <button className="tr-plan" onClick={() => planificar(b.e)} aria-label={`Planificar a las ${b.e}`}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                        Planificar
                      </button>
                    )}
                  </span>
                </li>
              ),
            ];
          })}
        </ol>
      ) : (
        <p className="hy-empty">Todavía no hay horario para este día.</p>
      )}
      <button className="linkbtn" onClick={onEditar}>{esHoy ? "Editar hoy" : "Editar este día"}</button>
    </section>
  );
}
