"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, pd, toMin } from "@/lib/dates";
import type { Bloque } from "@/lib/plan";
import { areaColor } from "@/lib/types";
import { cssC } from "./ui";
import HoraInput from "./HoraInput";
import { aprender, registrarCambio } from "@/lib/aprender";


/** Editor de un día: cambiar horas, títulos, borrar o añadir bloques */
export default function DayEditor({ date, onClose }: { date: string; onClose: () => void }) {
  const { planFor, dias, saveDia, perfil, savePerfil } = useData();
  /* Las tareas con hora no se editan aquí (se cambian en la tarea) */
  const tareasDia = planFor(date).filter((b) => b.tarea);
  const [rows, setRows] = useState<Bloque[]>(() => planFor(date).filter((b) => !b.tarea).map((b) => ({ ...b })));
  const edited = !!dias[date];
  const d = pd(date);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const hhmm = (min: number) => `${String(Math.floor(Math.min(min, 1439) / 60)).padStart(2, "0")}:${String(Math.min(min, 1439) % 60).padStart(2, "0")}`;
  /* Al cambiar el final de un bloque, el siguiente empieza a esa hora (y conserva lo que duraba) */
  const set = (i: number, patch: Partial<Bloque>) =>
    setRows((r) =>
      r.map((b, j) => {
        if (j === i) return { ...b, ...patch };
        if (j === i + 1 && patch.e && toMin(patch.e) > toMin(r[i].s)) {
          const dur = Math.max(15, toMin(b.e) - toMin(b.s));
          const s = patch.e;
          const e = toMin(b.e) > toMin(s) ? b.e : hhmm(toMin(s) + dur);
          return { ...b, s, e };
        }
        return b;
      }),
    );
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
                  <HoraInput id={`ed-s-${i}`} label="Empieza" value={b.s} onChange={(v) => set(i, { s: v })} />
                  <span aria-hidden="true">–</span>
                  <HoraInput id={`ed-e-${i}`} label="Termina" value={b.e} onChange={(v) => set(i, { e: v })} invalid={!!bad} />
                </div>
                <input id={`ed-t-${i}`} className="ed-name" placeholder="Qué haces" value={b.t} onChange={(e) => set(i, { t: e.target.value })} />
                <textarea id={`ed-sub-${i}`} className="ed-sub" rows={2} placeholder="Detalle (opcional): qué vas a hacer exactamente, notas…" value={b.sub ?? ""} onChange={(e) => set(i, { sub: e.target.value })} />
                <button className="x" aria-label="Quitar bloque" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={add} style={{ alignSelf: "flex-start" }}>+ Añadir bloque</button>
          {tareasDia.length > 0 && (
            <p className="hint">También este día, por tus tareas con hora: {tareasDia.map((b) => `${b.s} ${b.t}`).join(" · ")}. Se cambian en la tarea.</p>
          )}
        </div>

        <div className="sheet-foot">
          {edited && (
            <button className="btn ghost" onClick={() => { saveDia(date, null); onClose(); }}>
              Volver al automático
            </button>
          )}
          <p className="ed-tipo">La app aprende de tus cambios y te propondrá mejoras para tus días.</p>
          <span style={{ flex: 1 }} />
          {!valid && <span className="ed-warn" role="status">Revisa: cada bloque necesita nombre y terminar después de empezar.</span>}
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn"
            disabled={!valid}
            onClick={() => {
              const clean = rows.map((b) => ({ ...b, t: b.t.trim(), sub: b.sub?.trim() || undefined })).sort((x, y) => toMin(x.s) - toMin(y.s));
              const propuesto = planFor(date).filter((b) => !b.tarea);
              saveDia(date, clean);
              /* La IA aprende de lo que cambiaste: guarda el cambio y busca conclusiones (en segundo plano) */
              const hist = registrarCambio(perfil, savePerfil, date, propuesto, clean);
              if (hist) void aprender(perfil, savePerfil, hist).catch(() => {});
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
