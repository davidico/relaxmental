"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { DOW, MES, addD, ds, pd } from "@/lib/dates";
import { anotar, bestStreak, cantidad, conUnidad, streak, tipoDe, total, type TipoHabito } from "@/lib/habits";
import type { Habito } from "@/lib/types";
import { toggleHecho } from "./ui";
import HabitoAnotar from "./HabitoAnotar";
import TextoCrece from "./TextoCrece";

const LETRAS = ["L", "M", "M", "J", "V", "S", "D"];

/** Campos para crear o cambiar un hábito: nombre, tipo y, si es medible, unidad y meta diaria */
export function CamposHabito({
  v,
  onChange,
  idp,
  sinNombre,
  onSalir,
}: {
  v: { name: string; tipo: TipoHabito; unidad: string; objetivo: string };
  onChange: (p: Partial<{ name: string; tipo: TipoHabito; unidad: string; objetivo: string }>) => void;
  idp: string;
  /** Sin el campo del nombre (cuando el nombre se cambia en otro sitio) */
  sinNombre?: boolean;
  /** Al salir de un campo de texto (para guardar al momento) */
  onSalir?: () => void;
}) {
  return (
    <>
      {!sinNombre && (
      <div className="hf-campo">
        <label htmlFor={`${idp}-n`}>Nombre</label>
        <input id={`${idp}-n`} required autoComplete="off" placeholder={v.tipo === "dejar" ? "Ej.: Redes sociales…" : v.tipo === "medible" ? "Ej.: Correr…" : "Ej.: Leer un capítulo…"} value={v.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      )}
      <div className="hf-campo">
        <label htmlFor={`${idp}-t`}>Tipo</label>
        <select id={`${idp}-t`} value={v.tipo} onChange={(e) => onChange({ tipo: e.target.value as TipoHabito })}>
          <option value="marca">De marca: lo hice o no</option>
          <option value="medible">Medible: con cantidad (km, páginas…)</option>
          <option value="dejar">Para dejar: marco los días que lo logro</option>
        </select>
      </div>
      {v.tipo === "medible" && (
        <div className="hf-dos">
          <div className="hf-campo">
            <label htmlFor={`${idp}-u`}>Unidad</label>
            <input id={`${idp}-u`} autoComplete="off" autoCapitalize="none" maxLength={12} placeholder="km, páginas, min…" value={v.unidad} onChange={(e) => onChange({ unidad: e.target.value })} onBlur={onSalir} />
          </div>
          <div className="hf-campo">
            <label htmlFor={`${idp}-o`}>Meta del día (opcional)</label>
            <input id={`${idp}-o`} inputMode="decimal" autoComplete="off" placeholder="Ej.: 5" value={v.objetivo} onChange={(e) => onChange({ objetivo: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })} onBlur={onSalir} />
          </div>
        </div>
      )}
    </>
  );
}
export const leerCampos = (v: { name: string; tipo: TipoHabito; unidad: string; objetivo: string }) => {
  const objetivo = Number(v.objetivo.replace(",", ".")) || 0;
  return {
    name: v.name.trim(),
    tipo: v.tipo,
    unidad: v.tipo === "medible" ? v.unidad.trim() || undefined : undefined,
    objetivo: v.tipo === "medible" && objetivo > 0 ? objetivo : undefined,
  };
};

/**
 * Un hábito a pantalla completa: su mes en un calendario (tocas un día para marcarlo, también los pasados),
 * sus rachas, y abajo sus ajustes. Todo se cambia ahí mismo y se guarda solo: el nombre arriba (se toca y se escribe)
 * y el tipo, la unidad y la meta debajo del calendario. Sin botón «Cambiar».
 */
export default function HabitoDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const { habitos, save, remove, hoy } = useData();
  const h = habitos.find((x) => x.id === id);
  const [mes, setMes] = useState(() => {
    const d = pd(hoy);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [anotando, setAnotando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [campos, setCampos] = useState(() => ({
    name: h?.name ?? "",
    tipo: (h ? tipoDe(h) : "marca") as TipoHabito,
    unidad: h?.unidad ?? "",
    objetivo: h?.objetivo ? String(h.objetivo).replace(".", ",") : "",
  }));
  const [nombre, setNombre] = useState(h?.name ?? "");
  const [guardado, setGuardado] = useState(false);
  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(false), 2500);
    return () => clearTimeout(t);
  }, [guardado]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  if (!h) return null;

  const tipo = tipoDe(h);
  /* Guarda los ajustes al momento. Al cambiar el tipo o la meta de un medible, se recalcula qué días cuentan como hechos */
  const guardar = (v: typeof campos) => {
    const c = leerCampos({ ...v, name: h.name });
    let nuevo: Habito = { ...h, ...c };
    if (c.tipo === "medible") for (const [d, x] of Object.entries(nuevo.cantidades ?? {})) nuevo = anotar(nuevo, d, x);
    if (JSON.stringify(nuevo) === JSON.stringify(h)) return;
    save("habitos", nuevo);
    setGuardado(true);
  };
  const guardarNombre = () => {
    const n = nombre.trim();
    if (!n) return setNombre(h.name);
    if (n === h.name) return;
    save("habitos", { ...h, name: n });
    setGuardado(true);
  };
  const s = streak(h, hoy);
  const mejor = bestStreak(h);
  const primero = ds(mes);
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const hueco = (mes.getDay() + 6) % 7; // lunes primero
  const celdas: (string | null)[] = [...Array.from({ length: hueco }, () => null), ...Array.from({ length: diasMes }, (_, i) => addD(primero, i))];
  const ultimo = addD(primero, diasMes - 1);
  const esMesActual = hoy >= primero && hoy <= ultimo;
  const hechosMes = celdas.filter((d) => d && h.hechos[d]).length;
  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1, 12));
  const tocar = (d: string) => (tipo === "medible" ? setAnotando(d) : save("habitos", toggleHecho(h, d)));
  const estado = (d: string) => {
    const c = cantidad(h, d);
    if (tipo === "medible") return c ? `${conUnidad(h, c)}${h.hechos[d] ? "" : " (sin llegar a la meta)"}` : "sin anotar";
    return h.hechos[d] ? (tipo === "dejar" ? "lo lograste" : "hecho") : "sin marcar";
  };

  return (
    <div className="nv" role="dialog" aria-modal="true" aria-label={`Hábito: ${h.name}`}>
      <div className="nv-bar ke-bar">
        <button className="nv-ib ke-ib" aria-label="Cerrar" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        {/* El nombre se cambia tocándolo: se guarda al salir o con Enter */}
        <label htmlFor="hd-nombre" className="sr-only">Nombre del hábito</label>
        <TextoCrece
          id="hd-nombre"
          className="hd-nombre"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={80}
          value={nombre}
          onTexto={setNombre}
          onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
          onBlur={guardarNombre}
        />
        <svg className="hd-lapiz" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4" /></svg>
      </div>
      <div className="nv-body">
        <div className="nv-paper hd">
          <div className="hd-datos">
            <p>
              <b>{s}</b>
              <span>{s === 1 ? "día seguido" : "días seguidos"}{tipo === "dejar" ? " lográndolo" : ""}</span>
            </p>
            <p>
              <b>{mejor}</b>
              <span>tu mejor racha</span>
            </p>
            <p>
              <b>{tipo === "medible" ? conUnidad(h, total(h, primero, ultimo)) : hechosMes}</b>
              <span>{tipo === "medible" ? "este mes" : hechosMes === 1 ? "día este mes" : "días este mes"}</span>
            </p>
          </div>

          <section className="card hd-cal" aria-labelledby="hd-mes">
            <div className="hd-cal-cab">
              <button className="nv-ib" aria-label="Mes anterior" onClick={() => mover(-1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <h3 id="hd-mes">{MES[mes.getMonth()][0].toUpperCase() + MES[mes.getMonth()].slice(1)} {mes.getFullYear()}</h3>
              <button className="nv-ib" aria-label="Mes siguiente" disabled={esMesActual} onClick={() => mover(1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="hd-grid" role="group" aria-label="Días del mes">
              {LETRAS.map((l, i) => (
                <span key={i} className="hd-dow" aria-hidden="true">{l}</span>
              ))}
              {celdas.map((d, i) =>
                d ? (
                  <button
                    key={d}
                    className={`hd-dia${h.hechos[d] ? " on" : cantidad(h, d) ? " parte" : ""}${d === hoy ? " hd-hoy" : ""}`}
                    disabled={d > hoy}
                    aria-pressed={tipo === "medible" ? undefined : !!h.hechos[d]}
                    aria-label={`${DOW[pd(d).getDay()]} ${pd(d).getDate()}: ${estado(d)}`}
                    onClick={() => tocar(d)}
                  >
                    {pd(d).getDate()}
                  </button>
                ) : (
                  <span key={`v${i}`} />
                ),
              )}
            </div>
            <p className="hint hd-ayuda">
              {tipo === "medible" ? "Toca un día para anotar o cambiar la cantidad." : tipo === "dejar" ? "Toca los días que lo lograste. También puedes marcar días anteriores." : "Toca un día para marcarlo o desmarcarlo. También los anteriores."}
            </p>
          </section>

          <section className="card pad hf hd-ajustes" aria-labelledby="hd-aj">
            <div className="hd-aj-cab">
              <h3 id="hd-aj">Ajustes</h3>
              <span className="vok hd-ok" role="status">{guardado ? "✓ Guardado" : ""}</span>
            </div>
            <CamposHabito
              v={campos}
              idp="hd"
              sinNombre
              onChange={(p) => {
                const v = { ...campos, ...p };
                setCampos(v);
                /* El tipo se guarda al elegirlo; la unidad y la meta, al salir del campo */
                if ("tipo" in p) guardar(v);
              }}
              onSalir={() => guardar(campos)}
            />
            <button className="linkbtn hd-borrar" onClick={() => setConfirmar(true)}>Borrar este hábito</button>
          </section>
          {confirmar && (
            <div className="confirm" role="alertdialog" aria-label="Borrar hábito">
              ¿Borrar «{h.name}» y todo su historial?
              <button className="btn sm warn" onClick={() => { remove("habitos", h.id); onClose(); }}>Borrar</button>
              <button className="btn sm ghost" onClick={() => setConfirmar(false)}>No</button>
            </div>
          )}
        </div>
      </div>
      {anotando && <HabitoAnotar h={h} dia={anotando} onClose={() => setAnotando(null)} />}
    </div>
  );
}
