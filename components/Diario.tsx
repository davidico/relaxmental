"use client";

import { useState } from "react";
import { newId, useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd } from "@/lib/dates";
import { useNow, submitOnCtrlEnter } from "@/lib/hooks";
import { leerDiario } from "@/lib/aprender";
import VoiceButton from "./VoiceButton";

/** A partir de esta hora aparece el momento del diario */
export const HORA_DIARIO = 21;

/**
 * El momento del diario, al final del día: sacas lo que tienes en la cabeza,
 * se guarda en el Cerebro (sección privada «Diario») y la IA lo lee junto con
 * lo que cumpliste para proponerte cómo seguir.
 */
export default function Diario() {
  const { hoy, notas, carpetas, tareas, save, perfil, savePerfil, mode, offline } = useData();
  const now = useNow();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"" | "leyendo" | "ok" | "sin" | "error">("");
  const yaEscrito = notas.some((n) => n.folder === "diario" && n.ref === hoy);
  if (now.getHours() < HORA_DIARIO || (yaEscrito && !estado)) return null;

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
    const lun = mondayOf(hoy);
    const semana = tareas
      .filter((x) => !x.done && x.due > hoy && x.due <= addD(lun, 13))
      .map((x) => `${x.due}${x.hora ? " " + x.hora : ""} [${x.lado === "trabajo" ? "trabajo" : "personal"}] ${x.title}`);
    try {
      const n = await leerDiario(perfil, savePerfil, {
        fecha: hoy,
        texto: t,
        hechas: deHoy.filter((x) => x.done).map((x) => x.title),
        pendientes: [...deHoy.filter((x) => !x.done), ...tareas.filter((x) => !x.done && x.due && x.due < hoy)].map((x) => `[${x.lado === "trabajo" ? "trabajo" : "personal"}] ${x.title}`),
        semana,
      });
      setEstado(n ? "ok" : "sin");
    } catch {
      setEstado("error");
    }
  };

  const hechas = tareas.filter((x) => x.due === hoy && x.done).length;
  const total = tareas.filter((x) => x.due === hoy).length;

  return (
    <section className="card pad hy-aviso diario" aria-labelledby="dia-h">
      <h2 id="dia-h" className="hy-h">¿Cómo fue tu día?</h2>
      {estado ? (
        <>
          <p className="vok" role="status">✓ Guardado en tu Diario.</p>
          {estado === "leyendo" && <p role="status">Lo estoy leyendo para proponerte cómo seguir…</p>}
          {estado === "ok" && mode === "cloud" && <p>Mira abajo mis propuestas para ti.</p>}
          {estado === "sin" && <p>Hoy no tengo propuestas nuevas. ¡Descansa!</p>}
          {estado === "error" && <p className="verr" role="alert">⚠ No pude leerlo ahora. Tu diario está guardado.</p>}
        </>
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
          <label htmlFor="dia-in" className="sr-only">Tu diario de hoy</label>
          <textarea id="dia-in" rows={4} placeholder="Escribe o dicta…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={submitOnCtrlEnter} />
          <div className="row actions">
            <VoiceButton onText={(p) => setTexto((x) => [x.trim(), ...p].filter(Boolean).join("\n\n"))} />
            <button className="btn" type="submit" disabled={!texto.trim()}>Guardar</button>
          </div>
        </form>
      )}
    </section>
  );
}
