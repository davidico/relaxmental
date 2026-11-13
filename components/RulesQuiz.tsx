"use client";

import { useEffect, useRef, useState } from "react";
import VoiceButton from "./VoiceButton";

/** Por si la IA no responde: preguntas generales */
const BASE = [
  "¿A qué hora te levantas y a qué hora quieres terminar el día?",
  "¿En qué horas del día rindes mejor y qué quieres hacer en ellas?",
  "¿Qué cosas tienen que estar todos los días sí o sí?",
  "¿Qué días son distintos y qué cambia en ellos?",
  "¿Cuándo quieres tiempo para la familia sin móvil?",
  "¿Cuándo y cuántas veces por semana quieres hacer ejercicio?",
  "¿Qué tareas te cuesta empezar y a qué hora te vendría mejor hacerlas?",
  "¿Qué no quieres que aparezca nunca en tu horario?",
];

type Estado = { preguntas: string[]; respuestas: string[]; mensaje: string; i: number };
const KEY = "mi-semana-preguntas";
const leer = (): Estado | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
};
const escribir = (e: Estado | null) => {
  try {
    if (e) localStorage.setItem(KEY, JSON.stringify(e));
    else localStorage.removeItem(KEY);
  } catch {}
};
export const hayPreguntasPendientes = () => !!leer();

/**
 * Armar las reglas con preguntas: la IA pregunta lo que falta, respondes (escribiendo o dictando),
 * dejas un mensaje final y la IA reescribe tus reglas. Tú decides si las guardas.
 * Lo respondido se guarda en el teléfono por si se cierra la app.
 */
