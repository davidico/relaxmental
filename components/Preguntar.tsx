"use client";

import { useEffect, useRef, useState } from "react";
import { newId, useData } from "@/lib/data";
import { aplicarCambio, type Cambio } from "@/lib/cambios";
import VoiceButton from "./VoiceButton";
import NoteView from "./NoteView";

type Turno = { de: "yo" | "ia"; texto: string; fuentes?: { id: string; titulo: string }[]; cambios?: Cambio[] };
/** Antes había dos modos (tu día / tus notas); ahora es la misma IA para todo. Se deja el tipo para quien aún lo pase */
export type ModoPregunta = "dia" | "notas";
const T = {
  titulo: "Pregúntale a la IA",
  sub: "Conoce tu día, tus últimos días y todas tus notas. Pregúntale lo que quieras.",
  ideas: ["Mete mis metas de esta semana dentro de mi día", "¿Qué me recomiendas para mañana?", "¿Qué he escrito últimamente?", "¿En qué nota hablo de…? (escribe el tema)"],
  nota: "Puede equivocarse: si cita una nota, ábrela para comprobarlo. Solo cambia tu semana si tú aplicas lo que propone.",
};

/**
 * «Pregúntale a la IA»: una conversación corta, la misma desde Hoy, el botón + y el Cerebro.
 * El Worker le da todas tus notas, tu itinerario de hoy, tus últimos 14 días, lo que recuerda de ti, tus reglas y lo que puede organizar.
 * Si la respuesta cita notas, salen debajo para abrirlas. Si propone cambios en tus metas y tareas (con Claude), salen debajo con su casilla
 * y un botón «Aplicar»: nada cambia hasta que lo tocas.
 */
export default function Preguntar({ onClose }: { onClose: () => void; modo?: ModoPregunta }) {
  const { mode, offline, planFor, hoy, notas } = useData();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [charla, setCharla] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  /* Quién respondió la última vez: Claude si está conectado, o la IA de Cloudflare */
  const [ia, setIa] = useState<"" | "claude" | "cloudflare">("");
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
      const r = await fetch("/api/ai/preguntar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pregunta: q, charla: charlaTxt, itinerario: planFor(hoy).map((b) => `${b.s}-${b.e} ${b.t}`) }),
      });
      if (!r.ok) throw new Error();
      const { respuesta, fuentes, ia: quien, cambios } = (await r.json()) as { respuesta: string; fuentes?: { id: string; titulo: string }[]; ia?: "claude" | "cloudflare"; cambios?: Cambio[] };
      if (quien) setIa(quien);
      setCharla((c) => [...c, { de: "ia", texto: respuesta, fuentes: (fuentes ?? []).filter((f) => notas.some((n) => n.id === f.id)), cambios: Array.isArray(cambios) && cambios.length ? cambios : undefined }]);
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
              {!!t.cambios?.length && <Cambios cambios={t.cambios} />}
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
          <input id="pq-in" value={texto} maxLength={1200} placeholder="Escribe tu pregunta…" autoComplete="off" enterKeyHint="send" disabled={!puede} onChange={(e) => setTexto(e.target.value)} />
          <button className="btn" type="submit" disabled={!puede || !texto.trim() || estado === "pensando"}>Enviar</button>
        </form>
        <p className="pq-nota">{ia === "claude" ? "Responde Claude. " : ""}{T.nota}</p>
      </div>
    </div>
    {/* La nota se abre fuera de la hoja, a pantalla completa, y al cerrarla sigues en la conversación */}
    {abierta && notas.some((n) => n.id === abierta) && <NoteView list={notas.filter((n) => n.id === abierta)} index={0} onIndex={() => {}} onClose={() => setAbierta(null)} />}
    </>
  );
}

/**
 * Los cambios que propone la IA, cada uno con su casilla (todos marcados al principio). «Aplicar» guarda los marcados; la tarea se lee
 * de nuevo en ese momento, así que si ya la cambiaste o la marcaste hecha mientras tanto, ese cambio no se aplica.
 */
function Cambios({ cambios }: { cambios: Cambio[] }) {
  const { tareas, save } = useData();
  const [si, setSi] = useState<boolean[]>(() => cambios.map(() => true));
  const [hecho, setHecho] = useState<null | { n: number; fuera: number }>(null);
  const marcados = si.filter(Boolean).length;
  const aplicar = () => {
    let n = 0;
    let fuera = 0;
    cambios.forEach((c, i) => {
      if (!si[i]) return;
      const t = aplicarCambio(c, c.id ? tareas.find((x) => x.id === c.id) : undefined, () => ({ id: newId(), created: new Date().toISOString() }));
      if (!t) {
        fuera++;
        return;
      }
      save("tareas", t);
      n++;
    });
    setHecho({ n, fuera });
  };
  return (
    <div className="pq-cambios" role="group" aria-label="Cambios que propone">
      <p className="pq-cambios-h">{hecho ? "Cambios en tu semana" : cambios.length === 1 ? "Este cambio para tu semana" : `${cambios.length} cambios para tu semana`}</p>
      <ul>
        {cambios.map((c, i) => (
          <li key={i}>
            <label className={hecho && !si[i] ? "fuera" : ""}>
              <input type="checkbox" checked={si[i]} disabled={!!hecho} onChange={(e) => setSi((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span>{c.texto}</span>
            </label>
          </li>
        ))}
      </ul>
      {hecho ? (
        <p className="vok" role="status">
          ✓ {hecho.n === 1 ? "Listo, 1 cambio aplicado" : `Listo, ${hecho.n} cambios aplicados`}.{hecho.fuera ? ` ${hecho.fuera === 1 ? "Uno no se aplicó" : `${hecho.fuera} no se aplicaron`} porque esa tarea ya no estaba o ya estaba hecha.` : ""}
        </p>
      ) : (
        <div className="pq-cambios-pie">
          <button type="button" className="btn" disabled={!marcados} onClick={aplicar}>{marcados === cambios.length ? "Aplicar a mi semana" : `Aplicar ${marcados} de ${cambios.length}`}</button>
          <span className="pq-cambios-nota">Nada cambia hasta que lo apliques.</span>
        </div>
      )}
    </div>
  );
}
