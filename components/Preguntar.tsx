"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data";
import VoiceButton from "./VoiceButton";
import NoteView from "./NoteView";

type Turno = { de: "yo" | "ia"; texto: string; fuentes?: { id: string; titulo: string }[] };
export type ModoPregunta = "dia" | "notas";
const TEXTOS = {
  dia: {
    titulo: "Pregúntale a la IA",
    sub: "Responde con lo que recuerda de ti y tus últimos días.",
    ideas: ["¿Qué me recomiendas para mañana?", "¿En qué voy más atrasado?", "¿Cómo fue mi semana?"],
    nota: "Puede equivocarse. No cambia nada en tu app.",
  },
  notas: {
    titulo: "Pregúntale a tus notas",
    sub: "Busca en todo tu Cerebro y te dice en qué nota está.",
    ideas: ["¿Qué he escrito últimamente?", "¿Qué ideas tengo apuntadas?", "¿En qué nota hablo de…? (escribe el tema)"],
    nota: "Puede equivocarse: abre la nota para comprobarlo. No cambia nada.",
  },
};

/**
 * «Pregúntale a la IA»: una conversación corta. No cambia nada en la app.
 * - modo «dia»: sobre tu tiempo; responde con lo que recuerda de ti, tus últimos 14 días y tu día de hoy.
 * - modo «notas»: sobre tu Cerebro; el Worker busca las notas que hablan de eso y la IA responde con ellas,
 *   diciendo en cuáles está. Debajo de la respuesta salen esas notas para abrirlas.
 */
export default function Preguntar({ onClose, modo = "dia" }: { onClose: () => void; modo?: ModoPregunta }) {
  const { mode, offline, planFor, hoy, notas } = useData();
  const T = TEXTOS[modo];
  const [abierta, setAbierta] = useState<string | null>(null);
  const [charla, setCharla] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  const fin = useRef<HTMLDivElement>(null);
  const puede = mode === "cloud" && !offline;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".nv") && onClose();
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
      const charlaTxt = previa.map((t) => ({ de: t.de, texto: t.texto }));
      const r = await fetch(modo === "notas" ? "/api/ai/notas" : "/api/ai/preguntar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(modo === "notas" ? { pregunta: q, charla: charlaTxt } : { pregunta: q, charla: charlaTxt, itinerario: planFor(hoy).map((b) => `${b.s}-${b.e} ${b.t}`) }),
      });
      if (!r.ok) throw new Error();
      const { respuesta, fuentes } = (await r.json()) as { respuesta: string; fuentes?: { id: string; titulo: string }[] };
      setCharla((c) => [...c, { de: "ia", texto: respuesta, fuentes: (fuentes ?? []).filter((f) => notas.some((n) => n.id === f.id)) }]);
      setEstado("");
    } catch {
      setEstado("error");
    }
  };
  const ultimaMia = [...charla].reverse().find((t) => t.de === "yo")?.texto ?? "";

  return (
    <>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pq-h" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet pq">
        <div className="sheet-head">
          <div>
            <h2 id="pq-h" className="sheet-title">{T.titulo}</h2>
            <p className="sub" style={{ margin: 0 }}>{T.sub}</p>
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
              {T.ideas.map((i) =>
                /* La idea con «…» no se envía: se deja escrita para completarla */
                i.includes("…") ? (
                  <button key={i} className="btn ghost" onClick={() => { setTexto("¿En qué nota hablo de "); document.getElementById("pq-in")?.focus(); }}>{i}</button>
                ) : (
                  <button key={i} className="btn ghost" onClick={() => void enviar(i)}>{i}</button>
                ),
              )}
            </div>
          )}
          {charla.map((t, i) => (
            <div key={i} className={`pq-turno ${t.de}`}>
              <p>
                <span className="sr-only">{t.de === "yo" ? "Tú: " : "La IA: "}</span>
                {t.texto}
              </p>
              {!!t.fuentes?.length && (
                <ul className="pq-fuentes" aria-label="Notas donde está">
                  {t.fuentes.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => setAbierta(f.id)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20zM14 3.5V8h4M9.5 12.5h5M9.5 16h5" /></svg>
                        <span>{f.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
        <p className="pq-nota">{T.nota}</p>
      </div>
    </div>
    {/* La nota se abre fuera de la hoja, a pantalla completa, y al cerrarla sigues en la conversación */}
    {abierta && notas.some((n) => n.id === abierta) && <NoteView list={notas.filter((n) => n.id === abierta)} index={0} onIndex={() => {}} onClose={() => setAbierta(null)} />}
    </>
  );
}
