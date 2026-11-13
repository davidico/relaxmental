"use client";

import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data";
import { toggleHecho } from "./ui";

/**
 * Entrenamiento por intervalos (series de trabajo y descanso) con voz en español:
 * «tres, dos, uno», «¡A trabajar!», «Descanso», «Terminado». También pita y la pantalla no se apaga.
 */
type Conf = { series: number; trabajo: number; descanso: number; saltarUltimo: boolean };
const KEY = "mi-semana-entreno";
const BASE: Conf = { series: 3, trabajo: 40, descanso: 20, saltarUltimo: true };
const PREP = 5;

type Fase = { tipo: "prep" | "trabajo" | "descanso"; dur: number; serie: number };
const plan = (c: Conf): Fase[] => {
  const out: Fase[] = [{ tipo: "prep", dur: PREP, serie: 1 }];
  for (let i = 1; i <= c.series; i++) {
    out.push({ tipo: "trabajo", dur: c.trabajo, serie: i });
    if (i < c.series || !c.saltarUltimo) out.push({ tipo: "descanso", dur: c.descanso, serie: i });
  }
  return out;
};
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ---------- voz y pitidos ---------- */
let audio: AudioContext | null = null;
function pitido(largo = false) {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = largo ? 1046 : 784;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.6, audio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (largo ? 0.6 : 0.18));
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (largo ? 0.65 : 0.2));
  } catch {}
}
function decir(texto: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-ES";
    const voz = s.getVoices().find((v) => v.lang?.toLowerCase().startsWith("es"));
    if (voz) u.voice = voz;
    u.volume = 1;
    u.rate = 1.05;
    s.speak(u);
  } catch {}
}

