"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data";
import VoiceButton from "./VoiceButton";

type Turno = { de: "yo" | "ia"; texto: string };
const IDEAS = ["¿Qué me recomiendas para mañana?", "¿En qué voy más atrasado?", "¿Cómo fue mi semana?"];

/**
 * «Pregúntale a la IA»: una conversación corta sobre tu tiempo. La IA responde con lo que
 * recuerda de ti, tus últimos 14 días y tu día de hoy. No cambia nada en la app.
 */
export default function Preguntar({ onClose }: { onClose: () => void }) {
  const { mode, offline, planFor, hoy } = useData();
  const [charla, setCharla] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  const fin = useRef<HTMLDivElement>(null);
  const puede = mode === "cloud" && !offline;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [charla, estado]);

  const enviar = async (pregunta: string) => {
    const q = pregunta.trim();
    if (!q || estado === "pensando") return;
    const previa = charla;
    setCharla([...previa, { de: "yo", texto: q }]);
    setTexto("");
    setEstado("pensando");
    try {
      const r = await fetch("/api/ai/preguntar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pregunta: q, charla: previa, itinerario: planFor(hoy).map((b) => `${b.s}-${b.e} ${b.t}`) }),
      });
      if (!r.ok) throw new Error();
      const { respuesta } = (await r.json()) as { respuesta: string };
      setCharla((c) => [...c, { de: "ia", texto: respuesta }]);
      setEstado("");
    } catch {
      setEstado("error");
    }
  };
  const ultimaMia = [...charla].reverse().find((t) => t.de === "yo")?.texto ?? "";

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pq-h" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet pq">
        <div className="sheet-head">
          <div>
            <h2 id="pq-h" className="sheet-title">Pregúntale a la IA</h2>
            <p className="sub" style={{ margin: 0 }}>Responde con lo que recuerda de ti y tus últimos días.</p>
          </div>
          <button className="nv-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="pq-cuerpo" role="log" aria-live="polite" aria-label="Conversación">
          {!puede && <p className="verr" role="alert">⚠ Para preguntar necesitas haber iniciado sesión y tener conexión.</p>}
          {puede && !charla.length && (
            <div className="pq-ideas">
              <p>Puedes empezar por algo así:</p>
              {IDEAS.map((i) => (
                <button key={i} className="btn ghost" onClick={() => void enviar(i)}>{i}</button>
              ))}
            </div>
          )}
          {charla.map((t, i) => (
            <p key={i} className={`pq-turno ${t.de}`}>
              <span className="sr-only">{t.de === "yo" ? "Tú: " : "La IA: "}</span>
              {t.texto}
            </p>
          ))}
          {estado === "pensando" && <p className="pq-turno ia pq-pensando">Pensando…</p>}
          {estado === "error" && (
            <p className="verr" role="alert">
              ⚠ No pude responder ahora. <button className="linkbtn" onClick={() => { setCharla((c) => c.slice(0, -1)); void enviar(ultimaMia); }}>Reintentar</button>
            </p>
          )}
          <div ref={fin} />
        </div>

        <form
          className="pq-pie"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <VoiceButton compact onText={(p) => setTexto((x) => [x.trim(), ...p].filter(Boolean).join(" "))} />
          <label htmlFor="pq-in" className="sr-only">Tu pregunta</label>
          <input id="pq-in" value={texto} maxLength={600} placeholder="Escribe tu pregunta…" autoComplete="off" enterKeyHint="send" disabled={!puede} onChange={(e) => setTexto(e.target.value)} />
          <button className="btn" type="submit" disabled={!puede || !texto.trim() || estado === "pensando"}>Enviar</button>
        </form>
        <p className="pq-nota">Puede equivocarse. No cambia nada en tu app.</p>
      </div>
    </div>
  );
}
