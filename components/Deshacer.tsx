"use client";

import { useEffect, useRef, useState } from "react";
import type { Borrado } from "@/lib/deshacer";

const SEGUNDOS = 7;

/**
 * Aviso de «Deshacer» tras borrar una tarea o meta: nada se pierde al instante.
 * Si borras varias seguidas, «Deshacer» las recupera todas.
 */
export default function Deshacer() {
  const [xs, setXs] = useState<Borrado[]>([]);
  const reloj = useRef<number | undefined>(undefined);
  const dentro = useRef(false);

  const programar = () => {
    clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => !dentro.current && setXs([]), SEGUNDOS * 1000);
  };
  useEffect(() => {
    const on = (e: Event) => {
      setXs((p) => [...p, (e as CustomEvent<Borrado>).detail]);
      programar();
    };
    addEventListener("mi-semana:borrado", on);
    return () => {
      removeEventListener("mi-semana:borrado", on);
      clearTimeout(reloj.current);
    };
  }, []);

  const deshacer = () => {
    xs.forEach((x) => x.deshacer());
    clearTimeout(reloj.current);
    setXs([]);
  };
  /* Mientras el puntero o el foco están encima, no se va */
  const entra = () => {
    dentro.current = true;
  };
  const sale = () => {
    dentro.current = false;
    if (xs.length) programar();
  };

  return (
    <div className="dz" role="status" aria-live="polite">
      {xs.length > 0 && (
        <div className="dz-caja" onMouseEnter={entra} onMouseLeave={sale} onFocus={entra} onBlur={sale}>
          <span className="dz-txt">{xs.length === 1 ? `Borraste «${xs[0].texto}»` : `Borraste ${xs.length} cosas`}</span>
          <button className="dz-btn" onClick={deshacer}>Deshacer</button>
        </div>
      )}
    </div>
  );
}
