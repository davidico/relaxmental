"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { DOW, addD, fdate, pd } from "@/lib/dates";
import { achicar } from "@/lib/imagen";
import type { Evento, Eventos } from "@/lib/plan";

type Fila = Evento & { fecha: string; k: number };
let n = 0;

/**
 * Mis compromisos: lo que tiene fecha (iglesia, turnos de trabajo, citas…).
 * Se suben con una foto (la IA los lee) o a mano, se revisan y se guardan.
 */
export default function Compromisos() {
  const { eventos, savePerfil, hoy, mode } = useData();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [estado, setEstado] = useState<"" | "leyendo" | "error" | "ok">("");
  const [verTodos, setVerTodos] = useState(false);
  const cloud = mode === "cloud";

  const subir = async (f: File) => {
    setEstado("leyendo");
    try {
      const imagen = await achicar(f);
      const r = await fetch("/api/ai/compromisos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imagen }) });
      if (!r.ok) throw new Error();
      const { eventos: evs } = (await r.json()) as { eventos: (Evento & { fecha: string })[] };
      if (!evs?.length) throw new Error();
      setFilas((x) => [...(x ?? []), ...evs.map((e) => ({ ...e, k: n++ }))]);
      setEstado("");
    } catch {
      setEstado("error");
    }
  };
  const cambiar = (k: number, p: Partial<Fila>) => setFilas((x) => x && x.map((f) => (f.k === k ? { ...f, ...p } : f)));
  const guardar = () => {
    if (!filas) return;
    const nuevas = filas.filter((f) => f.fecha && f.t.trim());
    const out: Eventos = { ...eventos };
    // Las fechas revisadas se reemplazan enteras (así no se duplican al subir la misma foto otra vez)
    for (const f of new Set(nuevas.map((x) => x.fecha))) out[f] = [];
    for (const f of nuevas) out[f.fecha].push({ t: f.t.trim(), ...(f.s ? { s: f.s } : {}), ...(f.e ? { e: f.e } : {}), ...(f.nota?.trim() ? { nota: f.nota.trim() } : {}) });
    savePerfil("eventos", out);
    setFilas(null);
    setEstado("ok");
  };
  const quitar = (fecha: string, i: number) => {
    const out: Eventos = { ...eventos, [fecha]: (eventos[fecha] ?? []).filter((_, k) => k !== i) };
    if (!out[fecha].length) delete out[fecha];
    savePerfil("eventos", out);
  };

  const proximas = Object.keys(eventos).filter((f) => f >= hoy).sort();
  const visibles = verTodos ? proximas : proximas.filter((f) => f <= addD(hoy, 30));

  return (
    <section className="card pad cmp" aria-labelledby="cmp-h">
      <h2 id="cmp-h" className="rules-h">Mis compromisos</h2>
      <p className="hint">Lo que tiene fecha: iglesia, turnos de trabajo, citas… Sube una foto (por ejemplo tu plan del mes) y lo leo. Se añaden solos a tu día.</p>

      {filas === null ? (
        <div className="row actions">
          {cloud && (
            estado === "leyendo" ? (
              <p className="vwork"><span className="spin" aria-hidden="true" /> Leyendo la foto…</p>
            ) : (
              <label className="btn rq-foto">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></svg>
                Subir foto
                <input type="file" accept="image/*" className="sr-only" onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ""; if (f) void subir(f); }} />
              </label>
            )
          )}
          <button className="btn ghost" onClick={() => setFilas([{ fecha: hoy, t: "", k: n++ }])}>Añadir a mano</button>
        </div>
      ) : (
        <div className="cmp-rev">
          <p className="flabel">Revisa y corrige antes de guardar:</p>
          {filas.map((f) => (
            <fieldset key={f.k} className="cmp-fila">
              <legend className="sr-only">Compromiso</legend>
              <label>
                <span>Fecha</span>
                <input type="date" value={f.fecha} onChange={(x) => cambiar(f.k, { fecha: x.target.value })} />
              </label>
              <label className="cmp-t">
                <span>Qué</span>
                <input value={f.t} placeholder="Ej. Turno de mañana" onChange={(x) => cambiar(f.k, { t: x.target.value })} />
              </label>
              <label>
                <span>Desde</span>
                <input type="time" value={f.s ?? ""} onChange={(x) => cambiar(f.k, { s: x.target.value || undefined })} />
              </label>
              <label>
                <span>Hasta</span>
                <input type="time" value={f.e ?? ""} onChange={(x) => cambiar(f.k, { e: x.target.value || undefined })} />
              </label>
              <button type="button" className="nv-ib sm cmp-x" aria-label={`Quitar ${f.t || "compromiso"}`} onClick={() => setFilas((x) => x && x.filter((y) => y.k !== f.k))}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </fieldset>
          ))}
          <button className="linkbtn" onClick={() => setFilas((x) => [...(x ?? []), { fecha: hoy, t: "", k: n++ }])}>+ Añadir otro</button>
          <div className="row actions">
            <button className="btn" onClick={guardar} disabled={!filas.some((f) => f.fecha && f.t.trim())}>Guardar compromisos</button>
            <button className="btn ghost" onClick={() => { setFilas(null); setEstado(""); }}>Descartar</button>
          </div>
        </div>
      )}
      {estado === "error" && <p className="verr" role="alert">⚠ No pude leer la foto. Prueba con otra más nítida, o añádelos a mano.</p>}
      {estado === "ok" && <p className="vok" role="status">✓ Compromisos guardados</p>}

      {visibles.length > 0 && (
        <ul className="cmp-lista" aria-label="Próximos compromisos">
          {visibles.map((f) => (
            <li key={f}>
              <span className="cmp-dia">{DOW[pd(f).getDay()].slice(0, 3)} {fdate(f)}</span>
              <span className="cmp-evs">
                {eventos[f].map((e, i) => (
                  <span key={i} className="cmp-ev">
                    <span>{e.t}{e.s ? ` · ${e.s}${e.e ? `–${e.e}` : ""}` : ""}{e.nota ? ` (${e.nota})` : ""}</span>
                    <button className="nv-ib sm" aria-label={`Borrar ${e.t} del ${fdate(f)}`} onClick={() => quitar(f, i)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {proximas.length > visibles.length && (
        <button className="linkbtn" onClick={() => setVerTodos(true)}>Ver todos ({proximas.length} días)</button>
      )}
    </section>
  );
}
