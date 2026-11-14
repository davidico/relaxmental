"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, pd } from "@/lib/dates";
import { anotar, cantidad, conUnidad, num, pasosDe } from "@/lib/habits";
import type { Habito } from "@/lib/types";

/** Anotar la cantidad de un día en un hábito medible: escribirla o sumar con atajos */
export default function HabitoAnotar({ h, dia, onClose }: { h: Habito; dia: string; onClose: () => void }) {
  const { save, hoy } = useData();
  const previa = cantidad(h, dia);
  const [txt, setTxt] = useState(previa ? num(previa) : "");
  const valor = Number(txt.replace(",", ".")) || 0;
  const f = pd(dia);
  const cuando = dia === hoy ? "hoy" : `${DOW[f.getDay()].toLowerCase()} ${f.getDate()} de ${MES[f.getMonth()]}`;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [onClose]);

  const guardar = () => {
    save("habitos", anotar(h, dia, valor));
    onClose();
  };

  return (
    <div className="modal wd-back ha-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="wd ha"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ha-h"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <div className="ha-cab">
          <h2 id="ha-h">Anotar {h.name}</h2>
          <p>Cuánto fue {cuando}</p>
        </div>
        <label className="ha-campo" htmlFor="ha-in">
          <span className="sr-only">Cantidad{h.unidad ? ` en ${h.unidad}` : ""}</span>
          <input id="ha-in" autoFocus inputMode="decimal" autoComplete="off" placeholder="0" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} />
          {h.unidad && <span className="ha-unidad" aria-hidden="true">{h.unidad}</span>}
        </label>
        <div className="ha-rapido" role="group" aria-label="Sumar rápido">
          {pasosDe(h).map((p) => (
            <button key={p} type="button" onClick={() => setTxt(num(valor + p))} aria-label={`Sumar ${conUnidad(h, p)}`}>
              +{num(p)}
            </button>
          ))}
        </div>
        {h.objetivo ? <p className="ha-meta">Tu meta del día: {conUnidad(h, h.objetivo)}</p> : null}
        <div className="wd-foot">
          {previa > 0 && (
            <button type="button" className="linkbtn" onClick={() => { save("habitos", anotar(h, dia, 0)); onClose(); }}>
              Borrar lo anotado
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="ts-save" onClick={onClose}>Cancelar</button>
          <button type="submit" className="ts-save">Guardar</button>
        </div>
      </form>
    </div>
  );
}
