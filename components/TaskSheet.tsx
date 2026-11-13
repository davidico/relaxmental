"use client";

import { useEffect, useRef, useState } from "react";
import { useData, newId } from "@/lib/data";
import { addD, fdate } from "@/lib/dates";
import WhenDialog from "./WhenDialog";

/**
 * Nueva tarea, como Google Tasks: un solo campo. Debajo, íconos para añadir el primer paso
 * o la fecha y la hora. «Guardar» (o Enter en el teclado) la guarda y deja el campo listo para otra.
 * Si tiene hora, llega un aviso a esa hora.
 */
export default function TaskSheet({ onClose }: { onClose: () => void }) {
  const { save, hoy } = useData();
  const [title, setTitle] = useState("");
  const [step, setStep] = useState("");
  const [due, setDue] = useState(hoy);
  const [hora, setHora] = useState("");
  const [verPaso, setVerPaso] = useState(false);
  const [verCuando, setVerCuando] = useState(false);
  const [guardadas, setGuardadas] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef<HTMLInputElement>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "no">("default");

  useEffect(() => {
    setPermiso(typeof Notification === "undefined" ? "no" : Notification.permission);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const cuando = !due ? "Sin fecha" : `${due === hoy ? "Hoy" : due === addD(hoy, 1) ? "Mañana" : fdate(due)}${hora ? ` · ${hora}` : ""}`;

  const guardar = () => {
    if (!title.trim()) return;
    save("tareas", { id: newId(), title: title.trim(), step: step.trim(), due, hora: due ? hora : "", done: false, created: new Date().toISOString() });
    setTitle("");
    setStep("");
    setHora("");
    setVerPaso(false);
    setVerCuando(false);
    setGuardadas((n) => n + 1);
    titleRef.current?.focus();
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet ts"
        role="dialog"
        aria-modal="true"
        aria-label="Nueva tarea"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <label htmlFor="ts-title" className="sr-only">Nueva tarea</label>
        <input ref={titleRef} id="ts-title" className="ts-title" autoFocus autoComplete="off" enterKeyHint="done" placeholder="Nueva tarea" value={title} onChange={(e) => setTitle(e.target.value)} />
        {verPaso && (
          <>
            <label htmlFor="ts-step" className="sr-only">Primer paso</label>
            <input ref={stepRef} id="ts-step" className="ts-step" autoFocus enterKeyHint="done" placeholder="Primer paso de 2 minutos" value={step} onChange={(e) => setStep(e.target.value)} />
          </>
        )}
        {hora && permiso !== "granted" && <p className="hint ts-hint">Para que te avise a las {hora}, activa los avisos en la pantalla Hoy.</p>}
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
          <button type="button" className="nv-ib ke-ib" aria-label="Fecha y hora" title="Fecha y hora" aria-pressed={verCuando} onClick={() => setVerCuando(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </button>
          <button type="button" className="ts-chip" onClick={() => setVerCuando(true)}>{cuando}</button>
          <span style={{ flex: 1 }} />
          <button type="submit" className="ts-save" disabled={!title.trim()}>Guardar</button>
        </div>
        {verCuando && (
          <WhenDialog
            due={due}
            hora={hora}
            hoy={hoy}
            onCancel={() => { setVerCuando(false); titleRef.current?.focus(); }}
            onDone={(d, h) => { setDue(d); setHora(h); setVerCuando(false); titleRef.current?.focus(); }}
          />
        )}
        <p className="ts-ok" role="status">{guardadas > 0 ? `✓ ${guardadas === 1 ? "Tarea guardada" : `${guardadas} tareas guardadas`}. Escribe otra o toca fuera para cerrar.` : ""}</p>
      </form>
    </div>
  );
}
