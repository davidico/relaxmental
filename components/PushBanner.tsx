"use client";

import { usePush } from "@/lib/push";

/** Aviso para activar las notificaciones de cada bloque. Desaparece cuando ya están activas. */
export default function PushBanner() {
  const { st, msg, activar } = usePush();

  if (st === "hidden" || (st === "on" && !msg)) return null;
  return (
    <div className={`card pushbanner${st === "on" ? " ok" : ""}`} role={st === "error" || st === "denied" ? "alert" : "status"}>
      <span className="pb-ico" aria-hidden="true">{st === "on" ? "✓" : "🔔"}</span>
      <div className="pb-txt">
        {st === "on" ? (
          <strong>{msg}</strong>
        ) : st === "denied" ? (
          <>
            <strong>Las notificaciones están bloqueadas</strong>
            <span>Actívalas en los ajustes del teléfono: Ajustes → Apps → Mi Semana (o Chrome) → Notificaciones.</span>
          </>
        ) : st === "error" ? (
          <>
            <strong>No se pudieron activar los avisos</strong>
            <span>Revisa tu conexión e inténtalo otra vez.</span>
          </>
        ) : (
          <>
            <strong>Activa los avisos</strong>
            <span>Te aviso al empezar cada bloque de tu día, aunque tengas la app cerrada.</span>
          </>
        )}
      </div>
      {(st === "off" || st === "working" || st === "error") && (
        <button className="btn" onClick={activar} disabled={st === "working"}>
          {st === "working" ? "Activando…" : st === "error" ? "Reintentar" : "Activar avisos"}
        </button>
      )}
    </div>
  );
}
