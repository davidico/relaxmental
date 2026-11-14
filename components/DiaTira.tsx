"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { addD, toMin } from "@/lib/dates";
import type { Bloque } from "@/lib/plan";
import IconoBloque, { esDespertar, esDiario, esDormir, esEjercicio, iconoDe } from "./IconoBloque";
import AvisoDespertar from "./AvisoDespertar";
import Diario from "./Diario";

const dur = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const libre = (min: number) => `${dur(min)} ${min === 1 || min === 60 ? "libre" : "libres"}`;
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Cómo se guarda que un bloque del horario está hecho: por su hora de inicio y su nombre */
const clave = (b: Bloque) => `${b.s}|${b.t}`;
/** Alto de la cápsula según lo que dura la actividad (44 px lo más corto, 132 px lo más largo) */
const alto = (min: number) => Math.round(Math.min(132, 44 + Math.max(0, min - 15) * 0.5));

/**
 * El día en una línea: cada actividad es una cápsula con su ícono (más alta cuanto más dura),
 * con su hora a la izquierda y un círculo a la derecha para decir «lo hice».
 * La línea que las une se va llenando con la hora: continua lo que ya pasó, punteada lo que falta.
 * Si el ícono tiene algo que abrir (el contador de ejercicio, el aviso para levantarse), es un botón.
 * `minuto` es el minuto actual si el día es hoy; -1 si es un día futuro; 1440 si ya pasó.
 */
