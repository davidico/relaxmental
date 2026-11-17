"use client";

import { useEffect, useRef, useState } from "react";
import { newId, useData } from "@/lib/data";
import { DOW, addD, pd } from "@/lib/dates";
import { esMeta, type Tarea } from "@/lib/types";
import TextoCrece from "./TextoCrece";

export type Lado = "personal" | "trabajo";
/** Una meta de la semana: en lo que quieres avanzar, sin día ni hora (la IA propone cuándo) */
export type MetaSemana = { id: string; t: string; lado: Lado };
/** Cómo se planeó cada semana (lunes → modo). `null` = la persona quiere volver a elegir */
export type ModoSemana = "metas" | "dias";
/** Un sitio para una meta: dentro de un momento del día (su clave «HH:MM|nombre») o con hora propia */
type Sesion = { id: string; fecha: string; s?: string; e?: string; momento?: string };
const nombreMomento = (k: string) => k.slice(k.indexOf("|") + 1);
const dondeTexto = (p: { s?: string; e?: string; momento?: string }) => (p.momento ? `dentro de «${nombreMomento(p.momento)}»` : `${p.s}–${p.e}`);
const ordenSesion = (a: Sesion, b: Sesion) => (a.fecha + (a.s ?? a.momento ?? "")).localeCompare(b.fecha + (b.s ?? b.momento ?? ""));
/** Cómo queda la meta en su día: dentro del momento (sin hora) o con su hora */
const donde = (p: Sesion) => (p.momento ? { momento: p.momento } : { hora: p.s!, fin: p.e! });

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
export const minutos = (s: string, e: string) => {
  const [a, b] = s.split(":").map(Number);
  const [c, d] = e.split(":").map(Number);
  return c * 60 + d - (a * 60 + b);
};
export const textoHoras = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const nombreDia = (f: string) => `${DOW[pd(f).getDay()]} ${pd(f).getDate()}`;
const LADOS: { l: Lado; t: string }[] = [
  { l: "trabajo", t: "Trabajo" },
  { l: "personal", t: "Personal" },
];

/** Las metas de la semana de un lunes, guardadas en el perfil */
export function useMetasSemana(lunes: string) {
  const { perfil, savePerfil } = useData();
  const todas = (perfil.metasSemana ?? {}) as Record<string, MetaSemana[]>;
  const metas = Array.isArray(todas[lunes]) ? todas[lunes] : [];
  const poner = (xs: MetaSemana[]) => savePerfil("metasSemana", { ...todas, [lunes]: xs });
  return { metas, poner };
}
/** Los bloques ya puestos de una meta de la semana */
export const sesionesDe = (tareas: Tarea[], id: string) => tareas.filter((x) => x.metaSemana === id && ((x.hora && x.fin) || x.momento));
const resumen = (ses: { hora?: string; fin?: string }[]) => {
  if (!ses.length) return "sin planear";
  const min = ses.reduce((a, x) => a + (x.hora && x.fin ? minutos(x.hora, x.fin) : 0), 0);
  return `${ses.length === 1 ? "1 día" : `${ses.length} días`}${min ? ` · ${textoHoras(min)}` : ""}`;
};

