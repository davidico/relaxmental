"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useData, newId } from "@/lib/data";
import { DOW, MES, addD, ds, pd, toMin } from "@/lib/dates";
import { nowInfo, textoEventos, type Bloque } from "@/lib/plan";
import { useNow, submitOnCtrlEnter } from "@/lib/hooks";
import { sortHabits } from "@/lib/habits";
import { esMeta, type Tarea } from "@/lib/types";
import HorasMetas from "@/components/HorasMetas";
import { openTasks, toggleHecho } from "@/components/ui";
import { useFocus } from "@/components/Shell";
import { folderOptions } from "@/lib/folders";
import DayEditor from "@/components/DayEditor";
import Entreno from "@/components/Entreno";
import Aprendizajes from "@/components/Aprendizajes";
import Diario from "@/components/Diario";
import WhenDialog from "@/components/WhenDialog";
import { borrarTarea } from "@/lib/deshacer";
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
  const [entreno, setEntreno] = useState(false);
  /* El aviso del bloque de ejercicio abre directamente el entrenamiento (/hoy#entreno) */
  useEffect(() => {
    if (location.hash === "#entreno") {
      setEntreno(true);
      history.replaceState(null, "", location.pathname);
    }
  }, []);

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
          <NowCard blocks={blocks} minute={minute} onEntreno={() => setEntreno(true)} />
          <Atrasadas day={t} />
          <OneTask day={t} />
          <HabitRings day={t} />
        </div>
        {/* El orden del código es el que se ve (y el del teclado): en el móvil todo va en una columna */}
        <div className="hy-col hy-side">
          <Capture />
          <Diario />
          <SemanaAviso />
          <Aprendizajes />
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
      </div>
      {editing && <DayEditor date={t} onClose={() => setEditing(false)} />}
      {entreno && <Entreno onClose={() => setEntreno(false)} />}
    </div>
  );
}

