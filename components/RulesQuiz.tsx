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

export type Modo = "inicio" | "cambios" | "completar";
/** Si cambió algo este mes */
const CAMBIOS = [
  "¿Qué cambió en tu semana este mes?",
  "¿Tienes horas nuevas de trabajo o de estudio? ¿Cuáles?",
  "¿Hay algo que ya no haces y quieres quitar del horario?",
  "¿Hay algo nuevo que quieras añadir a tu semana?",
  "¿Hay fechas especiales este mes (viajes, visitas, exámenes, fiestas)?",
];
type Estado = { preguntas: string[]; respuestas: string[]; mensaje: string; i: number; horario?: string };
const key = (m: Modo) => `mi-semana-preguntas-2-${m}`;
const leer = (m: Modo): Estado | null => {
  try {
    return JSON.parse(localStorage.getItem(key(m)) || "null");
  } catch {
    return null;
  }
};
const escribirEn = (m: Modo, e: Estado | null) => {
  try {
    if (e) localStorage.setItem(key(m), JSON.stringify(e));
    else localStorage.removeItem(key(m));
  } catch {}
};
export const hayPreguntasPendientes = (m: Modo = "completar") => !!leer(m);

/**
 * Armar las reglas con preguntas: la IA pregunta lo que falta, respondes (escribiendo o dictando),
 * dejas un mensaje final y la IA reescribe tus reglas. Tú decides si las guardas.
 * Lo respondido se guarda en el teléfono por si se cierra la app.
 */
export default function RulesQuiz({ reglas, onClose, onGuardar, modo = "completar" }: { reglas: string; onClose: () => void; onGuardar: (texto: string) => Promise<boolean> | boolean; modo?: Modo }) {
  const escribir = (e: Estado | null) => escribirEn(modo, e);
  const [e, setE] = useState<Estado | null>(null);
  const [fase, setFase] = useState<"cargando" | "hola" | "foto" | "preguntas" | "armando" | "revisar" | "error">("cargando");
  const [horario, setHorario] = useState("");
  const [leyendo, setLeyendo] = useState<"" | "leyendo" | "error">("");
  const [nuevas, setNuevas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const caja = useRef<HTMLTextAreaElement>(null);

  /* Retomar lo que había; si no, primero el paso de la foto del horario */
  useEffect(() => {
    const prev = leer(modo);
    if (prev?.preguntas?.length) {
      setE(prev);
      setFase("preguntas");
    } else setFase(modo === "inicio" ? "hola" : "foto");
  }, [modo]);

  const pedirPreguntas = async (hor: string) => {
    setFase("cargando");
    let ps: string[] = [];
    try {
      const r = await fetch("/api/ai/preguntas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reglas, horario: hor, modo }) });
      if (r.ok) ps = ((await r.json()) as { preguntas?: string[] }).preguntas ?? [];
    } catch {}
    if (ps.length < 3) ps = modo === "cambios" ? CAMBIOS : BASE;
    const nuevo = { preguntas: ps, respuestas: ps.map(() => ""), mensaje: "", i: 0, horario: hor };
    setE(nuevo);
    escribir(nuevo);
    setFase("preguntas");
  };

  /* Foto del horario: se achica en el teléfono y la IA la pasa a texto */
  const subirFoto = async (f: File) => {
    setLeyendo("leyendo");
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const imagen = c.toDataURL("image/jpeg", 0.85);
      const r = await fetch("/api/ai/horario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imagen }) });
      if (!r.ok) throw new Error();
      const t = ((await r.json()) as { texto?: string }).texto ?? "";
      if (!t.trim()) throw new Error();
      setHorario((h) => [h.trim(), t.trim()].filter(Boolean).join("\n\n"));
      setLeyendo("");
    } catch {
      setLeyendo("error");
    }
  };

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

  if (fase === "hola")
    return (
      <div className="nv" role="dialog" aria-modal="true" aria-labelledby="rq-hola">
        <div className="nv-bar ke-bar">
          <button className="nv-ib ke-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="nv-body">
          <div className="nv-paper rq">
            <div className="hy-dots" aria-hidden="true" />
            <h3 id="rq-hola" className="rq-p rq-big">Armemos tu semana</h3>
            <p className="rq-lead">Te haré unas preguntas para conocer tu día: a qué hora empiezas, qué haces, qué te importa y qué te cuesta. Con eso escribo tus reglas y armo tu horario.</p>
            <ul className="rq-pasos">
              <li>Si tu horario cambia (turnos), subes una foto.</li>
              <li>Respondes escribiendo o dictando. Puedes saltar preguntas.</li>
              <li>Al final me dejas un mensaje con lo que quieras.</li>
              <li>Revisas tus reglas y decides si las guardas.</li>
            </ul>
            <p className="hint">Son unos 10 minutos. Lo que respondas se guarda en el teléfono, así que puedes seguir después.</p>
            <div className="rq-nav">
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => setFase("foto")}>Empezar</button>
            </div>
          </div>
        </div>
      </div>
    );

  if (fase === "foto")
    return (
      <div className="nv" role="dialog" aria-modal="true" aria-labelledby="rq-fh">
        <div className="nv-bar ke-bar">
          <button className="nv-ib ke-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <h2 className="nv-h">Armar mis reglas</h2>
        </div>
        <div className="nv-body">
          <div className="nv-paper rq">
            <h3 id="rq-fh" className="rq-p">{modo === "cambios" ? "¿Tienes un horario nuevo este mes?" : "¿Tu semana cambia según un horario?"}</h3>
            <p className="hint">
              {modo === "cambios"
                ? "Si este mes tienes turnos u horarios nuevos, sube la foto o captura. Si no, sigue con las preguntas."
                : "Si trabajas por turnos o tienes un horario que cambia, sube una foto o captura y lo tengo en cuenta."}
            </p>
            {leyendo === "leyendo" ? (
              <p className="vwork"><span className="spin" aria-hidden="true" /> Leyendo tu horario…</p>
            ) : (
              <label className="btn ghost rq-foto">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></svg>
                {horario ? "Subir otra foto" : "Subir foto del horario"}
                <input type="file" accept="image/*" className="sr-only" onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ""; if (f) void subirFoto(f); }} />
              </label>
            )}
            {leyendo === "error" && <p className="verr" role="alert">⚠ No pude leer la foto. Prueba con otra más nítida, o escríbelo abajo.</p>}
            {(horario || leyendo === "error") && (
              <>
                <label htmlFor="rq-hor" className="flabel">Esto entendí de tu horario (corrígelo si hace falta):</label>
                <textarea id="rq-hor" className="rq-r" rows={8} value={horario} onChange={(x) => setHorario(x.target.value)} />
              </>
            )}
            <div className="rq-nav">
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => void pedirPreguntas(horario.trim())} disabled={leyendo === "leyendo"}>
                {horario.trim() ? "Seguir con las preguntas" : "No, empezar las preguntas"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );

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
        body: JSON.stringify({ reglas, respuestas: e.preguntas.map((p, k) => ({ p, r: e.respuestas[k] })), mensaje: e.mensaje, horario: e.horario ?? "", modo }),
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
        <h2 id="rq-h" className="nv-h">{fase === "revisar" ? "Tus reglas nuevas" : modo === "cambios" ? "Cambios del mes" : "Armar mis reglas"}</h2>
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
              <button className="linkbtn rq-reset" onClick={() => { escribir(null); setE(null); setHorario(""); setFase("foto"); }}>Empezar de nuevo con otras preguntas</button>
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
export const borrarPreguntas = (m: Modo = "completar") => escribirEn(m, null);
