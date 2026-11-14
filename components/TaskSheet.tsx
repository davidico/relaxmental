"use client";

import { useEffect, useRef, useState } from "react";
import { useData, newId } from "@/lib/data";
import { addD, fdate, toMin } from "@/lib/dates";
import { claveDe } from "@/lib/momentos";
import WhenDialog from "./WhenDialog";
import TextoCrece from "./TextoCrece";
import { TIEMPOS, textoTiempo } from "./AnadirAqui";

type Modo = "sinhora" | "hora" | "dentro" | "luego";
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Nueva tarea (el botón + que flota): un campo para el nombre y cuatro formas de guardarla:
 * sin hora (para un día, a tu ritmo), a una hora (un momento de tu día, con su duración),
 * dentro de un momento (una subtarea suya) o más tarde (queda en Pendientes).
 * «Guardar» (o Enter) la guarda y deja el campo listo para otra. Si tiene hora, llega un aviso a esa hora.
 */
export default function TaskSheet({ onClose, inicial }: { onClose: () => void; inicial?: { due?: string; hora?: string } }) {
  const { save, hoy, planFor } = useData();
  const [title, setTitle] = useState("");
  const [step, setStep] = useState("");
  const [due, setDue] = useState(inicial?.due ?? hoy);
  const [hora, setHora] = useState(inicial?.hora ?? "");
  const [modo, setModo] = useState<Modo>(inicial?.hora ? "hora" : "sinhora");
  const [min, setMin] = useState(15);
  const [momento, setMomento] = useState("");
  const [verPaso, setVerPaso] = useState(false);
  const [verCuando, setVerCuando] = useState(false);
  const [guardadas, setGuardadas] = useState(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const stepRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "no">("default");

  useEffect(() => {
    setPermiso(typeof Notification === "undefined" ? "no" : Notification.permission);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const diaTxt = !due ? "Sin fecha" : due === hoy ? "Hoy" : due === addD(hoy, 1) ? "Mañana" : fdate(due);
  /* Los momentos de ese día donde puede ir como subtarea (hoy, solo los que no han terminado) */
  const ahora = new Date().getHours() * 60 + new Date().getMinutes();
  const momentos = modo === "dentro" && due ? planFor(due).filter((b) => !b.tarea && (due !== hoy || toMin(b.e) > ahora)) : [];
  const elegido = momentos.find((b) => claveDe(b) === momento) ?? momentos[0];

  const elegir = (m: Modo) => {
    setModo(m);
    if (m !== "luego" && !due) setDue(hoy);
    /* «A una hora» empieza en la próxima media hora; se cambia tocando la hora */
    if (m === "hora" && !hora) setHora(aHora(Math.min(1410, Math.ceil((ahora + 1) / 30) * 30)));
  };

  const puede = !!title.trim() && (modo !== "dentro" || !!elegido) && (modo !== "hora" || !!hora);
  const guardar = () => {
    if (!puede) return;
    const base = { id: newId(), title: title.trim(), step: step.trim(), done: false, created: new Date().toISOString(), meta: false };
    if (modo === "luego") save("tareas", { ...base, due: "", hora: "" });
    else if (modo === "sinhora") save("tareas", { ...base, due, hora: "" });
    else if (modo === "hora") save("tareas", { ...base, due, hora, fin: aHora(Math.min(1439, toMin(hora) + min)), min });
    else save("tareas", { ...base, due, hora: "", momento: claveDe(elegido!), min });
    setTitle("");
    setStep("");
    setVerPaso(false);
    setVerCuando(false);
    setGuardadas((n) => n + 1);
    titleRef.current?.focus();
  };

  const opcion = (m: Modo, nombre: string) => (
    <label>
      <input type="radio" name="ts-que" checked={modo === m} onChange={() => elegir(m)} />
      <span>{nombre}</span>
    </label>
  );
  const NOTAS: Record<Modo, string> = {
    sinhora: "Sale en Hoy ese día, para hacerla cuando puedas.",
    hora: "Un momento nuevo en tu día, con su hora y su aviso.",
    dentro: "Una subtarea: sale debajo de ese momento de tu día.",
    luego: "Queda en Pendientes, sin fecha.",
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={formRef}
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
        <TextoCrece ref={titleRef} id="ts-title" className="ts-title" autoFocus autoComplete="off" enterKeyHint="done" placeholder="Nueva tarea" value={title} onTexto={setTitle} onEnter={() => formRef.current?.requestSubmit()} />
        {verPaso && (
          <>
            <label htmlFor="ts-step" className="sr-only">Primer paso</label>
            <input ref={stepRef} id="ts-step" className="ts-step" autoFocus enterKeyHint="done" placeholder="Primer paso de 2 minutos" value={step} onChange={(e) => setStep(e.target.value)} />
          </>
        )}
        <fieldset className="ts-modo">
          <legend>¿Cómo la quieres?</legend>
          <div className="ts-modos">
            {opcion("sinhora", "Sin hora")}
            {opcion("hora", "A una hora")}
            {opcion("dentro", "Dentro de un momento")}
            {opcion("luego", "Más tarde")}
          </div>
          <p className="ts-nota" aria-live="polite">{NOTAS[modo]}</p>
        </fieldset>

        {modo === "dentro" &&
          (momentos.length ? (
            <div className="ts-campo">
              <label htmlFor="ts-mom">¿Dentro de cuál? ({diaTxt.toLowerCase()})</label>
              <select id="ts-mom" value={elegido ? claveDe(elegido) : ""} onChange={(e) => setMomento(e.target.value)}>
                {momentos.map((b) => (
                  <option key={claveDe(b)} value={claveDe(b)}>{b.s} · {b.t}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="hint ts-hint">{due === hoy ? "Hoy ya no quedan momentos en tu día." : "Ese día todavía no tiene momentos."} Elige otro día u otra forma.</p>
          ))}
        {(modo === "hora" || modo === "dentro") && (
          <div className="ts-campo" role="group" aria-labelledby="ts-min">
            <p id="ts-min">Tiempo aproximado</p>
            <div className="rd-chips">
              {TIEMPOS.map((m) => (
                <button key={m} type="button" aria-pressed={min === m} onClick={() => setMin(m)}>{textoTiempo(m)}</button>
              ))}
            </div>
          </div>
        )}
        {modo === "hora" && hora && permiso !== "granted" && <p className="hint ts-hint">Para que te avise a las {hora}, activa los avisos en la pantalla Hoy.</p>}

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
          {modo !== "luego" && (
            <button type="button" className="ts-chip" aria-label={modo === "hora" ? `Día y hora: ${diaTxt}, ${hora}` : `Día: ${diaTxt}`} onClick={() => setVerCuando(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {diaTxt}{modo === "hora" && hora ? ` · ${hora}` : ""}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="submit" className="ts-save" disabled={!puede}>Guardar</button>
        </div>
        {verCuando && (
          <WhenDialog
            due={due}
            hora={modo === "hora" ? hora : ""}
            hoy={hoy}
            onCancel={() => { setVerCuando(false); titleRef.current?.focus(); }}
            onDone={(d, h) => {
              setDue(d);
              if (!d) setModo("luego");
              else if (h) {
                setHora(h);
                if (modo === "sinhora") setModo("hora");
              } else if (modo === "hora") setModo("sinhora");
              setVerCuando(false);
              titleRef.current?.focus();
            }}
          />
        )}
        <p className="ts-ok" role="status">{guardadas > 0 ? `✓ ${guardadas === 1 ? "Tarea guardada" : `${guardadas} tareas guardadas`}. Escribe otra o toca fuera para cerrar.` : ""}</p>
      </form>
    </div>
  );
}
