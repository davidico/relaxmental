"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dictar una nota: graba, y al detener la IA (Whisper en Cloudflare) lo pasa a texto.
 * Buenas prácticas: el permiso del micrófono es su propio estado; mientras graba se ve
 * "Grabando" con el tiempo en texto (no solo color); el botón dice lo que hace;
 * la grabación se guarda hasta que la transcripción sale bien, así se puede reintentar.
 */
type St = "idle" | "asking" | "rec" | "work" | "error" | "denied" | "done";
const MAX = 15 * 60; // 15 minutos
const CHUNK = 45; // segundos por trozo enviado a Whisper

export default function VoiceButton({ onText, onTitle }: { onText: (paragraphs: string[]) => void; onTitle?: (text: string) => void }) {
  const [st, setSt] = useState<St>("idle");
  const [secs, setSecs] = useState(0);
  const [prog, setProg] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const parts = useRef<Blob[]>([]);
  const audio = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAll() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setSt("error");
    setSt("asking");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setSt("denied");
    }
    parts.current = [];
    cancelled.current = false;
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => e.data.size && parts.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled.current) return setSt("idle");
      audio.current = new Blob(parts.current, { type: r.mimeType || "audio/webm" });
      void transcribe();
    };
    r.start(1000);
    rec.current = r;
    setSecs(0);
    setSt("rec");
    timer.current = setInterval(() => {
      setSecs((s) => {
        if (s + 1 >= MAX) stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (rec.current?.state === "recording") rec.current.stop();
  }
  function cancel() {
    cancelled.current = true;
    stop();
  }

  async function transcribe() {
    if (!audio.current) return;
    setSt("work");
    setProg("Preparando el audio…");
    try {
      const wavs = await toWavChunks(audio.current);
      const out: string[] = [];
      for (let i = 0; i < wavs.length; i++) {
        setProg(wavs.length > 1 ? `Pasando a texto… ${i + 1} de ${wavs.length}` : "Pasando a texto…");
        const r = await fetch("/api/voice", { method: "POST", headers: { "content-type": "audio/wav" }, body: wavs[i] });
        if (!r.ok) throw new Error(String(r.status));
        const { text } = (await r.json()) as { text: string };
        if (text?.trim()) out.push(text.trim());
      }
      if (!out.length) {
        setProg("No se escuchó nada. Prueba otra vez más cerca del micrófono.");
        return setSt("error");
      }
      const full = out.join(" ");
      onText(paragraphs(full));
      onTitle?.(full);
      audio.current = null;
      setSt("done");
    } catch {
      setProg("No se pudo pasar a texto. Tu grabación sigue guardada.");
      setSt("error");
    }
  }

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const mic = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );

  if (st === "rec")
    return (
      <div className="voice rec" role="status" aria-live="polite">
        <span className="vdot" aria-hidden="true" />
        <span className="vtime">Grabando · {mmss}</span>
        {secs >= MAX - 60 && <span className="vwarn">Queda 1 minuto</span>}
        <span className="vspace" />
        <button type="button" className="btn ghost sm" onClick={cancel}>Cancelar</button>
        <button type="button" className="btn sm" onClick={stop}>Detener y pasar a texto</button>
      </div>
    );
  return (
    <div className="voice" role={st === "error" || st === "denied" ? "alert" : "status"} aria-live="polite">
      {st === "work" || st === "asking" ? (
        <span className="vwork"><span className="spin" aria-hidden="true" /> {st === "asking" ? "Pidiendo el micrófono…" : prog}</span>
      ) : st === "error" && audio.current ? (
        <>
          <span className="verr">⚠ {prog}</span>
          <button type="button" className="btn sm" onClick={transcribe}>Reintentar</button>
          <button type="button" className="btn ghost sm" onClick={() => { audio.current = null; setSt("idle"); }}>Descartar</button>
        </>
      ) : (
        <>
          <button type="button" className="iconbtn vbtn" onClick={start}>{mic} Dictar</button>
          {st === "denied" && <span className="verr">⚠ El micrófono está bloqueado. Permítelo en los ajustes del navegador.</span>}
          {st === "error" && <span className="verr">⚠ {prog || "Este navegador no puede grabar audio."}</span>}
          {st === "done" && <span className="vok">✓ Texto añadido. Revísalo antes de guardar.</span>}
        </>
      )}
    </div>
  );
}

/** Une frases en párrafos de ~3 frases para que se lea mejor */
function paragraphs(t: string) {
  const s = t.replace(/\s+/g, " ").match(/[^.!?¿¡]*[.!?]+["»”)]?|\S[^.!?]*$/g) ?? [t];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 3) out.push(s.slice(i, i + 3).join(" ").trim());
  return out.filter(Boolean);
}

/** Decodifica la grabación y la parte en WAV de 16 kHz mono (formato que Whisper siempre acepta) */
async function toWavChunks(blob: Blob): Promise<Blob[]> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const step = CHUNK * rate;
  const chunks: Blob[] = [];
  for (let i = 0; i < pcm.length; i += step) chunks.push(wav(pcm.subarray(i, Math.min(pcm.length, i + step)), rate));
  return chunks;
}

function wav(samples: Float32Array, rate: number) {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(b);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([b], { type: "audio/wav" });
}
