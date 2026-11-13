"use client";

import { useEffect, useRef, useState } from "react";
import { MES, addD, ds, pd } from "@/lib/dates";

const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Elegir fecha y hora, como Google Tasks: un calendario del mes, debajo «Fijar hora»,
 * y abajo Sin fecha · Cancelar · Listo.
 */
export default function WhenDialog({
  due,
  hora,
  hoy,
  onDone,
  onCancel,
}: {
  due: string;
  hora: string;
  hoy: string;
  onDone: (due: string, hora: string) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = useState(due || hoy);
  const [h, setH] = useState(hora);
  const [verHora, setVerHora] = useState(!!hora);
  const [mes, setMes] = useState(() => {
    const d = pd(due || hoy);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const horaRef = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [onCancel]);

  useEffect(() => {
    if (!verHora || h) return;
    const el = horaRef.current;
    el?.focus();
    try {
      (el as HTMLInputElement & { showPicker?: () => void })?.showPicker?.();
    } catch {}
  }, [verHora]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Celdas del mes: empieza en lunes */
  const primero = ds(mes);
  const hueco = (mes.getDay() + 6) % 7;
  const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: (string | null)[] = [...Array(hueco).fill(null), ...Array.from({ length: total }, (_, i) => addD(primero, i))];
  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1, 12));

  return (
    <div className="modal wd-back" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="wd" role="dialog" aria-modal="true" aria-labelledby="wd-mes" ref={caja}>
        <div className="wd-head">
          <button type="button" className="nv-ib ke-ib" aria-label="Mes anterior" onClick={() => mover(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <h2 id="wd-mes">{MES[mes.getMonth()][0].toUpperCase() + MES[mes.getMonth()].slice(1)} {mes.getFullYear()}</h2>
          <button type="button" className="nv-ib ke-ib" aria-label="Mes siguiente" onClick={() => mover(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="wd-grid" role="group" aria-label="Días del mes">
          {DIAS.map((d, i) => (
            <span key={i} className="wd-dow" aria-hidden="true">{d}</span>
          ))}
          {celdas.map((c, i) =>
            c ? (
              <button
                key={c}
                type="button"
                className={`wd-day${c === hoy ? " wd-hoy" : ""}`}
                aria-pressed={c === sel}
                aria-label={`${DIAS_LARGO[pd(c).getDay()]} ${pd(c).getDate()} de ${MES[pd(c).getMonth()]}${c === hoy ? ", hoy" : ""}`}
                onClick={() => setSel(c)}
              >
                {pd(c).getDate()}
              </button>
            ) : (
              <span key={`v${i}`} />
            ),
          )}
        </div>

        <div className="wd-row">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          {verHora ? (
            <>
              <label htmlFor="wd-h" className="sr-only">Hora</label>
              <input id="wd-h" ref={horaRef} type="time" value={h} onChange={(e) => setH(e.target.value)} />
              <button type="button" className="linkbtn" onClick={() => { setH(""); setVerHora(false); }}>Quitar</button>
            </>
          ) : (
            <button type="button" className="wd-rowbtn" onClick={() => setVerHora(true)}>Fijar hora</button>
          )}
        </div>

        <div className="wd-foot">
          <button type="button" className="linkbtn" onClick={() => onDone("", "")}>Sin fecha</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ts-save" onClick={onCancel}>Cancelar</button>
          <button type="button" className="ts-save" onClick={() => onDone(sel, verHora ? h : "")}>Listo</button>
        </div>
      </div>
    </div>
  );
}
