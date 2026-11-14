"use client";

import { useEffect, useRef, useState } from "react";
import { useData, newId } from "@/lib/data";
import { addD, fdate, toMin } from "@/lib/dates";
import { bloqueDeSub, claveDe } from "@/lib/momentos";
import { borrarTarea } from "@/lib/deshacer";
import type { Tarea } from "@/lib/types";
import WhenDialog from "./WhenDialog";
import TextoCrece from "./TextoCrece";
import { TIEMPOS, textoTiempo } from "./AnadirAqui";

const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Nueva tarea (el botón + que flota), lo más simple posible: un campo para el nombre y un reloj.
 * - Sin tocar el reloj: queda en Pendientes, sin fecha y sin presión.
 * - Con el reloj se le pone un día (sale en Hoy ese día, sin hora) y, si se quiere, una hora
 *   (entonces es un momento de ese día, con su tiempo aproximado y su aviso).
 * «Guardar» (o Enter) la guarda y deja el campo listo para otra.
 * Con `editar` es la misma hoja para cambiar una tarea que ya existe (todo se puede cambiar) o borrarla;
 * si es una subtarea, además deja elegir dentro de qué momento va.
 */
export default function TaskSheet({ onClose, inicial, editar }: { onClose: () => void; inicial?: { due?: string; hora?: string }; editar?: Tarea }) {
  const { save, remove, hoy, planFor } = useData();
  const [title, setTitle] = useState(editar?.title ?? "");
  const [step, setStep] = useState(editar?.step ?? "");
  const [due, setDue] = useState(editar ? editar.due : inicial?.due ?? "");
  const [hora, setHora] = useState(editar?.hora ?? inicial?.hora ?? "");
  const [min, setMin] = useState(() => {
    if (editar?.min) return editar.min;
    const d = editar?.hora && editar.fin ? toMin(editar.fin) - toMin(editar.hora) : 0;
    return d > 0 ? d : 30;
  });
  const [momento, setMomento] = useState(editar?.momento ?? "");
  const [verPaso, setVerPaso] = useState(!!editar?.step);
  const [verCuando, setVerCuando] = useState(false);
  const [guardadas, setGuardadas] = useState(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const stepRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "no">("default");

  useEffect(() => {
    setPermiso(typeof Notification === "undefined" ? "no" : Notification.permission);
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".wd") && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const diaTxt = !due ? "" : due === hoy ? "Hoy" : due === addD(hoy, 1) ? "Mañana" : fdate(due);
  /* Una subtarea (solo al editar): los momentos de ese día donde puede ir */
  const esSub = !!editar?.momento && !!due && !hora;
  const momentos = esSub ? planFor(due).filter((b) => !b.tarea) : [];
  const suyo = esSub && momento ? bloqueDeSub(momento, momentos) : undefined;

  const puede = !!title.trim();
  const guardar = () => {
    if (!puede) return;
    /* Lo que dice el reloj: sin fecha, un día, o un día con hora (y entonces su duración) */
    const cuando = !due
      ? { due: "", hora: "", fin: undefined, min: undefined, momento: undefined }
      : hora
        ? { due, hora, fin: aHora(Math.min(1439, toMin(hora) + min)), min, momento: undefined }
        : { due, hora: "", fin: undefined, min: suyo ? min : undefined, momento: suyo ? claveDe(suyo) : undefined };
    if (editar) {
      save("tareas", { ...editar, title: title.trim(), step: step.trim(), ...cuando });
      onClose();
      return;
    }
    save("tareas", { id: newId(), title: title.trim(), step: step.trim(), done: false, created: new Date().toISOString(), meta: false, ...cuando });
    setTitle("");
    setStep("");
    setHora("");
    setVerPaso(false);
    setVerCuando(false);
    setGuardadas((n) => n + 1);
    titleRef.current?.focus();
  };

  const nota = !due ? "Sin fecha: queda en Pendientes, para cuando puedas." : hora ? `${diaTxt} a las ${hora}: entra en tu día a esa hora.` : suyo ? `${diaTxt}, dentro de «${suyo.t}».` : `${diaTxt}, sin hora: sale en Hoy ese día.`;

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={formRef}
        className="sheet ts"
        role="dialog"
        aria-modal="true"
        aria-label={editar ? "Editar tarea" : "Nueva tarea"}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <label htmlFor="ts-title" className="sr-only">{editar ? "Nombre de la tarea" : "Nueva tarea"}</label>
        <TextoCrece ref={titleRef} id="ts-title" className="ts-title" autoFocus={!editar} autoComplete="off" enterKeyHint="done" placeholder="Nueva tarea" value={title} onTexto={setTitle} onEnter={() => formRef.current?.requestSubmit()} />
        {verPaso && (
          <>
            <label htmlFor="ts-step" className="sr-only">Primer paso</label>
            <input ref={stepRef} id="ts-step" className="ts-step" autoFocus={!editar} enterKeyHint="done" placeholder="Primer paso de 2 minutos" value={step} onChange={(e) => setStep(e.target.value)} />
          </>
        )}

        {esSub && momentos.length > 0 && (
          <div className="ts-campo">
            <label htmlFor="ts-mom">Dentro de</label>
            <select id="ts-mom" value={suyo ? claveDe(suyo) : ""} onChange={(e) => setMomento(e.target.value)}>
              {momentos.map((b) => (
                <option key={claveDe(b)} value={claveDe(b)}>{b.s} · {b.t}</option>
              ))}
              <option value="">Ningún momento (tarea del día)</option>
            </select>
          </div>
        )}
        {(!!hora || !!suyo) && !!due && (
          <div className="ts-campo" role="group" aria-labelledby="ts-min">
            <p id="ts-min">Tiempo aproximado</p>
            <div className="rd-chips">
              {TIEMPOS.map((m) => (
                <button key={m} type="button" aria-pressed={min === m} onClick={() => setMin(m)}>{textoTiempo(m)}</button>
              ))}
            </div>
          </div>
        )}
        <p className="ts-nota" aria-live="polite">{nota}</p>
        {!!due && !!hora && permiso !== "granted" && <p className="hint ts-hint">Para que te avise a las {hora}, activa los avisos en la pantalla Hoy.</p>}

        <div className="ts-bar">
          <button
            type="button"
            className="nv-ib ke-ib"
            aria-label="Añadir primer paso"
            title="Primer paso"
            aria-pressed={verPaso}
            onPointerDown={(e) => e.preventDefault() /* no quitar el foco: el teclado sigue abierto */}
            onClick={() => {
              if (verPaso && !step.trim()) {
                setVerPaso(false);
                titleRef.current?.focus();
              } else if (verPaso) stepRef.current?.focus();
              else setVerPaso(true);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          </button>
          {/* El reloj: sin fecha es solo el ícono; con fecha, dice cuál */}
          <button type="button" className={due ? "ts-chip" : "nv-ib ke-ib"} aria-label={due ? `Fecha y hora: ${diaTxt}${hora ? `, ${hora}` : ""}. Cambiar` : "Poner fecha y hora"} title="Fecha y hora" onClick={() => setVerCuando(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {due ? `${diaTxt}${hora ? ` · ${hora}` : ""}` : null}
          </button>
          <span style={{ flex: 1 }} />
          {editar && (
            <button type="button" className="ts-save ts-borrar" onClick={() => { borrarTarea(editar, save, remove); onClose(); }}>Borrar</button>
          )}
          <button type="submit" className="ts-save" disabled={!puede}>Guardar</button>
        </div>
        {verCuando && (
          <WhenDialog
            due={due}
            hora={hora}
            hoy={hoy}
            onCancel={() => { setVerCuando(false); if (!editar) titleRef.current?.focus(); }}
            onDone={(d, h) => {
              setDue(d);
              setHora(d ? h : "");
              setVerCuando(false);
              if (!editar) titleRef.current?.focus();
            }}
          />
        )}
        <p className="ts-ok" role="status">{guardadas > 0 ? `✓ ${guardadas === 1 ? "Tarea guardada" : `${guardadas} tareas guardadas`}. Escribe otra o toca fuera para cerrar.` : ""}</p>
      </form>
    </div>
  );
}
