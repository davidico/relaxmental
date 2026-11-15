"use client";

import { useEffect, useState } from "react";
import { useData, newId } from "@/lib/data";
import { DOW, MES, addD, ds, pd } from "@/lib/dates";
import { textoEventos } from "@/lib/plan";
import { useNow, useWide, submitOnCtrlEnter } from "@/lib/hooks";
import { esMeta, type Tarea } from "@/lib/types";
import HorasMetas from "@/components/HorasMetas";
import { useFocus } from "@/components/Shell";
import { folderOptions } from "@/lib/folders";
import DayEditor from "@/components/DayEditor";
import Entreno from "@/components/Entreno";
import Aprendizajes from "@/components/Aprendizajes";
import Diario from "@/components/Diario";
import { Tira } from "@/components/DiaTira";
import HorarioSemana from "@/components/HorarioSemana";
import { bloqueDeSub } from "@/lib/momentos";
import TaskSheet from "@/components/TaskSheet";
import ResumenSemana from "@/components/ResumenSemana";
import WhenDialog from "@/components/WhenDialog";
import { borrarTarea } from "@/lib/deshacer";
import PushBanner from "@/components/PushBanner";
import RulesQuiz, { type Modo } from "@/components/RulesQuiz";
import { armarPlantilla } from "@/lib/imagen";
import VoiceButton from "@/components/VoiceButton";

