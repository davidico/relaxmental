"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { newId, useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd } from "@/lib/dates";
import { useNow, submitOnCtrlEnter } from "@/lib/hooks";
import { leerDiario } from "@/lib/aprender";
import VoiceButton from "./VoiceButton";
import { esMeta, type Tarea } from "@/lib/types";

/** A partir de esta hora aparece el momento del diario */
export const HORA_DIARIO = 21;

/**
 * El momento del diario, al final del día: sacas lo que tienes en la cabeza,
 * se guarda en el Cerebro (sección privada «Diario») y la IA lo lee junto con
 * lo que cumpliste para proponerte cómo seguir.
 * En Hoy sale como tarjeta a partir de las 21:00; con `hoja` se abre a cualquier hora desde el ícono del diario.
 */
export default function Diario({ hoja, onClose }: { hoja?: boolean; onClose?: () => void } = {}) {
  const { hoy, notas, carpetas, tareas, save, perfil, savePerfil, mode, offline } = useData();
  const now = useNow();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"" | "leyendo" | "ok" | "sin" | "error">("");
  const [aprendido, setAprendido] = useState(0);
  const yaEscrito = notas.some((n) => n.folder === "diario" && n.ref === hoy);
  useEffect(() => {
    if (!hoja || !onClose) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [hoja, onClose]);
  if (!hoja && (now.getHours() < HORA_DIARIO || (yaEscrito && !estado))) return null;
  const id = hoja ? "dia-in-hoja" : "dia-in";

  const d = pd(hoy);
  const guardar = async () => {
    const t = texto.trim();
    if (!t) return;
    if (!carpetas.some((c) => c.id === "diario"))
      save("carpetas", { id: "diario", name: "Diario", parent: null, area: "familia", orden: 3, privada: true, created: new Date().toISOString() });
    save("notas", { id: newId(), folder: "diario", kind: "nota", title: `${DOW[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`, text: t, ref: hoy, created: new Date().toISOString() });
    setTexto("");
    if (mode !== "cloud" || offline) return setEstado("ok");
    setEstado("leyendo");
    const deHoy = tareas.filter((x) => x.due === hoy);
    const et = (x: Tarea) => `[${esMeta(x) ? "meta" : "tarea"}${esMeta(x) ? " · " + (x.lado === "trabajo" ? "trabajo" : "personal") : ""}] ${x.title}`;
    const lun = mondayOf(hoy);
    const semana = tareas
      .filter((x) => !x.done && x.due > hoy && x.due <= addD(lun, 13))
      .map((x) => `${x.due}${x.hora ? " " + x.hora : ""} ${et(x)}`);
    try {
      const n = await leerDiario(perfil, savePerfil, {
        fecha: hoy,
        texto: t,
        hechas: deHoy.filter((x) => x.done).map(et),
        pendientes: [...deHoy.filter((x) => !x.done), ...tareas.filter((x) => !x.done && x.due && x.due < hoy)].map((x) => `${x.due < hoy ? "(del " + x.due + ") " : ""}${et(x)}`),
        semana,
      });
      setAprendido(n.recuerdos);
      setEstado(n.propuestas ? "ok" : "sin");
    } catch {
      setEstado("error");
    }
  };

  const hechas = tareas.filter((x) => x.due === hoy && x.done).length;
  const total = tareas.filter((x) => x.due === hoy).length;

  const cuerpo = (
    <>
      {estado ? (
        <>
          <p className="vok" role="status">✓ Guardado en tu Diario.</p>
          {estado === "leyendo" && <p role="status">Lo estoy leyendo para proponerte cómo seguir…</p>}
          {estado === "ok" && mode === "cloud" && <p>Mira abajo mis propuestas para ti.</p>}
          {estado === "sin" && <p>Hoy no tengo propuestas nuevas. ¡Descansa!</p>}
          {aprendido > 0 && (
            <p>
              Apunté {aprendido === 1 ? "1 cosa nueva" : `${aprendido} cosas nuevas`} en <Link href="/perfil/memoria">lo que recuerdo de ti</Link>.
            </p>
          )}
          {estado === "error" && <p className="verr" role="alert">⚠ No pude leerlo ahora. Tu diario está guardado.</p>}
        </>
      ) : yaEscrito ? (
        <p>
          Ya escribiste tu diario de hoy. Lo tienes en el <Link href="/cerebro">Cerebro</Link>, en la sección Diario.
        </p>
      ) : (
        <form
          className="dia-form"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <p>
            {total ? `Hoy cumpliste ${hechas} de ${total}. ` : ""}Saca lo que tengas en la cabeza: cómo te fue, qué te preocupa, ideas. Lo leo y te propongo cómo seguir.
          </p>
          <label htmlFor={id} className="sr-only">Tu diario de hoy</label>
          <textarea id={id} rows={hoja ? 6 : 4} placeholder="Escribe o dicta…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={submitOnCtrlEnter} />
          <div className="row actions">
            <VoiceButton onText={(p) => setTexto((x) => [x.trim(), ...p].filter(Boolean).join("\n\n"))} />
            <button className="btn" type="submit" disabled={!texto.trim()}>Guardar</button>
          </div>
        </form>
      )}
    </>
  );
  if (hoja)
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dia-h-hoja" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
        <div className="sheet dia-hoja">
          <div className="sheet-head">
            <h2 id="dia-h-hoja" className="sheet-title">¿Cómo fue tu día?</h2>
            <button className="nv-ib" aria-label="Cerrar" onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="diario dia-hoja-c">{cuerpo}</div>
        </div>
      </div>
    );
  return (
    <section className="card pad hy-aviso diario" aria-labelledby="dia-h">
      <h2 id="dia-h" className="hy-h">¿Cómo fue tu día?</h2>
      {cuerpo}
    </section>
  );
}