/* ---------- Ahora ---------- */
export const esEjercicio = (t: string) => /ejercicio|entren|deporte|gym|gimnasio|correr|workout/i.test(t);
function NowCard({ blocks, minute, onEntreno }: { blocks: Bloque[]; minute: number; onEntreno: () => void }) {
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
      {esEjercicio(b.t) && (
        <button className="btn hy-entreno" onClick={onEntreno}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
          Empezar entrenamiento
        </button>
      )}
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

/* ---------- Domingo: proponer la semana que viene ---------- */
function SemanaAviso() {
  const { mode, offline, perfil, savePerfil, hoy, dias } = useData();
  const d = new Date(hoy + "T12:00:00");
  const dow = d.getDay();
  if (mode !== "cloud" || offline || dow !== 0 || !perfil.reglas?.text?.trim()) return null;
  const lunes = (() => {
    const x = new Date(d);
    x.setDate(x.getDate() + 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  })();
  if ((perfil.semanaVista as string | undefined) === lunes || dias[lunes]) return null;
  return (
    <section className="card pad hy-aviso" aria-labelledby="sem-h">
      <h2 id="sem-h" className="hy-h">¿Te armo la semana que viene?</h2>
      <p>Uso tus reglas, lo que aprendí de tus días, tus compromisos y tus tareas. Tú revisas cada día antes de aplicarlo.</p>
      <div className="row actions">
        <Link className="btn" href="/perfil/semana" onClick={() => savePerfil("semanaVista", lunes)}>Sí, proponla</Link>
        <button className="btn ghost" onClick={() => savePerfil("semanaVista", lunes)}>Ahora no</button>
      </div>
    </section>
  );
}

/* ---------- Lo único de hoy: una sola tarea a la vista ---------- */
function OneTask({ day }: { day: string }) {
  const { tareas, save } = useData();
  const startFocus = useFocus();
  const porHora = (a: Tarea, b: Tarea) => (a.hora || "99").localeCompare(b.hora || "99") || a.created.localeCompare(b.created);
  const deHoy = tareas.filter((x) => x.due === day).sort(porHora);
  const primera = deHoy.find((x) => !x.done);
  const hechas = deHoy.filter((x) => x.done).length;
  const otras = openTasks(tareas).filter((x) => !x.due || x.due > day).length;
  const fila = (x: Tarea) => (
    <li key={x.id} className={`hy-pro${x.done ? " hecho" : ""}`}>
      <input type="checkbox" className="hy-check" id={`hy-${x.id}`} checked={x.done} onChange={() => save("tareas", { ...x, done: !x.done })} />
      <span className="hy-task-b">
        <label htmlFor={`hy-${x.id}`}>{x.title}</label>
        {x.hora && <span className="hy-step">{x.fin ? `De ${x.hora} a ${x.fin}` : `A las ${x.hora}`}</span>}
        {x.step && !x.done && <span className="hy-step">Primer paso: {x.step}</span>}
      </span>
      {x.id === primera?.id && (
        <button className="hy-start" onClick={() => startFocus(x)} aria-label={`Empezar 10 minutos: ${x.title}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
          10 min
        </button>
      )}
    </li>
  );
  const metas = deHoy.filter(esMeta);
  const tareasHoy = deHoy.filter((x) => !esMeta(x));
  const grupos = (["personal", "trabajo"] as const).map((l) => ({ l, xs: metas.filter((x) => (x.lado === "trabajo" ? "trabajo" : "personal") === l) })).filter((g) => g.xs.length);
  return (
    <>
      <section aria-labelledby="hy-una" className="hy-sec">
        <div className="hy-sechead">
          <h2 id="hy-una" className="hy-h">Tus metas de hoy</h2>
          {metas.length > 0 && <span className="hy-count">{metas.filter((x) => x.done).length} de {metas.length}</span>}
        </div>
        {metas.length ? (
          grupos.map((g) => (
            <div key={g.l} className={`hy-lado ${g.l}`}>
              <h3 className="hy-lado-h">{g.l === "trabajo" ? "Trabajo" : "Personal"}</h3>
              <ul className="hy-pros">{g.xs.map((x) => fila(x))}</ul>
            </div>
          ))
        ) : (
          <p className="hy-empty">
            Sin metas para hoy. <Link href="/semana">Ponlas en tu planner</Link>.
          </p>
        )}
        <HorasMetas day={day} metas={metas} />
      </section>
      <section aria-labelledby="hy-tar" className="hy-sec">
        <div className="hy-sechead">
          <h2 id="hy-tar" className="hy-h">Tareas de hoy</h2>
          {tareasHoy.length > 0 && <span className="hy-count">{tareasHoy.filter((x) => x.done).length} de {tareasHoy.length}</span>}
        </div>
        {tareasHoy.length ? <ul className="hy-pros">{tareasHoy.map((x) => fila(x))}</ul> : <p className="hy-empty">Ninguna tarea para hoy.</p>}
        {otras > 0 && (
          <Link className="linkbtn hy-more" href="/semana">
            Ver tu semana ({otras} {otras === 1 ? "cosa más" : "cosas más"})
          </Link>
        )}
      </section>
    </>
  );
}

/* ---------- Lo que quedó sin hacer: tú decides qué pasa con cada cosa ---------- */
function Atrasadas({ day }: { day: string }) {
  const { tareas, save, remove } = useData();
  const [otroDia, setOtroDia] = useState<Tarea | null>(null);
  const [todas, setTodas] = useState(false);
  const xs = tareas.filter((x) => !x.done && x.due && x.due < day).sort((a, b) => b.due.localeCompare(a.due));
  if (!xs.length) return null;
  const ayer = addD(day, -1);
  const soloAyer = xs.every((x) => x.due === ayer);
  const vis = todas ? xs : xs.slice(0, 4);
  return (
    <div className="hy-atr" role="group" aria-labelledby="hy-atr-h">
      <h3 id="hy-atr-h" className={`hy-atr-h${soloAyer ? "" : " mayus"}`}>
        {soloAyer ? "Ayer " : ""}
        {xs.length === 1 ? "quedó 1 cosa" : `quedaron ${xs.length} cosas`} sin hacer{soloAyer ? "" : " de otros días"}
      </h3>
      <p className="hy-atr-p">¿Qué hago con {xs.length === 1 ? "ella" : "cada una"}?</p>
      <ul className="hy-atr-l">
        {vis.map((x) => (
          <li key={x.id}>
            <span className="hy-atr-t">
              {x.title}
              {x.due !== ayer && <span className="hy-step"> · del {pd(x.due).getDate()} de {MES[pd(x.due).getMonth()]}</span>}
            </span>
            <div className="hy-atr-b">
              <button className="btn sm" onClick={() => save("tareas", { ...x, due: day })} aria-label={`Pasar a hoy: ${x.title}`}>Hoy</button>
              <button className="btn ghost sm" onClick={() => setOtroDia(x)} aria-label={`Pasar a otro día: ${x.title}`}>Otro día</button>
              <button className="btn ghost sm" onClick={() => borrarTarea(x, save, remove)} aria-label={`Ya no hacerlo: ${x.title}`}>Ya no</button>
            </div>
          </li>
        ))}
      </ul>
      {xs.length > vis.length && <button className="linkbtn" onClick={() => setTodas(true)}>Ver las {xs.length - vis.length} restantes</button>}
      {otroDia && (
        <WhenDialog
          due={addD(day, 1)}
          hora={otroDia.hora ?? ""}
          hoy={day}
          onCancel={() => setOtroDia(null)}
          onDone={(due, hora) => {
            save("tareas", { ...otroDia, due, hora: due && hora ? hora : undefined });
            setOtroDia(null);
          }}
        />
      )}
    </div>
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