/** El selector Trabajo | Personal (un punto con el color de cada lado) */
function Lados({ valor, onCambiar, etiqueta }: { valor: Lado; onCambiar: (l: Lado) => void; etiqueta: string }) {
  return (
    <div className="ps-lados" role="radiogroup" aria-label={etiqueta}>
      {LADOS.map(({ l, t }) => (
        <button key={l} type="button" role="radio" aria-checked={valor === l} className={`ps-lado ${l}`} onPointerDown={(e) => e.preventDefault() /* no cerrar el teclado */} onClick={() => onCambiar(l)}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** La propuesta de la IA: una casilla por bloque, agrupada; nada cambia hasta «Aplicar a mi semana» */
function Propuesta({ props, agrupar, titulo, linea, onAplicar, onDescartar }: { props: Sesion[]; agrupar: (p: Sesion) => string; titulo: (k: string) => React.ReactNode; linea: (p: Sesion) => string; onAplicar: (xs: Sesion[]) => void; onDescartar: () => void }) {
  const [si, setSi] = useState(() => props.map(() => true));
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caja.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
  }, []);
  const grupos = [...new Set(props.map(agrupar))];
  const n = si.filter(Boolean).length;
  return (
    <div ref={caja} className="pq-cambios ps-res" role="group" aria-label="Lo que te propongo">
      <p className="pq-cambios-h">Te propongo</p>
      {grupos.map((k) => (
        <div key={k} className="ps-grupo">
          {titulo(k)}
          <ul>
            {props.map((p, i) =>
              agrupar(p) === k ? (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={si[i]} onChange={(e) => setSi((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} />
                    <span>{linea(p)}</span>
                  </label>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ))}
      <div className="pq-cambios-pie">
        <button type="button" className="btn" disabled={!n} onClick={() => onAplicar(props.filter((_, i) => si[i]))}>{n === props.length ? "Aplicar a mi semana" : `Aplicar ${n} de ${props.length}`}</button>
        <button type="button" className="btn ghost" onClick={onDescartar}>Descartar</button>
      </div>
    </div>
  );
}

/** Lo que se le manda a la IA de cada día: su horario, con lo que ya tiene hora */
function useDatosIA() {
  const { planFor, perfil } = useData();
  return {
    /* Los momentos van con su clave al final, para que la IA pueda meter una meta dentro de uno */
    bloques: (f: string) => planFor(f).map((b) => `${b.s}-${b.e} ${b.t}${b.tarea ? " (tarea o meta ya puesta)" : ` [${b.s}|${b.t}]`}`),
    reglas: perfil.reglas?.text ?? "",
  };
}

/** Al empezar una semana sin planear: elegir cómo */
export function ElegirPlan({ onMetas, onDias }: { onMetas: () => void; onDias: () => void }) {
  return (
    <section className="pl-elegir" aria-labelledby="pl-elegir-h">
      <h2 id="pl-elegir-h">¿Cómo quieres planear esta semana?</h2>
      <div className="pl-elegir-op">
        <button type="button" className="pl-elegir-b" onClick={onMetas}>
          <span className="pl-elegir-t">Por metas</span>
          <span className="pl-elegir-d">Escribe en qué quieres avanzar. La IA decide qué días y a qué horas.</span>
        </button>
        <button type="button" className="pl-elegir-b" onClick={onDias}>
          <span className="pl-elegir-t">Por días</span>
          <span className="pl-elegir-d">Escribe en cada día lo que quieres trabajar, en Trabajo y en Personal.</span>
        </button>
      </div>
    </section>
  );
}

/**
 * Planear por metas: escribes las metas de la semana (de Trabajo o Personal) y la IA reparte cada una en días y horas.
 * Al aplicar, cada bloque entra en su día como una meta con hora (con `metaSemana`), y la semana queda planeada «por metas».
 */
export function PorMetas({ lunes, onListo, onVolver }: { lunes: string; onListo: () => void; onVolver: () => void }) {
  const { tareas, save, hoy, mode, offline } = useData();
  const { metas, poner } = useMetasSemana(lunes);
  const ia = useDatosIA();
  const [nueva, setNueva] = useState("");
  const [lado, setLado] = useState<Lado>("trabajo");
  const [props, setProps] = useState<Sesion[] | null>(null);
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const fechas = Array.from({ length: 7 }, (_, i) => addD(lunes, i)).filter((f) => f >= hoy);
  const puede = mode === "cloud" && !offline && fechas.length > 0;
  const sinPlanear = metas.filter((m) => !sesionesDe(tareas, m.id).some((x) => x.due >= hoy));
  const anadir = () => {
    const t = nueva.trim();
    if (!t) return;
    poner([...metas, { id: newId(), t: t.slice(0, 120), lado }]);
    setNueva("");
    campo.current?.focus();
  };
  const proponer = async () => {
    setEstado("pensando");
    try {
      const r = await fetch("/api/ai/semana-metas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hoy, ahora: hhmm(new Date()), metas: sinPlanear.map((m) => ({ id: m.id, t: m.t, lado: m.lado })), dias: fechas.map((f) => ({ fecha: f, bloques: ia.bloques(f) })), reglas: ia.reglas }),
      });
      if (!r.ok) throw new Error();
      const xs = (((await r.json()) as { propuestas?: Sesion[] }).propuestas ?? []).sort(ordenSesion);
      setProps(xs);
      setEstado("");
    } catch {
      setEstado("error");
    }
  };
  const aplicar = (xs: Sesion[]) => {
    for (const p of xs) {
      const m = metas.find((x) => x.id === p.id);
      if (m) save("tareas", { id: newId(), title: m.t, step: "", due: p.fecha, ...donde(p), done: false, created: new Date().toISOString(), meta: true, lado: m.lado, metaSemana: m.id });
    }
    setProps(null);
    onListo();
  };
  const meta = (id: string) => metas.find((m) => m.id === id);

  return (
    <section className="pl-pormetas" aria-labelledby="pl-pm-h">
      <div className="pl-pm-cab">
        <h2 id="pl-pm-h">Tus metas de la semana</h2>
        <button type="button" className="linkbtn" onClick={onVolver}>Volver</button>
      </div>
      <p className="ps-nota">Escribe en qué quieres avanzar, sin decir cuándo. La IA lo reparte en tus días.</p>
      {metas.length > 0 && (
        <ul className="ps-lista">
          {metas.map((m) => (
            <li key={m.id} className={`ps-meta ${m.lado}`}>
              <span className={`ps-punto ${m.lado}`} aria-hidden="true" />
              <span className="ps-meta-t">
                {m.t}
                <small>{m.lado === "trabajo" ? "Trabajo" : "Personal"} · {resumen(sesionesDe(tareas, m.id))}</small>
              </span>
              <button type="button" className="nv-ib ps-x" aria-label={`Quitar la meta ${m.t}`} onClick={() => poner(metas.filter((x) => x.id !== m.id))}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
        </ul>
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
          <Lados valor={lado} onCambiar={setLado} etiqueta="De qué lado es" />
          <button className="btn ghost" type="submit" disabled={!nueva.trim()}>Añadir</button>
        </div>
      </form>

      {estado === "pensando" && <p className="vwork" role="status"><span className="spin" aria-hidden="true" /> Mirando tu semana…</p>}
      {estado === "error" && <p className="verr" role="alert">⚠ No pude proponerlo ahora. Inténtalo otra vez.</p>}
      {props && !props.length && <p role="status" className="ps-nota">No encontré huecos que encajen. Prueba con menos metas.</p>}
      {props && props.length > 0 ? (
        <Propuesta
          props={props}
          agrupar={(p) => p.id}
          titulo={(k) => (
            <>
              <p className="ps-grupo-h"><span className={`ps-punto ${meta(k)?.lado ?? "personal"}`} aria-hidden="true" /><span>{meta(k)?.t}</span></p>
              <p className="ps-grupo-sub">{resumen(props.filter((p) => p.id === k).map((p) => ({ hora: p.s, fin: p.e })))}</p>
            </>
          )}
          linea={(p) => `${nombreDia(p.fecha)} · ${dondeTexto(p)}`}
          onAplicar={aplicar}
          onDescartar={() => setProps(null)}
        />
      ) : (
        <div className="pl-pm-pie">
          {sinPlanear.length > 0 ? (
            <button className="btn" onClick={proponer} disabled={!puede || estado === "pensando"}>Proponme días y horas</button>
          ) : (
            metas.length > 0 && <button className="btn" onClick={onListo}>Ver mi semana</button>
          )}
          {!puede && <span className="ps-nota">{fechas.length ? "Para que la IA te proponga necesitas sesión y conexión." : "Esta semana ya pasó."}</span>}
        </div>
      )}
    </section>
  );
}

/** Arriba de los días, si la semana se planeó por metas: cada meta con lo que tiene puesto */
export function ResumenMetas({ lunes, onCambiar, onOtra }: { lunes: string; onCambiar: () => void; onOtra: () => void }) {
  const { tareas } = useData();
  const { metas } = useMetasSemana(lunes);
  return (
    <section className="pl-msem" aria-labelledby="pl-msem-h">
      <div className="pl-msem-cab">
        <h2 id="pl-msem-h">Metas de la semana</h2>
        <button type="button" className="btn ghost sm" onClick={onCambiar}>Cambiar metas</button>
      </div>
      {metas.length ? (
        <ul className="pl-msem-l">
          {metas.map((m) => (
            <li key={m.id}>
              <span className="pl-msem-t"><span className={`ps-punto ${m.lado}`} aria-hidden="true" /> {m.t}</span>
              <span className="pl-msem-n">{resumen(sesionesDe(tareas, m.id))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-nota">Aún no escribiste metas para esta semana.</p>
      )}
      <button type="button" className="linkbtn pl-otra" onClick={onOtra}>Planear de otra manera</button>
    </section>
  );
}

/**
 * Arriba de los días, si la semana se planea por días: las metas que aún no tienen hora y «Proponme horas»,
 * que le busca un hueco a cada una en su día.
 */
export function HorasDias({ days, onOtra }: { days: string[]; onOtra: () => void }) {
  const { tareas, save, hoy, mode, offline } = useData();
  const ia = useDatosIA();
  const [props, setProps] = useState<Sesion[] | null>(null);
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  const sinHora = tareas.filter((x) => esMeta(x) && !x.done && !x.hora && !x.momento && days.includes(x.due) && x.due >= hoy);
  const puede = mode === "cloud" && !offline;
  const proponer = async () => {
    setEstado("pensando");
    try {
      let out: Sesion[] = [];
      for (const f of [...new Set(sinHora.map((x) => x.due))].sort()) {
        const r = await fetch("/api/ai/metas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fecha: f, ahora: f === hoy ? hhmm(new Date()) : "00:00", metas: sinHora.filter((x) => x.due === f).map((x) => ({ id: x.id, t: x.title, lado: x.lado === "trabajo" ? "trabajo" : "personal" })), bloques: ia.bloques(f), reglas: ia.reglas }),
        });
        if (!r.ok) throw new Error();
        out = out.concat((((await r.json()) as { propuestas?: Omit<Sesion, "fecha">[] }).propuestas ?? []).map((p) => ({ ...p, fecha: f })));
      }
      setProps(out.sort(ordenSesion));
      setEstado("");
    } catch {
      setEstado("error");
    }
  };
  const aplicar = (xs: Sesion[]) => {
    for (const p of xs) {
      const x = tareas.find((t) => t.id === p.id);
      if (!x || x.done) continue;
      const { hora: _h, fin: _f, momento: _m, ...resto } = x;
      save("tareas", { ...resto, ...donde(p) });
    }
    setProps(null);
  };
  const titulo = (id: string) => tareas.find((t) => t.id === id)?.title ?? "";
  return (
    <section className="pl-msem pl-hdias" aria-label="Horas para tus metas">
      {props ? (
        props.length ? (
          <Propuesta props={props} agrupar={(p) => p.fecha} titulo={(f) => <p className="ps-grupo-h">{nombreDia(f)}</p>} linea={(p) => `${dondeTexto(p)} · ${titulo(p.id)}`} onAplicar={aplicar} onDescartar={() => setProps(null)} />
        ) : (
          <p role="status" className="ps-nota">No encontré huecos que encajen. Puedes ponerles hora tocándolas.</p>
        )
      ) : sinHora.length ? (
        <div className="pl-hdias-fila">
          <p>{sinHora.length === 1 ? "1 meta aún no tiene hora." : `${sinHora.length} metas aún no tienen hora.`}</p>
          {puede && (
            <button className="btn sm" onClick={proponer} disabled={estado === "pensando"}>{estado === "pensando" ? "Mirando tus días…" : "Proponme horas"}</button>
          )}
        </div>
      ) : (
        <p className="ps-nota">Escribe en cada día lo que quieres trabajar. Si no le pones hora, la IA te la propone.</p>
      )}
      {estado === "error" && <p className="verr" role="alert">⚠ No pude proponerlo ahora. Inténtalo otra vez.</p>}
      <button type="button" className="linkbtn pl-otra" onClick={onOtra}>Planear de otra manera</button>
    </section>
  );
}
