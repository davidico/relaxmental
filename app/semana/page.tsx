"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Planner, { type Lado } from "@/components/Planner";
import PlanificarSemana from "@/components/PlanificarSemana";
import { MES, addD, mondayOf, pd, today } from "@/lib/dates";

const LADOS: Lado[] = ["personal", "trabajo"];
const HUECO = 24; /* el espacio entre los dos lados mientras se deslizan (igual que en el CSS) */
const DURA = 320;
const sinMovimiento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion:reduce)").matches;

/** Planner: lo que te propones cada día de la semana, con una pestaña para tu vida personal y otra para el trabajo, cada una con su color */
export default function Semana() {
  const [lado, setLado] = useState<Lado>("personal");
  useEffect(() => {
    try {
      if (localStorage.getItem("mi-semana-lado") === "trabajo") setLado("trabajo");
    } catch {}
  }, []);

  /* Deslizador entre Personal y Trabajo. En reposo solo existe el lado elegido; mientras se pasa de uno a otro (al tocar una pestaña
     o al arrastrar con el dedo) están los dos, uno junto al otro, y la pista se mueve. La posición (0 = personal, 1 = trabajo) se pinta
     directamente en el DOM para no redibujar el planner en cada movimiento del dedo. */
  const [ambos, setAmbos] = useState(false);
  const pista = useRef<HTMLDivElement>(null);
  const raya = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([null, null]);
  const ladoRef = useRef<Lado>(lado);
  ladoRef.current = lado;
  const pend = useRef<{ desde: number; hasta: number | null } | null>(null);
  const fin = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesto = useRef<{ id: number; x: number; y: number; t: number; arrastra: boolean; pos: number } | null>(null);
  const soltado = useRef(0);

  const pintarRaya = useCallback((pos: number, animar: boolean) => {
    const r = raya.current;
    const [a, b] = tabs.current;
    if (!r || !a || !b) return;
    const p = Math.min(1, Math.max(0, pos));
    r.style.transition = animar && !sinMovimiento() ? "" : "none";
    r.style.left = `${a.offsetLeft + (b.offsetLeft - a.offsetLeft) * p}px`;
    r.style.width = `${a.offsetWidth + (b.offsetWidth - a.offsetWidth) * p}px`;
    r.style.backgroundColor = `color-mix(in srgb,var(--vivo-trabajo) ${Math.round(p * 100)}%,var(--vivo-personal))`;
  }, []);
  const pintar = useCallback(
    (pos: number, animar: boolean) => {
      const el = pista.current;
      if (el) {
        el.style.transition = animar && !sinMovimiento() ? "" : "none";
        el.style.setProperty("--pl-pos", String(pos));
      }
      pintarRaya(pos, animar);
    },
    [pintarRaya],
  );
  const terminar = useCallback(() => {
    if (fin.current) clearTimeout(fin.current);
    fin.current = setTimeout(() => setAmbos(false), sinMovimiento() ? 0 : DURA + 40);
  }, []);
  useEffect(() => () => { if (fin.current) clearTimeout(fin.current); }, []);

  /* Cuando ya están los dos lados en pantalla: se colocan donde estaba el de antes y, si toca, se desliza al nuevo */
  useLayoutEffect(() => {
    const q = pend.current;
    if (!ambos || !q) return;
    pend.current = null;
    pintar(gesto.current?.arrastra ? gesto.current.pos : q.desde, false);
    if (q.hasta === null) return;
    void pista.current?.offsetWidth;
    pintar(q.hasta, true);
    terminar();
  }, [ambos, pintar, terminar]);
  /* En reposo, la raya está debajo de la pestaña elegida (también si cambia el ancho de la pantalla) */
  useLayoutEffect(() => {
    if (ambos) return;
    const poner = () => pintarRaya(LADOS.indexOf(ladoRef.current), false);
    poner();
    addEventListener("resize", poner);
    return () => removeEventListener("resize", poner);
  }, [lado, ambos, pintarRaya]);

  const guardarLado = (l: Lado) => {
    setLado(l);
    try {
      localStorage.setItem("mi-semana-lado", l);
    } catch {}
  };
  const cambiar = (l: Lado) => {
    if (l === lado) return;
    const desde = LADOS.indexOf(lado);
    guardarLado(l);
    if (ambos) {
      /* Ya se estaba deslizando: cambia de rumbo */
      pintar(LADOS.indexOf(l), true);
      terminar();
    } else {
      pend.current = { desde, hasta: LADOS.indexOf(l) };
      setAmbos(true);
    }
  };

  /* Arrastrar con el dedo. El navegador se queda con el movimiento vertical (touch-action: pan-y); el horizontal mueve la pista. */
  const alTocar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    const t = e.target as HTMLElement;
    if (t.closest(".modal,[role='dialog'],input,textarea,select,[contenteditable='true']")) return;
    /* Los bordes de la pantalla son del gesto «atrás» del teléfono */
    if (e.clientX < 24 || e.clientX > innerWidth - 24) return;
    gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, arrastra: false, pos: LADOS.indexOf(lado) };
  };
  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.arrastra) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        gesto.current = null;
        return;
      }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      g.arrastra = true;
      g.x = e.clientX;
      if (fin.current) clearTimeout(fin.current);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      if (!ambos) {
        pend.current = { desde: g.pos, hasta: null };
        setAmbos(true);
      }
      return;
    }
    const ancho = (pista.current?.clientWidth ?? innerWidth) + HUECO;
    let pos = LADOS.indexOf(ladoRef.current) - dx / ancho;
    /* Más allá del último lado no hay nada: cede un poco y vuelve */
    if (pos < 0) pos *= 0.25;
    if (pos > 1) pos = 1 + (pos - 1) * 0.25;
    g.pos = pos;
    pintar(pos, false);
  };
  const alSoltar = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    gesto.current = null;
    if (!g.arrastra) return;
    soltado.current = e.timeStamp;
    const ahora = LADOS.indexOf(ladoRef.current);
    const rapidez = (e.clientX - g.x) / Math.max(1, e.timeStamp - g.t); /* px por ms; negativo = hacia la izquierda */
    let destino = ahora;
    if (e.type !== "pointercancel") {
      if (g.pos - ahora > 0.3 || (rapidez < -0.45 && g.pos > ahora)) destino = ahora + 1;
      else if (ahora - g.pos > 0.3 || (rapidez > 0.45 && g.pos < ahora)) destino = ahora - 1;
      destino = Math.min(1, Math.max(0, destino));
    }
    if (destino !== ahora) guardarLado(LADOS[destino]);
    pintar(destino, true);
    terminar();
  };
  const conFlechas = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const l = e.key === "ArrowRight" ? "trabajo" : "personal";
    if (l === lado) return;
    e.preventDefault();
    cambiar(l);
    tabs.current[LADOS.indexOf(l)]?.focus();
  };
  // El domingo por la tarde ya interesa la semana siguiente (revisión semanal)
  const [off, setOff] = useState(() => (new Date().getDay() === 0 && new Date().getHours() >= 14 ? 1 : 0));
  /* El aviso de «Planifica tu semana» (y la tarjeta de Hoy) abren el Planner en la semana que toca: el domingo, la que viene */
  useEffect(() => {
    if (location.hash !== "#planificar") return;
    if (new Date().getDay() === 0) setOff(1);
    history.replaceState(null, "", location.pathname);
  }, []);
  const t = today();
  const mon = addD(mondayOf(t), off * 7);
  const a = pd(mon);
  const b = pd(addD(mon, 6));
  const days = Array.from({ length: 7 }, (_, i) => addD(mon, i));
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MES[b.getMonth()]}` : `${a.getDate()} de ${MES[a.getMonth()]} a ${b.getDate()} de ${MES[b.getMonth()]}`;

  return (
    <>
      <h1>Planner</h1>
      <div className="sem-nav">
        <p className="sem-rango">{rango}</p>
        <div className="wnav">
          <button className="ib" aria-label="Semana anterior" onClick={() => setOff(off - 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button className="btn ghost sm" onClick={() => setOff(0)} disabled={off === 0} title="Volver a esta semana">Esta semana</button>
          <button className="ib" aria-label="Semana siguiente" onClick={() => setOff(off + 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
      {/* Cada lado tiene su color: lo personal, verde oliva; el trabajo, dorado (los colores del ícono). Dentro, todo lo que lleva acento usa el de su lado.
          Se pasa de uno a otro tocando la pestaña o deslizando con el dedo. */}
      <PlanificarSemana donde="planner" lunesVisto={mon} />
      <div className="plan">
        <div className="sem-vista plan-tabs" role="tablist" aria-label="Qué parte de tu vida" onKeyDown={conFlechas}>
          {LADOS.map((l, i) => (
            <button key={l} ref={(el) => { tabs.current[i] = el; }} role="tab" id={`plan-tab-${l}`} aria-controls={`plan-panel-${l}`} className={`plan-tab ${l}`} aria-selected={lado === l} tabIndex={lado === l ? 0 : -1} onClick={() => cambiar(l)}>
              {l === "personal" ? "Personal" : "Trabajo"}
            </button>
          ))}
          <span ref={raya} className="plan-raya" aria-hidden="true" />
        </div>
        <div className={`plan-vent${ambos ? " desliza" : ""}`}>
          <div
            ref={pista}
            className="plan-pista"
            onPointerDown={alTocar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            onClickCapture={(e) => {
              /* El toque con el que se termina de arrastrar no cuenta como pulsar lo que había debajo */
              if (e.timeStamp - soltado.current < 350) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {LADOS.map((l) =>
              ambos || lado === l ? (
                <div key={l} id={`plan-panel-${l}`} role="tabpanel" aria-labelledby={`plan-tab-${l}`} className="plan-panel" data-lado={l} inert={lado !== l}>
                  <Planner days={days} hoy={t} lado={l} />
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </>
  );
}