export default function Hoy() {
  const { eventos, planFor } = useData();
  const now = useNow();
  const wide = useWide();
  const t = ds(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  /* El día que se está viendo: hoy, u otro de la semana elegido en la tira */
  const [elegido, setElegido] = useState<string | null>(null);
  const dia = elegido ?? t;
  const ir = (d: string) => setElegido(d === t ? null : d);
  const esHoy = dia === t;
  const fecha = pd(dia);
  const blocks = planFor(dia);
  const evs = eventos[dia] ?? [];
  const [editing, setEditing] = useState(false);
  /* Dos pestañas: el día (la línea) y la semana hora por hora */
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  useEffect(() => {
    try {
      if (localStorage.getItem("mi-semana-hoy-vista") === "semana") setVista("semana");
    } catch {}
  }, []);
  const cambiarVista = (v: "dia" | "semana") => {
    setVista(v);
    try {
      localStorage.setItem("mi-semana-hoy-vista", v);
    } catch {}
  };
  const [entreno, setEntreno] = useState(false);
  /* El aviso del bloque de ejercicio abre directamente el entrenamiento (/hoy#entreno) */
  useEffect(() => {
    if (location.hash === "#entreno") {
      setEntreno(true);
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  const evTxt = evs.length ? `${esHoy ? "Hoy: " : ""}${textoEventos(evs)}` : "";

  return (
    <div className="hy">
      <header className="hy-head">
        <button className="btn hy-newtask" onClick={() => dispatchEvent(new Event("mi-semana:nueva-tarea"))}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nueva tarea
        </button>
        <h1>
          {DOW[fecha.getDay()]} {fecha.getDate()}
          <span className="hy-month"> de {MES[fecha.getMonth()]}</span>
        </h1>
        <p className="sub">
          <span className="hy-month-m">{MES[fecha.getMonth()][0].toUpperCase() + MES[fecha.getMonth()].slice(1)}{evTxt ? " · " : ""}</span>
          {evTxt}
        </p>
        {vista === "dia" && (
        <div className="hy-dias" role="group" aria-label="Cambiar de día">
          <button type="button" className="hy-dia-b" aria-label="Día anterior" onClick={() => ir(addD(dia, -1))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>
          </button>
          {!esHoy && <button type="button" className="hy-dia-hoy" onClick={() => setElegido(null)}>Hoy</button>}
          <button type="button" className="hy-dia-b" aria-label="Día siguiente" onClick={() => ir(addD(dia, 1))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" /></svg>
          </button>
        </div>
        )}
      </header>
      <div className="sem-vista hy-vista" role="tablist" aria-label="Cómo ver tu tiempo">
        <button role="tab" aria-selected={vista === "dia"} onClick={() => cambiarVista("dia")}>Día</button>
        <button role="tab" aria-selected={vista === "semana"} onClick={() => cambiarVista("semana")}>Semana</button>
      </div>
      {esHoy && <PushBanner />}

      <div className="hy-dots" aria-hidden="true" />
      {esHoy && <ReglasAviso />}

      {vista === "semana" ? (
        <HorarioSemana />
      ) : (
      <div className="hy-grid">
        <div className="hy-col">
          {esHoy && <Atrasadas day={t} />}
          <SinHora day={dia} hoy={t} />
          <Tira dia={dia} blocks={blocks} minuto={esHoy ? minute : dia < t ? 1440 : -1} onEditar={() => setEditing(true)} onEntreno={() => setEntreno(true)} />
        </div>
        {/* El orden del código es el que se ve (y el del teclado): en el móvil todo va en una columna */}
        <div className="hy-col hy-side">
          <Capture />
          {esHoy && (
            <>
              <Diario />
              <ResumenSemana />
              <Aprendizajes />
              {/* En el móvil «Preguntar a la IA» está en el botón + que flota; en pantallas anchas no hay ese menú, así que va aquí */}
              {wide && (
                <button className="hy-allday hy-ask" onClick={() => dispatchEvent(new Event("mi-semana:preguntar"))}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4.2A8 8 0 1 1 20 12z" /></svg>
                  <span>Pregúntale a la IA</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      )}
      {editing && <DayEditor date={dia} onClose={() => setEditing(false)} />}
      {entreno && <Entreno onClose={() => setEntreno(false)} />}
    </div>
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

/* ---------- Metas y tareas de ese día que no tienen hora (las que tienen hora van en la línea de tiempo) ---------- */
function SinHora({ day, hoy }: { day: string; hoy: string }) {
  const { tareas, save, planFor } = useData();
  const startFocus = useFocus();
  const [cambiar, setCambiar] = useState<Tarea | null>(null);
  const delDia = tareas.filter((x) => x.due === day);
  /* Las subtareas de un momento del día se ven en la línea, debajo de ese momento */
  const bloques = planFor(day);
  const xs = delDia.filter((x) => !x.hora && !(x.momento && bloqueDeSub(x.momento, bloques))).sort((a, b) => Number(esMeta(b)) - Number(esMeta(a)) || a.created.localeCompare(b.created));
  if (!xs.length) return null;
  const primera = day === hoy ? xs.find((x) => !x.done) : undefined;
  const etiqueta = (x: Tarea) => (esMeta(x) ? `Meta de ${x.lado === "trabajo" ? "trabajo" : "tu vida personal"}` : "Tarea");
  return (
    <section aria-labelledby="hy-una" className="hy-sec">
      <div className="hy-sechead">
        <h2 id="hy-una" className="hy-h">{day === hoy ? "Para hoy, sin hora" : "Sin hora"}</h2>
        <span className="hy-count">{xs.filter((x) => x.done).length} de {xs.length}</span>
      </div>
      <ul className="hy-pros">
        {xs.map((x) => (
          <li key={x.id} className={`hy-pro${x.done ? " hecho" : ""}`}>
            <input type="checkbox" className="hy-check" checked={x.done} onChange={() => save("tareas", { ...x, done: !x.done })} aria-label={`Hecho: ${x.title}`} />
            {/* Tocar el nombre abre la tarea para cambiarla; el círculo la marca */}
            <button type="button" className="hy-task-b hy-task-btn" onClick={() => setCambiar(x)} aria-label={`Cambiar ${x.title}`}>
              <span className="hy-task-t">{x.title}</span>
              <span className="hy-step">{etiqueta(x)}</span>
              {x.step && !x.done && <span className="hy-step">Primer paso: {x.step}</span>}
            </button>
            {x.id === primera?.id && (
              <button className="hy-start" onClick={() => startFocus(x)} aria-label={`Empezar 10 minutos: ${x.title}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
                10 min
              </button>
            )}
          </li>
        ))}
      </ul>
      {day === hoy && <HorasMetas day={day} metas={delDia.filter(esMeta)} />}
      {cambiar && <TaskSheet editar={cambiar} onClose={() => setCambiar(null)} />}
    </section>
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
