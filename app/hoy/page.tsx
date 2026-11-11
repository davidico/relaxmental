"use client";

import { useState } from "react";
import Link from "next/link";
import { useData, newId } from "@/lib/data";
import { DOW, MES, ds, toMin } from "@/lib/dates";
import { nowInfo, preachesOn, rolesOn, type Bloque } from "@/lib/schedule";
import { useNow, submitOnCtrlEnter } from "@/lib/hooks";
import { habitColor, sortHabits, streak } from "@/lib/habits";
import type { Tarea } from "@/lib/types";
import { cssC, openTasks, toggleHecho } from "@/components/ui";
import { useFocus } from "@/components/Shell";
import { folderOptions } from "@/components/QuickTask";
import DayEditor from "@/components/DayEditor";
import PushBanner from "@/components/PushBanner";
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
  const { labores, planFor } = useData();
  const now = useNow();
  const t = ds(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const blocks = planFor(t);
  const roles = rolesOn(labores, t);
  const [editing, setEditing] = useState(false);

  const iglesia = preachesOn(labores, t)
    ? "hoy predicas"
    : roles.length
      ? `hoy te toca ${lista(roles.map((x) => x.toLowerCase().replace(/ \(inicia\)/, "")))}`
      : "hoy no tienes labor en la iglesia";

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
          <span className="hy-month-m">{MES[now.getMonth()][0].toUpperCase() + MES[now.getMonth()].slice(1)} · </span>
          {iglesia[0].toUpperCase() + iglesia.slice(1)}
        </p>
      </header>
      <PushBanner />

      <div className="hy-grid">
        <div className="hy-col">
          <NowCard blocks={blocks} minute={minute} />
          <section aria-labelledby="hy-dia" className="hy-sec hy-dia">
            <div className="hy-sechead">
              <h2 id="hy-dia">Tu día</h2>
              <button className="linkbtn" onClick={() => setEditing(true)}>Editar hoy</button>
            </div>
            <DayList blocks={blocks} minute={minute} roles={roles} />
          </section>
        </div>
        <div className="hy-col">
          <TodayTasks day={t} />
          <Habits day={t} />
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
function DayList({ blocks, minute, roles }: { blocks: Bloque[]; minute: number; roles: string[] }) {
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
                    b.sub && !(b.church && roles.length) && <span className="hy-tl-s">{b.sub}</span>
                  )}
                  {b.church && roles.length > 0 && (
                    <span className="hy-roles">
                      {roles.map((r) => (
                        <span key={r} className="hy-role">{r}</span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="hy-empty">No queda nada en el plan de hoy.</p>
      )}
    </>
  );
}

/* ---------- Para hoy ---------- */
function TodayTasks({ day }: { day: string }) {
  const { tareas, save } = useData();
  const startFocus = useFocus();
  const open = openTasks(tareas);
  const hoy = open.filter((x) => x.due && x.due <= day);
  const hechasHoy = tareas.filter((x) => x.done && x.due === day);
  const list: Tarea[] = [...hoy, ...hechasHoy];
  return (
    <section aria-labelledby="hy-tareas" className="hy-sec">
      <div className="hy-sechead">
        <h2 id="hy-tareas">Para hoy</h2>
        <Link className="linkbtn" href="/tareas">Ver todas ({open.length})</Link>
      </div>
      {list.length ? (
        <ul className="hy-tasks">
          {list.map((x) => (
            <li key={x.id} className={x.done ? "done" : ""}>
              <input type="checkbox" className="hy-check" id={`hy-${x.id}`} checked={x.done} onChange={(e) => save("tareas", { ...x, done: e.target.checked })} />
              <span className="hy-task-b">
                <label htmlFor={`hy-${x.id}`}>{x.title}</label>
                {!x.done && x.due && x.due < day && <span className="hy-late">Atrasada</span>}
                {!x.done && x.step && <span className="hy-step">Primer paso: {x.step}</span>}
              </span>
              {!x.done && (
                <button className="hy-start" onClick={() => startFocus(x)} aria-label={`Empezar 10 minutos: ${x.title}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
                  10 min
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hy-empty">
          Nada para hoy.{open.length ? ` Tienes ${open.length} ${open.length === 1 ? "pendiente" : "pendientes"} para otro día.` : " Añade una con el botón +."}
        </p>
      )}
    </section>
  );
}

/* ---------- Hábitos ---------- */
function Habits({ day }: { day: string }) {
  const { habitos, save } = useData();
  const list = sortHabits(habitos);
  const done = list.filter((h) => h.hechos[day]).length;
  return (
    <section aria-labelledby="hy-hab" className="hy-sec">
      <div className="hy-sechead">
        <h2 id="hy-hab">Hábitos</h2>
        {list.length > 0 && <span className="hy-count">{done} de {list.length}</span>}
      </div>
      {list.length ? (
        <div className="hy-habits">
          {list.map((h) => {
            const on = !!h.hechos[day];
            const s = streak(h, day);
            return (
              <button key={h.id} aria-pressed={on} style={cssC(habitColor(h, habitos))} onClick={() => save("habitos", toggleHecho(h, day))}>
                {on ? <Check size={18} color="#e3c46f" /> : <span className="hy-hdot" aria-hidden="true" />}
                {h.name}
                {s > 1 && <span className="hy-streak"> · {s} días</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="hy-empty">Añade tus hábitos en la sección <Link href="/habitos">Hábitos</Link>.</p>
      )}
    </section>
  );
}

/* ---------- Sácalo de la cabeza (solo escritorio; en el celular está en el botón +) ---------- */
function Capture() {
  const { carpetas, save } = useData();
  const [folder, setFolder] = useState("ideas");
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
