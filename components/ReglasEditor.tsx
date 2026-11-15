"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import VoiceButton from "./VoiceButton";

/**
 * Las reglas a pantalla completa, para leerlas y cambiarlas con tranquilidad (se abre con el lápiz de «Mis reglas»).
 * Como en las notas: al volver (← o Escape) se guarda lo que cambiaste; «Descartar» lo deja como estaba.
 * No pone el cursor al abrir, para poder leer sin que salte el teclado.
 */
export default function ReglasEditor({
  texto,
  propuesta,
  onGuardar,
  onClose,
}: {
  texto: string;
  /** Un texto nuevo que propone la IA (p. ej. las reglas puestas al día con la semana tipo): se abre con él para revisarlo; «Descartar» deja el de antes */
  propuesta?: string;
  onGuardar: (t: string) => void;
  onClose: () => void;
}) {
  const [t, setT] = useState(propuesta ?? texto);
  const caja = useRef<HTMLTextAreaElement>(null);
  const cambiado = t !== texto;
  const volver = () => {
    if (cambiado) onGuardar(t);
    onClose();
  };
  /* El cuadro crece con el texto: se lee todo de corrido, deslizando la pantalla */
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [t]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && volver();
    addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  });

  return createPortal(
    <div className="nv ke re" role="dialog" aria-modal="true" aria-labelledby="re-h">
      <div className="nv-bar ke-bar">
        <button className="nv-ib ke-ib" aria-label={cambiado ? "Guardar y volver" : "Volver"} onClick={volver}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        <h2 id="re-h" className="re-h">Mis reglas</h2>
        <span style={{ flex: 1 }} />
        {cambiado && <button type="button" className="linkbtn re-descartar" onClick={onClose}>Descartar</button>}
        <VoiceButton compact onText={(p) => setT((r) => [r.trimEnd(), ...p].filter(Boolean).join("\n\n"))} />
      </div>
      <div className="nv-body">
        <div className="nv-paper ke-paper re-papel">
          {propuesta !== undefined ? (
            <p className="re-aviso" role="note">
              La IA puso tus reglas al día con tu semana tipo. Léelas y corrige lo que quieras: al volver (←) se guardan; con «Descartar» se quedan como estaban.
            </p>
          ) : (
            <p className="hint re-ayuda">Escríbelas como se las dirías a alguien: horas, días y excepciones. La IA las lee cuando te propone horarios. Al volver se guardan solas.</p>
          )}
          <label htmlFor="re-texto" className="sr-only">Mis reglas</label>
          <textarea id="re-texto" ref={caja} className="re-texto" value={t} placeholder="Por ejemplo: Me levanto a las 7. Trabajo de 9 a 13. Los domingos descanso…" spellCheck onChange={(e) => setT(e.target.value)} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
