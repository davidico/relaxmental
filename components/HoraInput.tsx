"use client";

import { useEffect, useRef, useState } from "react";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * Elegir una hora con la ventana de la propia app (la del sistema se corta en algunos teléfonos).
 * Primero la hora, luego los minutos (de 5 en 5). Siempre cabe en la pantalla.
 */
export default function HoraInput({
  value,
  onChange,
  label,
  id,
  invalid,
  vacio = "--:--",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  id?: string;
  invalid?: boolean;
  vacio?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [h, setH] = useState(value.slice(0, 2) || "08");
  const [m, setM] = useState(value.slice(3, 5) || "00");
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setH(value.slice(0, 2) || "08");
    setM(value.slice(3, 5) || "00");
    setTimeout(() => caja.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(), 30);
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierto(false);
        boton.current?.focus();
      }
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const listo = () => {
    onChange(`${h}:${m}`);
    setAbierto(false);
    boton.current?.focus();
  };

  return (
    <>
      <button ref={boton} type="button" id={id} className={`hora-btn${invalid ? " bad" : ""}`} aria-label={`${label}: ${value || "sin hora"}`} aria-invalid={invalid || undefined} onClick={() => setAbierto(true)}>
        {value || vacio}
      </button>
      {abierto && (
        <div className="modal wd-back hora-back" onClick={(e) => e.target === e.currentTarget && setAbierto(false)}>
          <div className="wd hora-dlg" role="dialog" aria-modal="true" aria-label={label} ref={caja}>
            <p className="hora-ver" aria-live="polite">{h}:{m}</p>
            <p className="hora-lbl">Hora</p>
            <div className="hora-grid h" role="group" aria-label="Hora">
              {HORAS.map((x) => (
                <button key={x} type="button" aria-pressed={x === h} onClick={() => setH(x)}>{x}</button>
              ))}
            </div>
            <p className="hora-lbl">Minutos</p>
            <div className="hora-grid m" role="group" aria-label="Minutos">
              {MINUTOS.map((x) => (
                <button key={x} type="button" aria-pressed={x === m} onClick={() => setM(x)}>:{x}</button>
              ))}
            </div>
            <div className="wd-foot">
              <span style={{ flex: 1 }} />
              <button type="button" className="ts-save" onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="button" className="ts-save" onClick={listo}>Listo</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
