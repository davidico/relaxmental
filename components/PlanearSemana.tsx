"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { newId, useData } from "@/lib/data";
import { DOW, MES, addD, pd } from "@/lib/dates";
import { esMeta, type Tarea } from "@/lib/types";
import TextoCrece from "./TextoCrece";

export type Lado = "personal" | "trabajo";
/** Una meta de la semana: en lo que quieres avanzar, sin día ni hora (la IA propone cuándo) */
export type MetaSemana = { id: string; t: string; lado: Lado };
type Sesion = { id: string; fecha: string; s: string; e: string };
type Modo = "metas" | "dias";

const KEY_MODO = "mi-semana-planear";
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const mins = (s: string, e: string) => {
  const [a, b] = s.split(":").map(Number);
  const [c, d] = e.split(":").map(Number);
  return c * 60 + d - (a * 60 + b);
};
export const textoHoras = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const nombreDia = (f: string) => `${DOW[pd(f).getDay()]} ${pd(f).getDate()}`;

/** Las metas de la semana de un lunes, guardadas en el perfil */
export function useMetasSemana(lunes: string) {
  const { perfil, savePerfil } = useData();
  const todas = (perfil.metasSemana ?? {}) as Record<string, MetaSemana[]>;
  const metas = Array.isArray(todas[lunes]) ? todas[lunes] : [];
  const poner = (xs: MetaSemana[]) => savePerfil("metasSemana", { ...todas, [lunes]: xs });
  return { metas, poner };
}

/** Lo que ya está planeado de cada meta de la semana: sus bloques en el horario */
export const sesionesDe = (tareas: Tarea[], id: string) => tareas.filter((x) => x.metaSemana === id && x.hora && x.fin);

/**
 * «Planear semana» (en el Planner). Dos maneras, a elegir:
 * - Por metas: escribes en qué quieres avanzar esta semana y la IA decide cuántos días y a qué horas trabajar cada meta.
 * - Por días: las metas que ya pusiste en cada día del Planner, y la IA les propone la hora.
 * En las dos, ves la propuesta con una casilla por bloque y nada cambia hasta «Aplicar a mi semana». Los bloques entran en tu día
 * como metas con hora (no como tareas sueltas).
 */