export default function Entreno({ onClose }: { onClose: () => void }) {
  const { habitos, save, hoy } = useData();
  const [c, setC] = useState<Conf>(() => {
    try {
      return { ...BASE, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch {
      return BASE;
    }
  });
  const [corriendo, setCorriendo] = useState(false);
  const [pausa, setPausa] = useState(false);
  const [i, setI] = useState(0);
  const [resta, setResta] = useState(0);
  const [fin, setFin] = useState(false);
  const fases = useRef<Fase[]>([]);
  const limite = useRef(0);
  const dicho = useRef<number>(-1);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const guardarConf = (x: Conf) => {
    setC(x);
    try {
      localStorage.setItem(KEY, JSON.stringify(x));
    } catch {}
  };
  const total = plan(c).reduce((a, f) => a + f.dur, 0) - PREP;

  const pantalla = async (on: boolean) => {
    try {
      if (on) wake.current = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
      else {
        await wake.current?.release();
        wake.current = null;
      }
    } catch {}
  };

  const empezar = () => {
    fases.current = plan(c);
    setI(0);
    setResta(PREP);
    limite.current = Date.now() + PREP * 1000;
    dicho.current = -1;
    setFin(false);
    setPausa(false);
    setCorriendo(true);
    pitido();
    decir("Prepárate");
    void pantalla(true);
  };

  /* El reloj: cuenta con la hora real, así no se atrasa */
  useEffect(() => {
    if (!corriendo || pausa) return;
    const t = setInterval(() => {
      const r = Math.max(0, Math.ceil((limite.current - Date.now()) / 1000));
      setResta(r);
      if (r <= 3 && r >= 1 && dicho.current !== r) {
        dicho.current = r;
        pitido();
        decir(["", "uno", "dos", "tres"][r]);
      }
      if (r === 0) {
        const sig = i + 1;
        if (sig >= fases.current.length) {
          clearInterval(t);
          setCorriendo(false);
          setFin(true);
          pitido(true);
          decir("¡Terminado! Bien hecho");
          void pantalla(false);
          const h = habitos.find((x) => /ejercicio|entren|deporte/i.test(x.name));
          if (h && !h.hechos[hoy]) save("habitos", toggleHecho(h, hoy));
          return;
        }
        const f = fases.current[sig];
        setI(sig);
        limite.current = Date.now() + f.dur * 1000;
        dicho.current = -1;
        setResta(f.dur);
        pitido(true);
        decir(f.tipo === "trabajo" ? (f.serie === fases.current.filter((x) => x.tipo === "trabajo").length ? "¡Última serie! A trabajar" : "¡A trabajar!") : "Descanso");
      }
    }, 200);
    return () => clearInterval(t);
  }, [corriendo, pausa, i, habitos, hoy, save]);

  useEffect(() => () => void pantalla(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pausar = () => {
    if (pausa) {
      limite.current = Date.now() + resta * 1000;
      setPausa(false);
      decir("Seguimos");
      void pantalla(true);
    } else {
      setPausa(true);
      window.speechSynthesis?.cancel();
      decir("Pausa");
      void pantalla(false);
    }
  };
  const salir = () => {
    window.speechSynthesis?.cancel();
    void pantalla(false);
    onClose();
  };

  const f = fases.current[i];
  const series = c.series;
  const Num = ({ label, valor, menos, mas, texto }: { label: string; valor: string; menos: () => void; mas: () => void; texto: string }) => (
    <div className="en-num">
      <span className="en-lbl">{label}</span>
      <div className="en-ctl">
        <button type="button" className="nv-ib" aria-label={`Menos ${texto}`} onClick={menos}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <span className="en-val" aria-live="polite">{valor}</span>
        <button type="button" className="nv-ib" aria-label={`Más ${texto}`} onClick={mas}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  );

  if (corriendo && f) {
    const tipo = f.tipo;
    return (
      <div className={`nv en-run ${tipo}`} role="dialog" aria-modal="true" aria-label="Entrenamiento">
        <div className="en-top">
          <span>{tipo === "prep" ? "Prepárate" : `Serie ${f.serie} de ${series}`}</span>
          <button className="en-x" aria-label="Terminar entrenamiento" onClick={() => { setCorriendo(false); salir(); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="en-centro">
          <p className="en-fase">{tipo === "prep" ? "PREPÁRATE" : tipo === "trabajo" ? "TRABAJO" : "DESCANSO"}</p>
          <p className="en-reloj" role="timer" aria-live="off">{mmss(resta)}</p>
          {pausa && <p className="en-pausa" role="status">En pausa</p>}
        </div>
        <div className="en-pie">
          <button className="en-btn" onClick={pausar}>{pausa ? "Seguir" : "Pausa"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="nv" role="dialog" aria-modal="true" aria-labelledby="en-h">
      <div className="nv-bar ke-bar">
        <button className="nv-ib ke-ib" aria-label="Cerrar" onClick={salir}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <h2 id="en-h" className="nv-h">Entrenamiento</h2>
      </div>
      <div className="nv-body">
        <div className="nv-paper en">
          {fin && <p className="vok en-fin" role="status">✓ ¡Terminado! Marqué tu hábito de ejercicio de hoy.</p>}
          <div className="card en-card">
            <Num label="Series" texto="series" valor={String(c.series)} menos={() => guardarConf({ ...c, series: Math.max(1, c.series - 1) })} mas={() => guardarConf({ ...c, series: Math.min(30, c.series + 1) })} />
          </div>
          <div className="card en-card">
            <Num label="Trabajo" texto="tiempo de trabajo" valor={mmss(c.trabajo)} menos={() => guardarConf({ ...c, trabajo: Math.max(5, c.trabajo - 5) })} mas={() => guardarConf({ ...c, trabajo: Math.min(3600, c.trabajo + 5) })} />
            <Num label="Descanso" texto="tiempo de descanso" valor={mmss(c.descanso)} menos={() => guardarConf({ ...c, descanso: Math.max(5, c.descanso - 5) })} mas={() => guardarConf({ ...c, descanso: Math.min(3600, c.descanso + 5) })} />
            <label className="en-sw">
              <span>Saltar el último descanso</span>
              <input type="checkbox" role="switch" checked={c.saltarUltimo} onChange={(e) => guardarConf({ ...c, saltarUltimo: e.target.checked })} />
            </label>
          </div>
          <p className="hint">Te aviso en voz alta: «tres, dos, uno», «¡A trabajar!» y «Descanso». Sube el volumen del teléfono.</p>
          <button className="btn en-go" onClick={empezar}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
            <span>Empezar</span>
            <span className="en-total">{mmss(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
