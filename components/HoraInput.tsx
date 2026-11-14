"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
/** Alto de cada número de la rueda (px): también es su objetivo táctil */
const ALTO = 44;
const DURACIONES = [15, 30, 45, 60, 120, 180];
const aMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const textoDur = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

/**
 * Una rueda que se gira con el dedo (o con las flechas del teclado): el número del centro es el elegido.
 * Para lectores de pantalla es un selector numérico (spinbutton).
 */
function Rueda({ valores, valor, onChange, etiqueta }: { valores: string[]; valor: string; onChange: (v: string) => void; etiqueta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, valores.indexOf(valor));

  /* Coloca la rueda en el valor (al abrir, y si cambia desde fuera: teclado, toque o atajo de duración) */
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ALTO) !== idx) el.scrollTop = idx * ALTO;
  }, [idx]);

  const ir = (i: number) => onChange(valores[Math.min(valores.length - 1, Math.max(0, i))]);

  return (
    <div
      ref={ref}
      className="rd-col"
      role="spinbutton"
      tabIndex={0}
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={valores.length - 1}
      aria-valuenow={idx}
      aria-valuetext={valor}
      onScroll={(e) => {
        const i = Math.min(valores.length - 1, Math.max(0, Math.round(e.currentTarget.scrollTop / ALTO)));
        if (valores[i] !== valor) onChange(valores[i]);
      }}
      onKeyDown={(e) => {
        const paso: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
        if (e.key in paso) ir(idx + paso[e.key]);
        else if (e.key === "Home") ir(0);
        else if (e.key === "End") ir(valores.length - 1);
        else return;
        e.preventDefault();
      }}
    >
      {valores.map((v, i) => (
        <div key={v} className={i === idx ? "on" : undefined} aria-hidden="true" onClick={() => ir(i)}>
          {v}
        </div>
      ))}
    </div>
  );
}

/**
 * Elegir una hora girando dos ruedas (hora y minutos, al minuto), en una ventana de la propia app.
 * Si se indica `desde` (la hora de inicio), salen atajos de duración: 15 min, 30 min, 1 h…
 */
export default function HoraInput({
  value,
  onChange,
  label,
  id,
  invalid,
  vacio = "--:--",
  desde,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  id?: string;
  invalid?: boolean;
  vacio?: string;
  /** Hora de inicio (HH:MM) cuando este campo es la hora de fin */
  desde?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [h, setH] = useState(value.slice(0, 2) || "08");
  const [m, setM] = useState(value.slice(3, 5) || "00");
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setH(value.slice(0, 2) || "08");
    setM(value.slice(3, 5) || "00");
    setTimeout(() => caja.current?.querySelector<HTMLElement>(".rd-col")?.focus({ preventScroll: true }), 30);
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
  const inicio = desde && /^\d{2}:\d{2}$/.test(desde) ? aMin(desde) : null;
  const dura = inicio === null ? null : aMin(`${h}:${m}`) - inicio;

  return (
    <>
      <button ref={boton} type="button" id={id} className={`hora-btn${invalid ? " bad" : ""}`} aria-label={`${label}: ${value || "sin hora"}`} aria-invalid={invalid || undefined} onClick={() => setAbierto(true)}>
        {value || vacio}
      </button>
      {abierto && (
        <div className="modal wd-back hora-back" onClick={(e) => e.target === e.currentTarget && setAbierto(false)}>
          <div className="wd hora-dlg" role="dialog" aria-modal="true" aria-labelledby="hora-tit" ref={caja}>
            <div className="hora-cab">
              <h2 id="hora-tit">{label}</h2>
              <p className="hora-ver" aria-live="polite">
                {inicio !== null && <span className="hora-desde">{desde} a </span>}
                {h}:{m}
              </p>
            </div>
            <div className="rd">
              <Rueda valores={HORAS} valor={h} onChange={setH} etiqueta="Hora" />
              <span className="rd-sep" aria-hidden="true">:</span>
              <Rueda valores={MINUTOS} valor={m} onChange={setM} etiqueta="Minutos" />
            </div>
            {inicio !== null && (
              <div className="rd-dur" role="group" aria-labelledby="hora-dur">
                <p id="hora-dur" className="hora-lbl">
                  Duración{dura !== null && dura > 0 ? `: ${textoDur(dura)}` : ""}
                </p>
                <div className="rd-chips">
                  {DURACIONES.filter((d) => inicio + d < 1440).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={dura === d}
                      onClick={() => {
                        const t = aHora(inicio + d);
                        setH(t.slice(0, 2));
                        setM(t.slice(3, 5));
                      }}
                    >
                      {textoDur(d)}
                    </button>
                  ))}
                </div>
                {dura !== null && dura <= 0 && <p className="verr" role="alert">⚠ Tiene que terminar después de las {desde}.</p>}
              </div>
            )}
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
