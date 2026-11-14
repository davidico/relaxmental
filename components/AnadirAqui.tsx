"use client";

import { useEffect, useRef, useState } from "react";
import { newId, useData } from "@/lib/data";
import { toMin } from "@/lib/dates";

const TIEMPOS = [10, 15, 20, 30, 45, 60];
const texto = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Añadir algo en un punto del día (el «+» de la línea o «Planificar»). No pregunta «¿cuándo?»: es para ese momento.
 * Puede ir dentro de un momento que ya existe (una subtarea suya) o ser un momento nuevo a esa hora,
 * y lleva un tiempo aproximado, que luego sirve para el temporizador.
 */
export default function AnadirAqui({
  dia,
  hora,
  dentro,
  inicial,
  onClose,
}: {
  dia: string;
  hora: string;
  /** Momentos vecinos donde puede ir como subtarea: su clave («hora|nombre») y su nombre */
  dentro: { clave: string; nombre: string }[];
  /** Cuál sale elegido: el índice en `dentro`, o -1 para «un momento nuevo» */
  inicial: number;
  onClose: () => void;
}) {
  const { save } = useData();
  const [titulo, setTitulo] = useState("");
  const [donde, setDonde] = useState(inicial);
  const [min, setMin] = useState(15);
  const [guardadas, setGuardadas] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const guardar = () => {
    const t = titulo.trim();
    if (!t) return;
    const base = { id: newId(), title: t, step: "", due: dia, done: false, created: new Date().toISOString(), meta: false, min };
    if (donde >= 0) {
      save("tareas", { ...base, momento: dentro[donde].clave });
      /* Las subtareas suelen ir de varias en varias: la hoja sigue abierta para la siguiente */
      setTitulo("");
      setGuardadas((n) => n + 1);
      campo.current?.focus();
    } else {
      save("tareas", { ...base, hora, fin: aHora(Math.min(1439, toMin(hora) + min)) });
      onClose();
    }
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet aq"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aq-h"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <h2 id="aq-h" className="aq-h">Añadir a tu día</h2>
        <label htmlFor="aq-t" className="sr-only">¿Qué vas a hacer?</label>
        <input ref={campo} id="aq-t" className="ts-title" autoFocus autoComplete="off" enterKeyHint="done" placeholder="¿Qué vas a hacer?" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

        {dentro.length > 0 && (
          <fieldset className="aq-donde">
            <legend>¿Dónde va?</legend>
            {dentro.map((d, i) => (
              <label key={d.clave}>
                <input type="radio" name="aq-donde" checked={donde === i} onChange={() => setDonde(i)} />
                <span>Dentro de «{d.nombre}»</span>
              </label>
            ))}
            <label>
              <input type="radio" name="aq-donde" checked={donde < 0} onChange={() => setDonde(-1)} />
              <span>Un momento nuevo, a las {hora}</span>
            </label>
          </fieldset>
        )}

        <div role="group" aria-labelledby="aq-min">
          <p id="aq-min" className="aq-lbl">Tiempo aproximado</p>
          <div className="rd-chips">
            {TIEMPOS.map((m) => (
              <button key={m} type="button" aria-pressed={min === m} onClick={() => setMin(m)}>{texto(m)}</button>
            ))}
          </div>
        </div>

        <div className="aq-pie">
          {guardadas > 0 && <span className="vok" role="status">✓ {guardadas === 1 ? "Añadida" : `${guardadas} añadidas`}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className="ts-save" onClick={onClose}>{guardadas ? "Listo" : "Cancelar"}</button>
          <button type="submit" className="ts-save" disabled={!titulo.trim()}>Añadir</button>
        </div>
      </form>
    </div>
  );
}
