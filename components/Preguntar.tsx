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
  nota: "Puede equivocarse: si cita una nota, ábrela para comprobarlo. Solo cambia tu semana si aplicas lo que propone.",
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
  /* Como en el chat de Claude: al llegar la respuesta, se ve tu pregunta arriba y la respuesta desde el principio (no su final) */
  useEffect(() => {
    const ultima = charla[charla.length - 1];
    if (ultima?.de === "ia" && estado === "") {
      const mias = document.querySelectorAll<HTMLElement>(".cq-msg.yo");
      mias[mias.length - 1]?.scrollIntoView({ block: "start" });
    } else fin.current?.scrollIntoView({ block: "end" });
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
  /* El cuadro de escribir crece con el texto (hasta unas 6 líneas) */
  const caja = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [texto]);
  const nueva = () => {
    setCharla([]);
    setEstado("");
    setTexto("");
    caja.current?.focus();
  };
  const listo = puede && !!texto.trim() && estado !== "pensando";

  return (
    <>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pq-h" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet pq cq">
        <div className="cq-head">
          <button className="cq-ib" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <h2 id="pq-h" className="cq-titulo">{T.titulo}</h2>
          {charla.length > 0 ? (
            <button className="cq-ib" aria-label="Nueva conversación" title="Nueva conversación" onClick={nueva}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V12M17.6 4.6a1.9 1.9 0 0 1 2.7 2.7L12.5 15l-3.5.9.9-3.5z" /></svg>
            </button>
          ) : (
            <span className="cq-ib-hueco" aria-hidden="true" />
          )}
        </div>

        <div className="cq-log" role="log" aria-live="polite" aria-label="Conversación">
          <div className="cq-col">
            {!puede && <p className="verr" role="alert">⚠ Para preguntar necesitas haber iniciado sesión y tener conexión.</p>}
            {puede && !charla.length && (
              <div className="cq-vacio">
                <img className="cq-marca" src="/icon.svg" alt="" aria-hidden="true" />
                <p className="cq-saludo">¿En qué te ayudo?</p>
                <p className="cq-sub">{T.sub}</p>
                <div className="cq-ideas">
                  {T.ideas.map((i) =>
                    /* La idea con «…» no se envía: se deja escrita para completarla */
                    i.includes("…") ? (
                      <button key={i} type="button" className="cq-idea" onClick={() => { setTexto("¿En qué nota hablo de "); caja.current?.focus(); }}>{i}</button>
                    ) : (
                      <button key={i} type="button" className="cq-idea" onClick={() => void enviar(i)}>{i}</button>
                    ),
                  )}
                </div>
              </div>
            )}
            {charla.map((t, i) =>
              t.de === "yo" ? (
                <div key={i} className="cq-msg yo">
                  <p><span className="sr-only">Tú: </span>{t.texto}</p>
                </div>
              ) : (
                <div key={i} className="cq-msg ia">
                  <p><span className="sr-only">La IA: </span>{t.texto}</p>
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
                  <Copiar texto={t.texto} />
                </div>
              ),
            )}
            {estado === "pensando" && (
              <div className="cq-pensando" role="status">
                <img className="cq-marca chica" src="/icon.svg" alt="" aria-hidden="true" />
                <span>Pensando…</span>
              </div>
            )}
            {estado === "error" && (
              <p className="verr" role="alert">
                ⚠ No pude responder ahora. <button className="linkbtn" onClick={() => { setCharla((c) => c.slice(0, -1)); void enviar(ultimaMia); }}>Reintentar</button>
              </p>
            )}
            <div ref={fin} />
          </div>
        </div>

        <div className="cq-abajo">
          <form
            className="cq-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(texto);
            }}
          >
            <label htmlFor="pq-in" className="sr-only">Tu pregunta</label>
            <textarea
              id="pq-in"
              ref={caja}
              rows={1}
              value={texto}
              maxLength={1200}
              placeholder={charla.length ? "Responde…" : "Pregúntale lo que quieras…"}
              autoComplete="off"
              enterKeyHint="send"
              disabled={!puede}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                /* Con teclado de verdad, Intro envía y Mayúsculas+Intro hace otra línea; en el móvil, Intro hace otra línea */
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia("(pointer:fine)").matches) {
                  e.preventDefault();
                  void enviar(texto);
                }
              }}
            />
            <div className="cq-barra">
              <VoiceButton compact onText={(p) => setTexto((x) => [x.trim(), ...p].filter(Boolean).join(" "))} />
              <button className="cq-enviar" type="submit" aria-label="Enviar" disabled={!listo}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            </div>
          </form>
          <p className="cq-nota">{ia === "claude" ? "Responde Claude. " : ""}{T.nota}</p>
        </div>
      </div>
    </div>
    {/* La nota se abre fuera de la hoja, a pantalla completa, y al cerrarla sigues en la conversación */}
    {abierta && notas.some((n) => n.id === abierta) && <NoteView list={notas.filter((n) => n.id === abierta)} index={0} onIndex={() => {}} onClose={() => setAbierta(null)} />}
    </>
  );
}

/** Copiar la respuesta, como en el chat de Claude */
function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="cq-acc">
      <button
        type="button"
        className="cq-ib chico"
        aria-label={ok ? "Copiada" : "Copiar la respuesta"}
        title={ok ? "Copiada" : "Copiar"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setOk(true);
            setTimeout(() => setOk(false), 1600);
          } catch {}
        }}
      >
        {ok ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></svg>
        )}
      </button>
      {ok && <span className="cq-copiada" role="status">Copiada</span>}
    </div>
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
