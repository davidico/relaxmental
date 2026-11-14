"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data";
import { toMin } from "@/lib/dates";
import { baseDe, moverDia } from "@/lib/plan";
import { usePush } from "@/lib/push";
import { aprender, registrarCambio } from "@/lib/aprender";
import { HORAS, MINUTOS, Rueda } from "./HoraInput";

const dur = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/**
 * El despertador de la app: eliges a qué hora te levantas ese día girando las ruedas.
 * Si cambias la hora, todo el día se mueve lo mismo (los compromisos con fecha no) y el aviso llega a la hora nueva.
 * Una web no puede poner la alarma del reloj del teléfono: lo que manda es una notificación.
 */
export default function AvisoDespertar({ fecha, hora, cuando, pasado, onClose }: { fecha: string; hora: string; cuando: string; pasado?: boolean; onClose: () => void }) {
  const { dias, saveDia, perfil, savePerfil } = useData();
  const { st, msg, activar } = usePush();
  const [h, setH] = useState(hora.slice(0, 2));
  const [m, setM] = useState(hora.slice(3, 5));
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => caja.current?.querySelector<HTMLElement>(".rd-col")?.focus({ preventScroll: true }), 30);
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [onClose]);

  const delta = toMin(`${h}:${m}`) - toMin(hora);
  const guardar = () => {
    if (delta) {
      const antes = baseDe(fecha, { dias, plantilla: perfil.plantilla, eventos: perfil.eventos });
      const despues = moverDia(antes, hora, delta);
      saveDia(fecha, despues);
      /* La IA aprende de lo que cambiaste, igual que al editar el día a mano */
      const hist = registrarCambio(perfil, savePerfil, fecha, antes, despues);
      if (hist) void aprender(perfil, savePerfil, hist).catch(() => {});
    }
    onClose();
  };

  const Cuando = cuando[0].toUpperCase() + cuando.slice(1);
  return (
    <div className="modal wd-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wd av" role="dialog" aria-modal="true" aria-labelledby="av-t" ref={caja}>
        <div className="hora-cab">
          <h2 id="av-t">{pasado ? "¿A qué hora te levantaste?" : "¿A qué hora te levantas?"}</h2>
          <p className="hora-ver" aria-live="polite">{h}:{m}</p>
        </div>
        <div className="rd">
          <Rueda valores={HORAS} valor={h} onChange={setH} etiqueta="Hora" />
          <span className="rd-sep" aria-hidden="true">:</span>
          <Rueda valores={MINUTOS} valor={m} onChange={setM} etiqueta="Minutos" />
        </div>
        <p className="av-mueve" role="status">
          {delta ? `${Cuando}, todo tu día se mueve ${dur(Math.abs(delta))} ${delta > 0 ? "más tarde" : "más temprano"}.` : `${Cuando} te levantas a las ${hora}, como en tu horario.`}
        </p>
        {!pasado &&
          (st === "on" ? (
            <p className="av-nota">{msg || "Los avisos están activos: te llega uno a esa hora."} Es un aviso, no la alarma del reloj: suena una vez.</p>
          ) : st === "denied" ? (
            <p className="verr" role="alert">⚠ Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono: Ajustes → Apps → Mi Semana (o Chrome) → Notificaciones.</p>
          ) : st === "hidden" ? (
            <p className="av-nota">Con tu cuenta y la app instalada en el teléfono, te llega un aviso a esa hora.</p>
          ) : (
            <div className="av-activar">
              {st === "error" ? (
                <p className="verr" role="alert">⚠ No se pudieron activar los avisos. Inténtalo otra vez.</p>
              ) : (
                <p className="av-nota">Activa los avisos y te llega uno a esa hora, aunque tengas la app cerrada.</p>
              )}
              <button type="button" className="btn ghost sm" onClick={activar} disabled={st === "working"}>
                {st === "working" ? "Activando…" : st === "error" ? "Reintentar" : "Activar avisos"}
              </button>
            </div>
          ))}
        <div className="wd-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="ts-save" onClick={onClose}>Cancelar</button>
          <button type="button" className="ts-save" onClick={guardar}>{delta ? "Guardar" : "Listo"}</button>
        </div>
      </div>
    </div>
  );
}
