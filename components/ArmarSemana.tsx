"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useData } from "@/lib/data";
import { DOW, MES, addD, pd } from "@/lib/dates";
import type { Bloque } from "@/lib/plan";

type Prop = { fecha: string; bloques?: Bloque[]; error?: boolean };

/**
 * «Armar mi semana con IA» (en Hoy › Semana): la IA propone el horario de cada día de esa semana, partiendo de la semana tipo
 * de la persona y ajustándola a sus compromisos, sus tareas y sus últimos días. Primero se ve la propuesta; nada cambia hasta «Aplicar».
 */
export default function ArmarSemana({ lunes, onClose }: { lunes: string; onClose: () => void }) {
  const { saveDia, dias, perfil, hoy } = useData();
  const fechas = Array.from({ length: 7 }, (_, i) => addD(lunes, i)).filter((f) => f >= hoy);
  const ultimo = addD(lunes, 6);
  const rango = `${pd(fechas[0] ?? lunes).getDate()} al ${pd(ultimo).getDate()} de ${MES[pd(ultimo).getMonth()]}`;
  const editados = fechas.filter((f) => dias[f]).length;
  const [props, setProps] = useState<Prop[] | null>(null);
  const [trabajando, setTrabajando] = useState("");
  const [aplicado, setAplicado] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const pedir = async (fecha: string): Promise<Prop> => {
    try {
      const r = await fetch("/api/ai/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fecha, reglas: perfil.reglas?.text ?? "" }) });
      if (!r.ok) throw new Error();
      return { fecha, bloques: ((await r.json()) as { bloques: Bloque[] }).bloques };
    } catch {
      return { fecha, error: true };
    }
  };
  const proponer = async () => {
    setAplicado(false);
    const out: Prop[] = fechas.map((fecha) => ({ fecha }));
    setProps([...out]);
    let hechos = 0;
    /* De 2 en 2 para no saturar la IA */
    for (let i = 0; i < fechas.length && vivo.current; i += 2) {
      setTrabajando(`Armando ${fechas.slice(i, i + 2).map((f) => DOW[pd(f).getDay()].toLowerCase()).join(" y ")}… (${hechos} de ${fechas.length} listos)`);
      await Promise.all(
        fechas.slice(i, i + 2).map(async (fecha, k) => {
          out[i + k] = await pedir(fecha);
          hechos++;
          if (vivo.current) setProps([...out]);
        }),
      );
    }
    if (vivo.current) setTrabajando("");
  };
  const reintentar = async (fecha: string) => {
    setProps((p) => p && p.map((x) => (x.fecha === fecha ? { fecha } : x)));
    const r = await pedir(fecha);
    if (vivo.current) setProps((p) => p && p.map((x) => (x.fecha === fecha ? r : x)));
  };
  const listos = props?.filter((p) => p.bloques?.length) ?? [];
  const aplicar = () => {
    for (const p of listos) saveDia(p.fecha, p.bloques!);
    setAplicado(true);
  };

  return createPortal(
    <div className="modal as-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet as" role="dialog" aria-modal="true" aria-labelledby="as-h">
        <div className="sheet-head">
          <div>
            <h2 id="as-h" className="sheet-title">Armar mi semana con IA</h2>
            <p className="sub" style={{ margin: 0 }}>Del {rango}</p>
          </div>
          <button className="nv-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="as-cuerpo">
          {!props ? (
            <>
              <p>La IA parte de tu semana tipo y la ajusta a esta semana: tus compromisos, tus tareas pendientes y cómo te fue los últimos días.</p>
              <p className="hint">
                Primero ves la propuesta y después decides si la aplicas.
                {editados > 0 && ` Ojo: ${editados === 1 ? "1 día de esta semana lo editaste" : `${editados} días de esta semana los editaste`} a mano; al aplicar se reemplazan.`}
              </p>
            </>
          ) : (
            <>
              {trabajando && <p className="vwork" role="status"><span className="spin" aria-hidden="true" /> {trabajando}</p>}
              <div className="plan-days as-dias">
                {props.map((p) => (
                  <details key={p.fecha} className="card plan-day" open={p.fecha === hoy}>
                    <summary>
                      <span>{DOW[pd(p.fecha).getDay()]} {pd(p.fecha).getDate()}</span>
                      <small>{p.error ? "No salió" : p.bloques ? `${p.bloques.length} momentos` : "Armando…"}</small>
                    </summary>
                    {p.error ? (
                      <div className="row actions">
                        <span className="verr">⚠ La IA no pudo armar este día.</span>
                        <button className="btn sm" onClick={() => reintentar(p.fecha)}>Reintentar</button>
                      </div>
                    ) : p.bloques ? (
                      <ol className="plan-list">
                        {p.bloques.map((b, i) => (
                          <li key={i}>
                            <span className="pt">{b.s}–{b.e}</span>
                            <span className="pn">{b.t}{b.sub && <small>{b.sub}</small>}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="vwork"><span className="spin" aria-hidden="true" /> Armando…</p>
                    )}
                  </details>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="sheet-foot as-pie">
          {!props ? (
            <>
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn" onClick={proponer} disabled={!fechas.length}>Proponer horario</button>
            </>
          ) : aplicado ? (
            <>
              <span className="vok as-nota" role="status">✓ Listo, tu semana ya tiene este horario.</span>
              <button className="btn" onClick={onClose}>Ver mi semana</button>
            </>
          ) : (
            <>
              <span className="as-nota" role="status">{trabajando ? "" : listos.length === fechas.length ? "¿Te gusta? Puedes cambiar cualquier día después." : `${listos.length} de ${fechas.length} días listos.`}</span>
              <button className="btn ghost" onClick={onClose}>Descartar</button>
              <button className="btn" onClick={aplicar} disabled={!!trabajando || !listos.length}>Aplicar a mi semana</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
