"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { addD, toMin } from "@/lib/dates";
import type { Bloque } from "@/lib/plan";
import { tipoDe } from "@/lib/tipos";
import { useTipos } from "@/lib/usarTipos";
import IconoBloque from "./IconoBloque";
import AnadirAqui from "./AnadirAqui";
import { useFocus } from "./Shell";
import { bloqueDeSub } from "@/lib/momentos";
import type { Tarea } from "@/lib/types";
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
 * Entre dos actividades que aún no pasaron hay un «+» en la línea (en los ratos libres, «Planificar») que abre `AnadirAqui`:
 * lo nuevo va como subtarea de un momento vecino (se ve debajo de él, con su círculo y su temporizador) o como momento nuevo a esa hora.
 * Si el ícono tiene algo que abrir (el contador de ejercicio, el aviso para levantarse), es un botón.
 * `minuto` es el minuto actual si el día es hoy; -1 si es un día futuro; 1440 si ya pasó.
 */
export function Tira({ dia, blocks, minuto, onEditar, onEntreno }: { dia: string; blocks: Bloque[]; minuto: number; onEditar: () => void; onEntreno: () => void }) {
  const { perfil, savePerfil, tareas, save, hoy, planFor } = useData();
  const [aviso, setAviso] = useState<{ fecha: string; hora: string; cuando: string; pasado?: boolean } | null>(null);
  const [diario, setDiario] = useState(false);
  const [anadir, setAnadir] = useState<{ hora: string; dentro: { clave: string; nombre: string }[]; inicial: number } | null>(null);
  const empezar = useFocus();
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
  /* Añadir algo en un punto del día: como momento nuevo a esa hora o, con el «+» que hay debajo de un momento, como subtarea de ese
     momento (el de arriba; nunca el de abajo: lo que se pone antes del desayuno no es parte del desayuno) */
  const anadirEn = (hora: string, vecinos: (Bloque | undefined)[], preferido?: Bloque) => {
    const dentro = vecinos.filter((x): x is Bloque => !!x && !x.tarea && toMin(x.e) > minuto);
    setAnadir({ hora, dentro: dentro.map((x) => ({ clave: clave(x), nombre: x.t })), inicial: preferido ? dentro.indexOf(preferido) : -1 });
  };
  /* Las subtareas de cada momento: tareas de ese día sin hora que apuntan a él */
  const subs = new Map<Bloque, Tarea[]>();
  for (const x of tareas) {
    if (x.due !== dia || x.hora || !x.momento) continue;
    const b = bloqueDeSub(x.momento, blocks);
    if (b) subs.set(b, [...(subs.get(b) ?? []), x]);
  }
  const nHechos = blocks.filter(estaHecho).length;
  const esHoy = minuto >= 0 && minuto < 1440;
  const cuando = esHoy ? "hoy" : dia === addD(hoy, 1) ? "mañana" : "ese día";
  /* Qué es cada actividad: por las palabras de su nombre y, si no se reconoce, lo que dijo la IA */
  const memo = useTipos(blocks);
  const tipo = (b: Bloque) => tipoDe(b, memo);
  /* El despertador es la primera actividad de «despertar» del día */
  const despertar = blocks.find((b) => tipo(b) === "despertar");
  /* Para el ícono de «Dormir»: a qué hora toca levantarse al día siguiente */
  const despertarSig = dia >= hoy && blocks.some((b) => tipo(b) === "dormir") ? planFor(addD(dia, 1)).find((b) => tipo(b) === "despertar")?.s : undefined;

  /** Lo que abre el ícono de un bloque, si abre algo */
  const accionDe = (b: Bloque, paso: boolean): { label: string; pista: string; run: () => void } | null => {
    const k = tipo(b);
    /* El contador, el diario y el temporizador se ofrecen cuando llega su momento (hoy, desde su hora), no antes */
    const llego = esHoy && toMin(b.s) <= minuto;
    if (llego && k === "ejercicio")
      return { label: `Abrir el contador de series: ${b.t}`, pista: "Toca el ícono para elegir tus series", run: onEntreno };
    if (dia >= hoy && b === despertar) {
      const pasado = esHoy && toMin(b.s) <= minuto;
      return {
        label: `Despertador: te levantas a las ${b.s}`,
        pista: pasado ? "¿Te levantaste a otra hora? Toca el ícono" : "Toca el ícono para poner tu despertador",
        run: () => setAviso({ fecha: dia, hora: b.s, cuando, pasado }),
      };
    }
    if (despertarSig && !paso && k === "dormir" && toMin(b.s) >= 18 * 60)
      return {
        label: `Despertador de mañana: te levantas a las ${despertarSig}`,
        pista: `Toca el ícono: despertador de las ${despertarSig}`,
        run: () => setAviso({ fecha: addD(dia, 1), hora: despertarSig, cuando: dia === hoy ? "mañana" : "al día siguiente" }),
      };
    if (llego && k === "diario") return { label: "Escribir tu diario de hoy", pista: "Toca el ícono para escribir tu diario", run: () => setDiario(true) };
    /* Una tarea con tiempo aproximado: su ícono empieza el temporizador */
    const t = b.tarea ? tareas.find((x) => x.id === b.tarea) : undefined;
    if (llego && t?.min && !t.done) return { label: `Empezar el temporizador de ${t.min} minutos: ${b.t}`, pista: `Toca el ícono para empezar ${t.min} min`, run: () => empezar(t) };
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
        {plan && <button className="lt-plan" onClick={() => anadirEn(plan, [])} aria-label={`Planificar a las ${plan}`}>Planificar</button>}
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
        <button type="button" className="lt-editar" onClick={onEditar} aria-label={esHoy ? "Editar hoy" : "Editar este día"}>Editar</button>
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
            const icono = <IconoBloque nombre={tipo(b)} />;
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
                {subs.has(b) && (
                  <ul className="lt-subs" aria-label={`Subtareas de ${b.t}`}>
                    {subs.get(b)!.map((x) => (
                      <li key={x.id} className={x.done ? "hecho" : undefined}>
                        <input type="checkbox" className="hy-check" id={`lt-sub-${x.id}`} checked={x.done} onChange={() => save("tareas", { ...x, done: !x.done })} />
                        <label htmlFor={`lt-sub-${x.id}`}>{x.title}</label>
                        {!!x.min && !x.done && (
                          <button type="button" className="lt-tiempo" onClick={() => empezar(x)} aria-label={`Empezar el temporizador de ${x.min} minutos: ${x.title}`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
                            {x.min} min
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>,
              /* Entre dos actividades seguidas: un «+» en la línea para meter ahí una tarea */
              !!sig && !enHueco && hueco < 15 && dia >= hoy && toMin(b.e) > minuto && (
                <li key={id + "m"} className="lt-f lt-entre">
                  <span className="lt-h" />
                  <span className="lt-c">
                    <button type="button" className="lt-mas" onClick={() => anadirEn(b.e, [b], ahora ? b : undefined)} aria-label={`Añadir algo a las ${b.e}, entre ${b.t} y ${sig.t}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                  </span>
                </li>
              ),
              enHueco
                ? filaAhora(id + "h", libre(toMin(sig.s) - minuto), aHora(Math.max(minuto, Math.min(toMin(sig.s) - 5, Math.ceil(minuto / 5) * 5))))
                : hueco >= 15 && (
                    <li key={id + "h"} className={`lt-f lt-hueco${huecoPaso ? " paso" : ""}`}>
                      <span className="lt-h" />
                      <span className="lt-c" />
                      <span className="lt-b lt-hb">
                        <span className="lt-s">{libre(hueco)}</span>
                        {dia >= hoy && !huecoPaso && <button className="lt-plan" onClick={() => anadirEn(b.e, [])} aria-label={`Planificar a las ${b.e}`}>Planificar</button>}
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
      {aviso && <AvisoDespertar fecha={aviso.fecha} hora={aviso.hora} cuando={aviso.cuando} pasado={aviso.pasado} onClose={() => setAviso(null)} />}
      {diario && <Diario hoja onClose={() => setDiario(false)} />}
      {anadir && <AnadirAqui dia={dia} hora={anadir.hora} dentro={anadir.dentro} inicial={anadir.inicial} onClose={() => setAnadir(null)} />}
    </section>
  );
}