export default function RulesQuiz({ reglas, onClose, onGuardar }: { reglas: string; onClose: () => void; onGuardar: (texto: string) => Promise<boolean> }) {
  const [e, setE] = useState<Estado | null>(null);
  const [fase, setFase] = useState<"cargando" | "preguntas" | "armando" | "revisar" | "error">("cargando");
  const [nuevas, setNuevas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const caja = useRef<HTMLTextAreaElement>(null);

  /* Retomar lo que había, o pedir preguntas nuevas */
  useEffect(() => {
    const prev = leer();
    if (prev?.preguntas?.length) {
      setE(prev);
      setFase("preguntas");
      return;
    }
    (async () => {
      let ps: string[] = [];
      try {
        const r = await fetch("/api/ai/preguntas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reglas }) });
        if (r.ok) ps = ((await r.json()) as { preguntas?: string[] }).preguntas ?? [];
      } catch {}
      if (ps.length < 3) ps = BASE;
      const nuevo = { preguntas: ps, respuestas: ps.map(() => ""), mensaje: "", i: 0 };
      setE(nuevo);
      escribir(nuevo);
      setFase("preguntas");
    })();
  }, [reglas]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const cambiar = (x: Partial<Estado>) =>
    setE((cur) => {
      if (!cur) return cur;
      const n = { ...cur, ...x };
      escribir(n);
      return n;
    });

  if (!e || fase === "cargando")
    return (
      <div className="nv" role="dialog" aria-modal="true" aria-label="Preguntas">
        <div className="nv-paper rq-centro">
          <p className="vwork"><span className="spin" aria-hidden="true" /> Preparando tus preguntas…</p>
        </div>
      </div>
    );

  const total = e.preguntas.length + 1; // + mensaje final
  const final = e.i >= e.preguntas.length;
  const valor = final ? e.mensaje : e.respuestas[e.i];
  const poner = (v: string) => (final ? cambiar({ mensaje: v }) : cambiar({ respuestas: e.respuestas.map((r, k) => (k === e.i ? v : r)) }));
  const ir = (n: number) => {
    cambiar({ i: Math.max(0, Math.min(total - 1, n)) });
    setTimeout(() => caja.current?.focus(), 50);
  };
  const respondidas = e.respuestas.filter((r) => r.trim()).length;

  const armar = async () => {
    setFase("armando");
    try {
      const r = await fetch("/api/ai/reglas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reglas, respuestas: e.preguntas.map((p, k) => ({ p, r: e.respuestas[k] })), mensaje: e.mensaje }),
      });
      if (!r.ok) throw new Error();
      const t = ((await r.json()) as { reglas?: string }).reglas ?? "";
      if (!t.trim()) throw new Error();
      setNuevas(t);
      setFase("revisar");
    } catch {
      setFase("error");
    }
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar(nuevas);
    setGuardando(false);
    if (ok) {
      escribir(null);
      onClose();
    } else setFase("error");
  };

  return (
    <div className="nv" role="dialog" aria-modal="true" aria-labelledby="rq-h">
      <div className="nv-bar ke-bar">
        <button className="nv-ib ke-ib" aria-label="Cerrar (tus respuestas se guardan)" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <h2 id="rq-h" className="nv-h">{fase === "revisar" ? "Tus reglas nuevas" : "Armar mis reglas"}</h2>
        <span style={{ flex: 1 }} />
        {fase === "preguntas" && <span className="nv-count">{e.i + 1} de {total}</span>}
      </div>

      <div className="nv-body">
        <div className="nv-paper rq">
          {fase === "preguntas" && (
            <>
              <div className="rq-barra" role="progressbar" aria-label="Avance" aria-valuemin={1} aria-valuemax={total} aria-valuenow={e.i + 1}>
                <i style={{ width: `${((e.i + 1) / total) * 100}%` }} />
              </div>
              <label htmlFor="rq-r" className="rq-p">
                {final ? "Por último: ¿algo más que quieras que tenga en cuenta? Escríbelo o díctalo con todo detalle." : e.preguntas[e.i]}
              </label>
              <textarea id="rq-r" ref={caja} className="rq-r" rows={final ? 8 : 5} placeholder={final ? "Tu mensaje…" : "Tu respuesta…"} value={valor} onChange={(x) => poner(x.target.value)} />
              <VoiceButton onText={(p) => poner([valor.trimEnd(), ...p].filter(Boolean).join("\n\n"))} />
              <div className="rq-nav">
                <button className="btn ghost" onClick={() => ir(e.i - 1)} disabled={e.i === 0}>Atrás</button>
                <span style={{ flex: 1 }} />
                {!final && !valor.trim() && (
                  <button className="linkbtn" onClick={() => ir(e.i + 1)}>Saltar</button>
                )}
                {final ? (
                  <button className="btn" onClick={armar} disabled={!respondidas && !e.mensaje.trim()}>Armar mis reglas</button>
                ) : (
                  <button className="btn" onClick={() => ir(e.i + 1)} disabled={!valor.trim()}>Siguiente</button>
                )}
              </div>
              <p className="hint">Tus respuestas se guardan en este teléfono: puedes cerrar y seguir después.</p>
            </>
          )}

          {fase === "armando" && (
            <p className="vwork rq-centro"><span className="spin" aria-hidden="true" /> Escribiendo tus reglas con tus respuestas…</p>
          )}

          {fase === "error" && (
            <div className="rq-centro">
              <p className="verr">⚠ No se pudieron armar las reglas. Tus respuestas siguen guardadas.</p>
              <div className="row actions">
                <button className="btn" onClick={armar}>Intentar otra vez</button>
                <button className="btn ghost" onClick={() => setFase("preguntas")}>Volver a las preguntas</button>
              </div>
            </div>
          )}

          {fase === "revisar" && (
            <>
              <p className="hint">Revísalas. Si algo no está bien, cámbialo aquí mismo antes de guardar.</p>
              <label htmlFor="rq-nuevas" className="sr-only">Tus reglas nuevas</label>
              <textarea id="rq-nuevas" className="rules" value={nuevas} onChange={(x) => setNuevas(x.target.value)} />
              <div className="row actions">
                <button className="btn" onClick={guardar} disabled={guardando || !nuevas.trim()}>{guardando ? "Guardando…" : "Guardar estas reglas"}</button>
                <button className="btn ghost" onClick={() => setFase("preguntas")}>Volver a las preguntas</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Empezar de cero (borra las respuestas guardadas) */
export const borrarPreguntas = () => escribir(null);