export default function PlanearSemana({ lunes, lado, onClose }: { lunes: string; lado: Lado; onClose: () => void }) {
  const { tareas, save, planFor, perfil, hoy, mode, offline } = useData();
  const { metas, poner } = useMetasSemana(lunes);
  const [modo, setModo] = useState<Modo>("metas");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_MODO) === "dias") setModo("dias");
    } catch {}
  }, []);
  const elegir = (m: Modo) => {
    setModo(m);
    setProps(null);
    setEstado("");
    setAplicado(0);
    try {
      localStorage.setItem(KEY_MODO, m);
    } catch {}
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".ts") && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const fechas = Array.from({ length: 7 }, (_, i) => addD(lunes, i)).filter((f) => f >= hoy);
  const domingo = addD(lunes, 6);
  const rango = `${pd(lunes).getDate()} al ${pd(domingo).getDate()} de ${MES[pd(domingo).getMonth()]}`;
  const puede = mode === "cloud" && !offline && fechas.length > 0;

  /* Por metas: escribir las de la semana */
  const [nueva, setNueva] = useState("");
  const [ladoNueva, setLadoNueva] = useState<Lado>(lado);
  const campo = useRef<HTMLTextAreaElement>(null);
  const anadir = () => {
    const t = nueva.trim();
    if (!t) return;
    poner([...metas, { id: newId(), t: t.slice(0, 120), lado: ladoNueva }]);
    setNueva("");
    campo.current?.focus();
  };
  const sinPlanear = metas.filter((m) => !sesionesDe(tareas, m.id).some((x) => x.due >= hoy));

  /* Por días: las metas puestas en un día de la semana que aún no tienen hora */
  const metasDias = tareas.filter((x) => esMeta(x) && !x.done && !x.hora && !x.momento && fechas.includes(x.due));

  /* La propuesta de la IA */
  const [props, setProps] = useState<Sesion[] | null>(null);
  const [si, setSi] = useState<boolean[]>([]);
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  const [aplicado, setAplicado] = useState(0);
  const bloquesDe = (f: string) => planFor(f).map((b) => `${b.s}-${b.e} ${b.t}${b.tarea ? " (tarea o meta ya puesta)" : ""}`);

  const proponer = async () => {
    setEstado("pensando");
    setAplicado(0);
    const ahora = hhmm(new Date());
    const reglas = perfil.reglas?.text ?? "";
    try {
      let out: Sesion[] = [];
      if (modo === "metas") {
        const r = await fetch("/api/ai/semana-metas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hoy, ahora, metas: sinPlanear.map((m) => ({ id: m.id, t: m.t, lado: m.lado })), dias: fechas.map((f) => ({ fecha: f, bloques: bloquesDe(f) })), reglas }),
        });
        if (!r.ok) throw new Error();
        out = ((await r.json()) as { propuestas?: Sesion[] }).propuestas ?? [];
      } else {
        const dias = [...new Set(metasDias.map((x) => x.due))].sort();
        for (const f of dias) {
          const r = await fetch("/api/ai/metas", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fecha: f,
              ahora: f === hoy ? ahora : "00:00",
              metas: metasDias.filter((x) => x.due === f).map((x) => ({ id: x.id, t: x.title, lado: x.lado === "trabajo" ? "trabajo" : "personal" })),
              bloques: bloquesDe(f),
              reglas,
            }),
          });
          if (!r.ok) throw new Error();
          out = out.concat((((await r.json()) as { propuestas?: Omit<Sesion, "fecha">[] }).propuestas ?? []).map((p) => ({ ...p, fecha: f })));
        }
      }
      out.sort((a, b) => (a.fecha + a.s).localeCompare(b.fecha + b.s));
      setProps(out);
      setSi(out.map(() => true));
      setEstado("");
    } catch {
      setEstado("error");
    }
  };

  const aplicar = () => {
    let n = 0;
    props?.forEach((p, i) => {
      if (!si[i]) return;
      if (modo === "metas") {
        const m = metas.find((x) => x.id === p.id);
        if (!m) return;
        save("tareas", { id: newId(), title: m.t, step: "", due: p.fecha, hora: p.s, fin: p.e, done: false, created: new Date().toISOString(), meta: true, lado: m.lado, metaSemana: m.id });
      } else {
        const x = tareas.find((t) => t.id === p.id);
        if (!x || x.done) return;
        save("tareas", { ...x, hora: p.s, fin: p.e });
      }
      n++;
    });
    setAplicado(n);
    setProps(null);
  };

  const nombreDe = (id: string) => (modo === "metas" ? metas.find((m) => m.id === id)?.t : tareas.find((x) => x.id === id)?.title) ?? "";
  const ladoDe = (id: string): Lado => (modo === "metas" ? metas.find((m) => m.id === id)?.lado : tareas.find((x) => x.id === id)?.lado) === "trabajo" ? "trabajo" : "personal";
  /* La propuesta, agrupada: por metas, cada meta con sus días; por días, cada día con sus metas */
  const grupos = props
    ? [...new Set(props.map((p) => (modo === "metas" ? p.id : p.fecha)))].map((k) => ({
        k,
        items: props.map((p, i) => ({ p, i })).filter(({ p }) => (modo === "metas" ? p.id : p.fecha) === k),
      }))
    : [];
  const marcados = si.filter(Boolean).length;
  /* Cuando llega la propuesta, la ventana baja hasta ella */
  const res = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props?.length) res.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
  }, [props]);

  return createPortal(
    <div className="modal as-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet as ps" role="dialog" aria-modal="true" aria-labelledby="ps-h">
        <div className="sheet-head">
          <div>
            <h2 id="ps-h" className="sheet-title">Planear la semana</h2>
            <p className="sub" style={{ margin: 0 }}>Del {rango}</p>
          </div>
          <button className="nv-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="as-cuerpo ps-cuerpo">
          <div className="ps-modos" role="radiogroup" aria-label="Cómo quieres planear">
            <button type="button" role="radio" aria-checked={modo === "metas"} className="ps-modo" onClick={() => elegir("metas")}>
              <span className="ps-modo-t">Por metas</span>
              <span className="ps-modo-d">Escribe en qué quieres avanzar; la IA decide los días y las horas.</span>
            </button>
            <button type="button" role="radio" aria-checked={modo === "dias"} className="ps-modo" onClick={() => elegir("dias")}>
              <span className="ps-modo-t">Por días</span>
              <span className="ps-modo-d">Usa las metas que pusiste en cada día; la IA les pone la hora.</span>
            </button>
          </div>

          {modo === "metas" ? (
            <section className="ps-sec" aria-labelledby="ps-metas-h">
              <h3 id="ps-metas-h" className="ps-h">Tus metas de esta semana</h3>
              {metas.length ? (
                <ul className="ps-lista">
                  {metas.map((m) => {
                    const ses = sesionesDe(tareas, m.id);
                    const total = ses.reduce((a, x) => a + mins(x.hora!, x.fin!), 0);
                    return (
                      <li key={m.id} className={`ps-meta ${m.lado}`}>
                        <span className="ps-punto" aria-hidden="true" />
                        <span className="ps-meta-t">
                          {m.t}
                          <small>{m.lado === "trabajo" ? "Trabajo" : "Personal"} · {ses.length ? `${ses.length === 1 ? "1 día" : `${ses.length} días`}, ${textoHoras(total)}` : "sin planear"}</small>
                        </span>
                        <button type="button" className="nv-ib ps-x" aria-label={`Quitar la meta ${m.t}`} onClick={() => poner(metas.filter((x) => x.id !== m.id))}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="ps-nota">¿En qué quieres avanzar esta semana? Escribe una meta por línea: no hace falta decir cuándo.</p>
              )}
              <form
                className="ps-nueva"
                onSubmit={(e) => {
                  e.preventDefault();
                  anadir();
                }}
              >
                <label htmlFor="ps-in" className="sr-only">Nueva meta de la semana</label>
                <TextoCrece ref={campo} id="ps-in" className="campo1" autoComplete="off" enterKeyHint="done" maxLength={120} placeholder="Ej.: Avanzar el proyecto de la web" value={nueva} onTexto={setNueva} />
                <div className="ps-nueva-pie">
                  <div className="ps-lados" role="radiogroup" aria-label="De qué lado es">
                    {(["personal", "trabajo"] as Lado[]).map((l) => (
                      <button key={l} type="button" role="radio" aria-checked={ladoNueva === l} className={`ps-lado ${l}`} onClick={() => setLadoNueva(l)}>
                        {l === "personal" ? "Personal" : "Trabajo"}
                      </button>
                    ))}
                  </div>
                  <button className="btn ghost" type="submit" disabled={!nueva.trim()}>Añadir</button>
                </div>
              </form>
            </section>
          ) : (
            <section className="ps-sec" aria-labelledby="ps-dias-h">
              <h3 id="ps-dias-h" className="ps-h">Metas en tus días, sin hora</h3>
              {metasDias.length ? (
                <ul className="ps-lista">
                  {[...new Set(metasDias.map((x) => x.due))].sort().map((f) => (
                    <li key={f} className="ps-dia">
                      <b>{nombreDia(f)}</b>
                      <span>{metasDias.filter((x) => x.due === f).map((x) => x.title).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ps-nota">No tienes metas sin hora en los días que quedan de esta semana. Escríbelas en cada día del Planner (en «Metas», con «+ Añadir») y vuelve aquí.</p>
              )}
            </section>
          )}

          {estado === "pensando" && <p className="vwork" role="status"><span className="spin" aria-hidden="true" /> Mirando tu semana…</p>}
          {estado === "error" && <p className="verr" role="alert">⚠ No pude proponerlo ahora. Inténtalo otra vez.</p>}
          {props && !props.length && <p role="status" className="ps-nota">No encontré huecos que encajen. Prueba con menos metas o ponles hora tú en el Planner.</p>}
          {props && props.length > 0 && (
            <div ref={res} className="pq-cambios ps-res" role="group" aria-label="Lo que te propongo">
              <p className="pq-cambios-h">Te propongo</p>
              {grupos.map((g) => {
                const total = g.items.reduce((a, { p }) => a + mins(p.s, p.e), 0);
                return (
                  <div key={g.k} className="ps-grupo">
                    <p className="ps-grupo-h">
                      {modo === "metas" && <span className={`ps-punto ${ladoDe(g.k)}`} aria-hidden="true" />}
                      <span>{modo === "metas" ? nombreDe(g.k) : nombreDia(g.k)}</span>
                    </p>
                    {modo === "metas" && <p className="ps-grupo-sub">{g.items.length === 1 ? "1 día" : `${g.items.length} días`} · {textoHoras(total)}</p>}
                    <ul>
                      {g.items.map(({ p, i }) => (
                        <li key={i}>
                          <label>
                            <input type="checkbox" checked={si[i]} onChange={(e) => setSi((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} />
                            <span>{modo === "metas" ? `${nombreDia(p.fecha)} · ${p.s}–${p.e}` : `${p.s}–${p.e} · ${nombreDe(p.id)}`}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          {aplicado > 0 && <p className="vok" role="status">✓ Listo: {aplicado === 1 ? "1 bloque nuevo" : `${aplicado} bloques nuevos`} en tu semana. Los ves en Hoy, en la línea de cada día.</p>}
          {!puede && <p className="ps-nota">{fechas.length ? "Para que la IA te proponga necesitas haber iniciado sesión y tener conexión." : "Esta semana ya pasó."}</p>}
        </div>

        <div className="sheet-foot as-pie">
          {props && props.length > 0 ? (
            <>
              <button className="btn ghost" onClick={() => setProps(null)}>Descartar</button>
              <button className="btn" onClick={aplicar} disabled={!marcados}>{marcados === props.length ? "Aplicar a mi semana" : `Aplicar ${marcados} de ${props.length}`}</button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={onClose}>{aplicado ? "Cerrar" : "Cancelar"}</button>
              <button className="btn" onClick={proponer} disabled={!puede || estado === "pensando" || (modo === "metas" ? !sinPlanear.length : !metasDias.length)}>
                {modo === "metas" ? (metas.length && !sinPlanear.length ? "Todas planeadas" : "Proponme días y horas") : "Proponme horas"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
