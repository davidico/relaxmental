"use client";

import { useEffect, useRef } from "react";
import { usePush } from "@/lib/push";

/**
 * El «despertador» de la app: explica el aviso que llega a la hora de levantarse y deja activarlo.
 * Una web no puede poner la alarma del reloj del teléfono; lo que manda es una notificación.
 */
export default function AvisoDespertar({ hora, cuando, onClose }: { hora: string; cuando: string; onClose: () => void }) {
  const { st, msg, activar } = usePush();
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cerrar.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [onClose]);

  const Cuando = cuando[0].toUpperCase() + cuando.slice(1);
  return (
    <div className="modal wd-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wd av" role="dialog" aria-modal="true" aria-labelledby="av-t">
        <h2 id="av-t">Aviso para levantarte</h2>
        <p className="av-hora">{Cuando}, {hora}</p>
        {st === "on" ? (
          <p className="vok" role="status">✓ {msg || `Los avisos están activos: ${cuando} a las ${hora} te llega uno al teléfono.`}</p>
        ) : st === "denied" ? (
          <p className="verr" role="alert">⚠ Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono: Ajustes → Apps → Mi Semana (o Chrome) → Notificaciones.</p>
        ) : st === "hidden" ? (
          <p>Los avisos funcionan con tu cuenta, en la app instalada en el teléfono.</p>
        ) : (
          <>
            <p>Activa los avisos y {cuando} a las {hora} te llega uno al teléfono, aunque tengas la app cerrada.</p>
            {st === "error" && <p className="verr" role="alert">⚠ No se pudieron activar. Revisa tu conexión e inténtalo otra vez.</p>}
          </>
        )}
        <p className="av-nota">Es un aviso, no un despertador: suena una vez. Si necesitas que insista, pon también la alarma del reloj.</p>
        <div className="wd-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="ts-save" ref={cerrar} onClick={onClose}>Cerrar</button>
          {(st === "off" || st === "working" || st === "error") && (
            <button type="button" className="ts-save" onClick={activar} disabled={st === "working"}>
              {st === "working" ? "Activando…" : st === "error" ? "Reintentar" : "Activar avisos"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