export function Tira({ dia, blocks, minuto, onEditar, onEntreno }: { dia: string; blocks: Bloque[]; minuto: number; onEditar: () => void; onEntreno: () => void }) {
  const { perfil, savePerfil, tareas, save, hoy, planFor } = useData();
  const [aviso, setAviso] = useState<{ fecha: string; hora: string; cuando: string; pasado?: boolean } | null>(null);
  const [diario, setDiario] = useState(false);
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
  const cuando = esHoy ? "hoy" : dia === addD(hoy, 1) ? "mañana" : "ese día";
  /* Para el ícono de «Dormir»: a qué hora toca levantarse al día siguiente */
  const despertarSig = dia >= hoy && blocks.some((b) => esDormir(b.t)) ? planFor(addD(dia, 1)).find((b) => esDespertar(b.t))?.s : undefined;

  /** Lo que abre el ícono de un bloque, si abre algo */
  const accionDe = (b: Bloque, paso: boolean): { label: string; pista: string; run: () => void } | null => {
    if (esHoy && esEjercicio(b.t) && !estaHecho(b))
      return { label: `Abrir el contador de entrenamiento: ${b.t}`, pista: "Toca el ícono para abrir tu contador", run: onEntreno };
    if (dia >= hoy && esDespertar(b.t)) {
      const pasado = esHoy && toMin(b.s) <= minuto;
      return {
        label: `Despertador: te levantas a las ${b.s}`,
        pista: pasado ? "¿Te levantaste a otra hora? Toca el ícono" : "Toca el ícono para poner tu despertador",
        run: () => setAviso({ fecha: dia, hora: b.s, cuando, pasado }),
      };
    }
    if (despertarSig && !paso && esDormir(b.t))
      return {
        label: `Despertador de mañana: te levantas a las ${despertarSig}`,
        pista: `Toca el ícono: despertador de las ${despertarSig}`,
        run: () => setAviso({ fecha: addD(dia, 1), hora: despertarSig, cuando: dia === hoy ? "mañana" : "al día siguiente" }),
      };
    if (esHoy && esDiario(b.t)) return { label: "Escribir tu diario de hoy", pista: "Toca el ícono para escribir tu diario", run: () => setDiario(true) };
    return null;
  };

  /** Fila del momento actual cuando no hay ninguna actividad en curso */
  const filaAhora = (key: string, texto: string, plan?: string) => (
    <li key={key} className="lt-f lt-hueco ahora" aria-current="time">
      <span className="lt-h">{aHora(minuto)}</span>
      <span className="lt-c"><span className="lt-dot" aria-hidden="true" /></span>
      <span className="lt-b lt-hb">
        <span className="lt-ht">
          <span className="lt-t">Ahora</span>
          <span className="lt-s">{texto}</span>
        </span>
        {plan && <button className="lt-plan" onClick={() => planificar(plan)} aria-label={`Planificar a las ${plan}`}>Planificar</button>}
      </span>
    </li>
  );
  const primero = blocks[0];
  const ultimo = blocks[blocks.length - 1];

  return (
    <section className="hy-sec lt-sec" aria-labelledby="lt-h">
      <div className="hy-sechead">
        <h2 id="lt-h" className="hy-h">{esHoy ? "Tu día" : "Ese día"}</h2>
        {blocks.length > 0 && <span className="hy-count">{nHechos} de {blocks.length}</span>}
      </div>
      {blocks.length ? (
        <ol className="lt">
          {esHoy && minuto < toMin(primero.s) && filaAhora("antes", `Empiezas en ${dur(toMin(primero.s) - minuto)}`)}
          {blocks.map((b, i) => {
            const sig = blocks[i + 1];
            const hueco = sig ? toMin(sig.s) - toMin(b.e) : 0;
            const ahora = minuto >= toMin(b.s) && minuto < toMin(b.e);
            const paso = toMin(b.e) <= minuto;
            const hecho = estaHecho(b);
            const id = `lt-${dia}-${i}`;
            const largo = toMin(b.e) - toMin(b.s);
            const accion = accionDe(b, paso);
            const icono = <IconoBloque nombre={iconoDe(b)} />;
            const enHueco = !!sig && minuto >= toMin(b.e) && minuto < toMin(sig.s);
            const huecoPaso = !!sig && toMin(sig.s) <= minuto;
            return [
              <li key={id} className={`lt-f${ahora ? " ahora" : ""}${paso ? " paso" : ""}${hecho ? " hecho" : ""}`} aria-current={ahora ? "step" : undefined}>
                <span className="lt-h">{b.s}</span>
                <span className="lt-c">
                  {accion ? (
                    <button type="button" className="lt-cap lt-btn" style={{ height: alto(largo) }} aria-label={accion.label} onClick={accion.run}>{icono}</button>
                  ) : (
                    <span className="lt-cap" style={{ height: alto(largo) }}>{icono}</span>
                  )}
                </span>
                <span className="lt-b">
                  <label htmlFor={id} className="lt-t">{b.t}</label>
                  <span className="lt-s">
                    {ahora ? `Ahora, hasta las ${b.e}` : largo > 45 ? `${b.s} a ${b.e}, ${dur(largo)}` : dur(largo)}
                    {b.sub ? ` · ${b.sub}` : ""}
                  </span>
                  {accion && <span className="lt-s lt-pista">{accion.pista}</span>}
                </span>
                <input type="checkbox" className="hy-check" id={id} checked={hecho} onChange={() => marcar(b)} />
              </li>,
              enHueco
                ? filaAhora(id + "h", libre(toMin(sig.s) - minuto), aHora(Math.max(minuto, Math.min(toMin(sig.s) - 5, Math.ceil(minuto / 5) * 5))))
                : hueco >= 15 && (
                    <li key={id + "h"} className={`lt-f lt-hueco${huecoPaso ? " paso" : ""}`}>
                      <span className="lt-h" />
                      <span className="lt-c" />
                      <span className="lt-b lt-hb">
                        <span className="lt-s">{libre(hueco)}</span>
                        {dia >= hoy && !huecoPaso && <button className="lt-plan" onClick={() => planificar(b.e)} aria-label={`Planificar a las ${b.e}`}>Planificar</button>}
                      </span>
                    </li>
                  ),
            ];
          })}
          {esHoy && minuto >= toMin(ultimo.e) && filaAhora("despues", "Tu día terminó. A descansar.")}
        </ol>
      ) : (
        <p className="hy-empty">Todavía no hay horario para este día.</p>
      )}
      <button className="linkbtn" onClick={onEditar}>{esHoy ? "Editar hoy" : "Editar este día"}</button>
      {aviso && <AvisoDespertar fecha={aviso.fecha} hora={aviso.hora} cuando={aviso.cuando} pasado={aviso.pasado} onClose={() => setAviso(null)} />}
      {diario && <Diario hoja onClose={() => setDiario(false)} />}
    </section>
  );
}
