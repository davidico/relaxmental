"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, pd, toMin } from "@/lib/dates";
import type { Bloque } from "@/lib/schedule";
import { AREAS, areaColor, type Area } from "@/lib/types";
import { cssC } from "./ui";

const AREA_OPTS: [Area, string][] = [...(Object.entries(AREAS) as [Area, string][]), ["rutina", "Rutina (comida, pausa…)"]];

/** Editor de un día: cambiar horas, títulos, borrar o añadir bloques */
export default function DayEditor({ date, onClose }: { date: string; onClose: () => void }) {
  const { planFor, dias, saveDia } = useData();
  const [rows, setRows] = useState<Bloque[]>(() => planFor(date).map((b) => ({ ...b })));
  const edited = !!dias[date];
  const d = pd(date);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const set = (i: number, patch: Partial<Bloque>) => setRows((r) => r.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const valid = rows.every((b) => b.t.trim() && b.s && b.e && toMin(b.e) > toMin(b.s));

  const add = () => {
    const last = rows[rows.length - 1];
    const s = last ? last.e : "08:00";
    const e = `${String(Math.min(23, Number(s.slice(0, 2)) + 1)).padStart(2, "0")}:${s.slice(3)}`;
    setRows([...rows, { s, e, t: "", a: "casa", sub: "" }]);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ed-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-head">
          <div>
            <h2 id="ed-title" className="sheet-title">Editar {DOW[d.getDay()].toLowerCase()} {d.getDate()} de {MES[d.getMonth()]}</h2>
            <p className="sub" style={{ margin: 0 }}>{edited ? "Este día ya tiene tus cambios." : "Ahora mismo es el horario automático."}</p>
          </div>
          <button className="x" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="ed-list">
          {rows.map((b, i) => {
            const bad = b.s && b.e && toMin(b.e) <= toMin(b.s);
            return (
              <div className="ed-row" key={i} style={cssC(areaColor(b.a))}>
                <div className="ed-times">
                  <input type="time" id={`ed-s-${i}`} aria-label="Empieza" value={b.s} onChange={(e) => set(i, { s: e.target.value })} />
                  <span aria-hidden="true">–</span>
                  <input type="time" id={`ed-e-${i}`} aria-label="Termina" value={b.e} onChange={(e) => set(i, { e: e.target.value })} className={bad ? "bad" : ""} />
                </div>
                <input id={`ed-t-${i}`} className="ed-name" placeholder="Qué haces" value={b.t} onChange={(e) => set(i, { t: e.target.value })} />
                <input id={`ed-sub-${i}`} className="ed-sub" placeholder="Detalle (opcional)" value={b.sub ?? ""} onChange={(e) => set(i, { sub: e.target.value })} />
                <select id={`ed-a-${i}`} aria-label="Área" value={b.a} onChange={(e) => set(i, { a: e.target.value as Area })}>
                  {AREA_OPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="x" aria-label="Quitar bloque" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={add} style={{ alignSelf: "flex-start" }}>+ Añadir bloque</button>
        </div>

        <div className="sheet-foot">
          {edited && (
            <button className="btn ghost" onClick={() => { saveDia(date, null); onClose(); }}>
              Volver al automático
            </button>
          )}
          <span style={{ flex: 1 }} />
          {!valid && <span className="ed-warn">Revisa las horas y que cada bloque tenga nombre.</span>}
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn"
            disabled={!valid}
            onClick={() => {
              const clean = rows.map((b) => ({ ...b, t: b.t.trim(), sub: b.sub?.trim() || undefined })).sort((x, y) => toMin(x.s) - toMin(y.s));
              saveDia(date, clean);
              onClose();
            }}
          >
            Guardar día
          </button>
        </div>
      </div>
    </div>
  );
}
