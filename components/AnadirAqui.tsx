"use client";

import { useEffect, useRef, useState } from "react";
import { newId, useData } from "@/lib/data";
import { toMin } from "@/lib/dates";
import TextoCrece from "./TextoCrece";
import { habitoDeNombre, sortHabits } from "@/lib/habits";

/** Los tiempos aproximados que se ofrecen (minutos) */
export const TIEMPOS = [10, 15, 20, 30, 45, 60];
export const textoTiempo = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);
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
  const { save, habitos } = useData();
  const [titulo, setTitulo] = useState("");
  /* El hábito al que cuenta: undefined = se reconoce por el nombre; null = la persona lo quitó; id = elegido */
  const [habSel, setHabSel] = useState<string | null | undefined>(undefined);
  const lista = sortHabits(habitos);
  const enlazado = habSel === null ? undefined : habSel ? habitos.find((h) => h.id === habSel) : habitoDeNombre(titulo, habitos);
  const elegirHabito = (id: string) => {
    if (enlazado?.id === id) return setHabSel(null);
    const h = habitos.find((x) => x.id === id);
    if (!h) return;
    setHabSel(id);
    /* Si no había escrito nada (o había otro hábito), el nombre es el del hábito */
    if (!titulo.trim() || habitos.some((x) => x.name === titulo.trim())) setTitulo(h.name);
  };
  const [donde, setDonde] = useState(inicial);
  const [min, setMin] = useState(15);
  const [guardadas, setGuardadas] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

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
    const base = { id: newId(), title: t, step: "", due: dia, done: false, created: new Date().toISOString(), meta: false, min, ...(enlazado ? { habito: enlazado.id } : habSel === null ? { habito: "" } : {}) };
    if (donde >= 0) {
      save("tareas", { ...base, momento: dentro[donde].clave });
      /* Las subtareas suelen ir de varias en varias: la hoja sigue abierta para la siguiente */
      setTitulo("");
      setHabSel(undefined);
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
        ref={form}
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
        <TextoCrece ref={campo} id="aq-t" className="ts-title" autoFocus autoComplete="off" enterKeyHint="done" placeholder="¿Qué vas a hacer?" value={titulo} onTexto={setTitulo} onEnter={() => form.current?.requestSubmit()} />

        {lista.length > 0 && (
          <div role="group" aria-labelledby="aq-hab">
            <p id="aq-hab" className="aq-lbl">O uno de tus hábitos</p>
            <div className="rd-chips aq-habs">
              {lista.map((h) => (
                <button key={h.id} type="button" aria-pressed={enlazado?.id === h.id} onClick={() => elegirHabito(h.id)}>{h.name}</button>
              ))}
            </div>
            {enlazado && (
              <p className="aq-hab-nota" role="status">
                ✓ Al marcarla hecha, cuenta para tu hábito «{enlazado.name}».{" "}
                <button type="button" className="linkbtn" onClick={() => setHabSel(null)}>No cuenta</button>
              </p>
            )}
          </div>
        )}

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
              <button key={m} type="button" aria-pressed={min === m} onClick={() => setMin(m)}>{textoTiempo(m)}</button>
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
