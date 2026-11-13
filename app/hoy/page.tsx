"use client";

import { useState } from "react";
import Link from "next/link";
import { useData, newId } from "@/lib/data";
import { DOW, MES, ds, toMin } from "@/lib/dates";
import { nowInfo, textoEventos, type Bloque } from "@/lib/plan";
import { useNow, submitOnCtrlEnter } from "@/lib/hooks";
import { sortHabits } from "@/lib/habits";
import type { Tarea } from "@/lib/types";
import { openTasks, toggleHecho } from "@/components/ui";
import { useFocus } from "@/components/Shell";
import { folderOptions } from "@/lib/folders";
import DayEditor from "@/components/DayEditor";
import PushBanner from "@/components/PushBanner";
import RulesQuiz, { type Modo } from "@/components/RulesQuiz";
import { armarPlantilla } from "@/lib/imagen";
import VoiceButton from "@/components/VoiceButton";

/* ---------- utilidades de texto ---------- */
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const durTxt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const Check = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export default function Hoy() {
  const { eventos, planFor } = useData();
  const now = useNow();
  const t = ds(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const blocks = planFor(t);
  const evs = eventos[t] ?? [];
  const [editing, setEditing] = useState(false);
  const [verDia, setVerDia] = useState(false);

  const hoyTxt = evs.length ? `Hoy: ${textoEventos(evs)}` : "";

  return (
    <div className="hy">
      <header className="hy-head">
        <button className="btn hy-newtask" onClick={() => dispatchEvent(new Event("mi-semana:nueva-tarea"))}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nueva tarea
        </button>
        <h1>
          {DOW[now.getDay()]} {now.getDate()}
          <span className="hy-month"> de {MES[now.getMonth()]}</span>
        </h1>
        <p className="sub">
          <span className="hy-month-m">{MES[now.getMonth()][0].toUpperCase() + MES[now.getMonth()].slice(1)}{hoyTxt ? " · " : ""}</span>
          {hoyTxt}
        </p>
      </header>
      <PushBanner />

      <div className="hy-dots" aria-hidden="true" />
      <ReglasAviso />

      <div className="hy-grid">
        <div className="hy-col">
          <NowCard blocks={blocks} minute={minute} />
          <OneTask day={t} />
          <HabitRings day={t} />
          <section aria-labelledby="hy-dia" className="hy-sec hy-dia">
            <button className="hy-allday" aria-expanded={verDia} aria-controls="hy-dia-lista" onClick={() => setVerDia(!verDia)}>
              <span id="hy-dia">{verDia ? "Ocultar el día" : "Ver todo el día"}</span>
              <span className="hy-allday-n">{blocks.length} bloques</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {verDia && (
              <div id="hy-dia-lista">
                <DayList blocks={blocks} minute={minute} />
                <button className="linkbtn" onClick={() => setEditing(true)}>Editar hoy</button>
              </div>
            )}
          </section>
        </div>
        <div className="hy-col hy-side">
          <Capture />
        </div>
      </div>
      {editing && <DayEditor date={t} onClose={() => setEditing(false)} />}
    </div>
  );
}

/* ---------- Ahora ---------- */
function NowCard({ blocks, minute }: { blocks: Bloque[]; minute: number }) {
  const { cur, nxt } = nowInfo(blocks, minute);
  if (!blocks.length)
    return (
      <section className="hy-now" aria-labelledby="hy-now-t">
        <span className="hy-now-lbl">Sin horario todavía</span>
        <h2 id="hy-now-t">Aquí verás lo que te toca ahora</h2>
        <p>Cuando armes tu semana, cada bloque del día aparece aquí.</p>
      </section>
    );
  if (!cur && !nxt)
    return (
      <section className="hy-now" aria-labelledby="hy-now-t">
        <span className="hy-now-lbl">Día terminado</span>
        <h2 id="hy-now-t">Buen trabajo. A descansar.</h2>
      </section>
    );
  if (!cur && nxt)
    return (
      <section className="hy-now" aria-labelledby="hy-now-t">
        <div className="hy-now-top">
          <span className="hy-now-lbl">Siguiente · {nxt.s}</span>
          <span className="hy-now-left">en {durTxt(toMin(nxt.s) - minute)}</span>
        </div>
        <h2 id="hy-now-t">{nxt.t}</h2>
        {nxt.sub && <p>{nxt.sub}</p>}
      </section>
    );
  const b = cur!;
  const span = toMin(b.e) - toMin(b.s);
  const pct = Math.round(((minute - toMin(b.s)) / span) * 100);
  return (
    <section className="hy-now" aria-labelledby="hy-now-t">
      <div className="hy-now-top">
        <span className="hy-now-lbl">Ahora · {b.s}–{b.e}</span>
        <span className="hy-now-left">quedan {durTxt(toMin(b.e) - minute)}</span>
      </div>
      <h2 id="hy-now-t">{b.t}</h2>
      {b.sub && <p>{b.sub}</p>}
      <div className="hy-bar" role="progressbar" aria-label="Avance del bloque" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {nxt && (
        <p className="hy-next">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span>
            Luego, <strong>{nxt.s} {nxt.t}</strong>
          </span>
        </p>
      )}
    </section>
  );
}

/* ---------- Tu día ---------- */
function DayList({ blocks, minute }: { blocks: Bloque[]; minute: number }) {
  const [showPast, setShowPast] = useState(false);
  const past = blocks.filter((b) => toMin(b.e) <= minute);
  const visible = showPast ? blocks : blocks.filter((b) => toMin(b.e) > minute);
  return (
    <>
      {past.length > 0 && (
        <button className="hy-past" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
          <span>{showPast ? "Ocultar lo que ya pasó" : `Ya pasaron ${past.length} ${past.length === 1 ? "bloque" : "bloques"} de hoy`}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
      {visible.length ? (
        <ol className="hy-tl">
          {visible.map((b) => {
            const isPast = toMin(b.e) <= minute;
            const isCur = minute >= toMin(b.s) && minute < toMin(b.e);
            return (
              <li key={b.s + b.t} className={isCur ? "cur" : isPast ? "past" : ""} aria-current={isCur ? "step" : undefined}>
                <span className="hy-tl-h">{b.s}</span>
                <span className="hy-tl-dot" aria-hidden="true" />
                <span className="hy-tl-b">
                  <span className="hy-tl-t">{b.t}</span>
                  {isCur ? (
                    <span className="hy-tl-now">Ahora · hasta las {b.e}</span>
                  ) : (
                    b.sub && !b.evento && <span className="hy-tl-s">{b.sub}</span>
                  )}
                  {b.evento && b.sub && !isCur && (
                    <span className="hy-roles">
                      <span className="hy-role">{b.sub}</span>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="hy-empty">{blocks.length ? "No queda nada en el plan de hoy." : "Todavía no hay horario para hoy."}</p>
      )}
    </>
  );
}

/* ---------- Bienvenida (sin reglas) y revisión de cada mes ---------- */
function ReglasAviso() {
  const { mode, offline, perfil, savePerfil, hoy } = useData();
  const [quiz, setQuiz] = useState<Modo | null>(null);
  const [listo, setListo] = useState(false);
  const [tipo, setTipo] = useState<"" | "armando" | "error">("");
  if (mode === "loading" || offline) return null;
  const reglas = perfil.reglas?.text?.trim() ?? "";
  const mes = hoy.slice(0, 7);
  const armarTipo = async () => {
    setTipo("armando");
    try {
      savePerfil("plantilla", await armarPlantilla(reglas));
      setListo(false);
      setTipo("");
    } catch {
      setTipo("error");
    }
  };
  const revisado = perfil.revision?.mes === mes || (perfil.reglas?.updated ?? "").slice(0, 7) === mes;
  const guardar = (t: string) => {
    savePerfil("reglas", { text: t, updated: new Date().toISOString() });
    savePerfil("revision", { mes });
    if (quiz === "inicio") setListo(true);
    return true;
  };
  return (
    <>
      {reglas && (listo || !perfil.plantilla) ? (
        <section className="card pad hy-aviso" aria-live="polite">
          <h2 className="hy-h">{listo ? "¡Tus reglas están listas!" : "Falta tu semana tipo"}</h2>
          <p>Ahora armo tu semana tipo con ellas: un día típico de lunes a domingo. Tarda un poco.</p>
          {tipo === "error" && <p className="verr" role="alert">⚠ No se pudo armar. Inténtalo otra vez.</p>}
          <button className="btn" onClick={armarTipo} disabled={tipo === "armando"}>{tipo === "armando" ? "Armando tu semana…" : "Armar mi semana"}</button>
        </section>
      ) : !reglas ? (
        <section className="card pad hy-aviso" aria-labelledby="hy-bienv">
          <h2 id="hy-bienv" className="hy-h">Armemos tu semana</h2>
          <p>Te hago unas preguntas sobre tu día (puedes dictar) y con eso armo tu horario. Unos 10 minutos.</p>
          <button className="btn" onClick={() => setQuiz("inicio")}>Empezar</button>
        </section>
      ) : !revisado ? (
        <section className="card pad hy-aviso" aria-labelledby="hy-mes">
          <h2 id="hy-mes" className="hy-h">Nuevo mes: ¿hay cambios en tu horario?</h2>
          <p>Si cambió algo (turnos, actividades, fechas especiales), lo ajustamos con unas preguntas.</p>
          <div className="row actions">
            <button className="btn" onClick={() => setQuiz("cambios")}>Sí, revisar</button>
            <button className="btn ghost" onClick={() => savePerfil("revision", { mes })}>No, todo igual</button>
          </div>
        </section>
      ) : null}
      {quiz && <RulesQuiz modo={quiz} reglas={reglas} onClose={() => setQuiz(null)} onGuardar={guardar} />}
    </>
  );
}

/* ---------- Lo único de hoy: una sola tarea a la vista ---------- */
function OneTask({ day }: { day: string }) {
  const { tareas, save } = useData();
  const startFocus = useFocus();
  const open = openTasks(tareas);
  // Primero lo atrasado, luego lo de hoy
  const deHoy = open.filter((x) => x.due && x.due <= day).sort((a, b) => (a.due + (a.hora || "99") < b.due + (b.hora || "99") ? -1 : a.due + (a.hora || "99") > b.due + (b.hora || "99") ? 1 : a.created < b.created ? -1 : 1));
  const x: Tarea | undefined = deHoy[0];
  const resto = open.length - (x ? 1 : 0);
  return (
    <section aria-labelledby="hy-una" className="hy-sec">
      <h2 id="hy-una" className="hy-h">Lo único de hoy</h2>
      {x ? (
        <div className="hy-one">
          <input type="checkbox" className="hy-check" id={`hy-${x.id}`} checked={false} onChange={() => save("tareas", { ...x, done: true })} />
          <span className="hy-task-b">
            <label htmlFor={`hy-${x.id}`}>{x.title}</label>
            {x.due < day && <span className="hy-late">Atrasada</span>}
            {x.hora && x.due === day && <span className="hy-step">A las {x.hora}</span>}
            {x.step && <span className="hy-step">Primer paso: {x.step}</span>}
          </span>
          <button className="hy-start" onClick={() => startFocus(x)} aria-label={`Empezar 10 minutos: ${x.title}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
            10 min
          </button>
        </div>
      ) : (
        <p className="hy-empty">Nada urgente hoy. Respira.</p>
      )}
      {resto > 0 && (
        <Link className="linkbtn hy-more" href="/tareas">
          {x ? `Ver ${resto === 1 ? "la otra tarea" : `las otras ${resto} tareas`}` : `Ver tus ${resto} tareas para otros días`}
        </Link>
      )}
    </section>
  );
}

/* ---------- Hábitos como círculos ---------- */
function HabitRings({ day }: { day: string }) {
  const { habitos, save } = useData();
  const list = sortHabits(habitos);
  const done = list.filter((h) => h.hechos[day]).length;
  if (!list.length) return null;
  return (
    <section aria-labelledby="hy-hab" className="hy-sec">
      <div className="hy-sechead">
        <h2 id="hy-hab" className="hy-h">Hábitos</h2>
        <span className="hy-count">{done} de {list.length}</span>
      </div>
      <div className="hy-rings">
        {list.map((h) => {
          const on = !!h.hechos[day];
          return (
            <button key={h.id} aria-pressed={on} onClick={() => save("habitos", toggleHecho(h, day))}>
              <span className="hy-ring" aria-hidden="true">{on && <Check size={20} />}</span>
              <span className="hy-ring-l">{h.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Sácalo de la cabeza (solo escritorio; en el celular está en el botón +) ---------- */
function Capture() {
  const { carpetas, save } = useData();
  const [folder, setFolder] = useState("notas");
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const guardar = () => {
    if (!text.trim()) return;
    save("notas", { id: newId(), folder, kind: "nota", title: "", text: text.trim(), ref: "", created: new Date().toISOString() });
    setText("");
    setSaved(true);
  };
  return (
    <section aria-labelledby="hy-cap" className="hy-sec hy-capture">
      <h2 id="hy-cap">Sácalo de la cabeza</h2>
      <form
        className="hy-capform"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <label htmlFor="hy-cap-in" className="hy-caplbl">Una idea, un sueño o algo que no quieres olvidar</label>
        <textarea id="hy-cap-in" rows={3} placeholder="Escribe o dicta…" value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} onKeyDown={submitOnCtrlEnter} />
        <VoiceButton onText={(p) => { setText((x) => [x.trim(), ...p].filter(Boolean).join("\n\n")); setSaved(false); }} />
        <div className="hy-capfoot">
          <label htmlFor="hy-cap-f" className="sr-only">Carpeta</label>
          <select id="hy-cap-f" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {folderOptions(carpetas).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className="btn" type="submit" disabled={!text.trim()}>Guardar en el cerebro</button>
        </div>
        {saved && <span className="vok" role="status">✓ Guardado en el cerebro</span>}
      </form>
    </section>
  );
}
