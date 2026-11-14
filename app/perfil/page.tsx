"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/data";
import { DOW, MES, addD, mondayOf, pd, today } from "@/lib/dates";
import type { Bloque } from "@/lib/plan";
import VoiceButton from "@/components/VoiceButton";
import Compromisos from "@/components/Compromisos";
import { armarPlantilla } from "@/lib/imagen";
import RulesQuiz, { hayPreguntasPendientes, type Modo } from "@/components/RulesQuiz";
import { NOVEDADES, VERSION, VERSION_FECHA } from "@/lib/version";

type Prop = { fecha: string; bloques?: Bloque[]; error?: boolean };

export default function Perfil() {
  const { email, mode, saveDia, dias, perfil, savePerfil } = useData();
  const cloud = mode === "cloud";
  const [reglas, setReglas] = useState("");
  const [guardadas, setGuardadas] = useState("");
  const [estado, setEstado] = useState<"" | "guardando" | "ok" | "error">("");
  const [editando, setEditando] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [tipo, setTipo] = useState<"" | "armando" | "ok" | "error">("");
  const armarTipo = async () => {
    setTipo("armando");
    try {
      savePerfil("plantilla", await armarPlantilla(guardadas));
      setTipo("ok");
    } catch {
      setTipo("error");
    }
  };
  const [quizModo, setQuizModo] = useState<Modo>("completar");
  const [confirmCero, setConfirmCero] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  useEffect(() => setPendiente(hayPreguntasPendientes()), [quiz]);
  const [todas, setTodas] = useState(false);
  const [semana, setSemana] = useState<"esta" | "proxima">(new Date().getDay() === 0 ? "proxima" : "esta");
  const [props, setProps] = useState<Prop[] | null>(null);
  const [trabajando, setTrabajando] = useState("");
  const [aplicado, setAplicado] = useState(false);

  /* Las reglas vienen del perfil (se guardan en la nube, o en el teléfono sin conexión) */
  const txtPerfil = perfil.reglas?.text ?? "";
  useEffect(() => {
    if (mode === "loading") return;
    setGuardadas(txtPerfil);
    setReglas((r) => (editando ? r : txtPerfil));
  }, [mode, txtPerfil]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiado = reglas !== guardadas;

  const guardar = async (texto: string = reglas) => {
    savePerfil("reglas", { text: texto, updated: new Date().toISOString() });
    savePerfil("revision", { mes: new Date().toISOString().slice(0, 7) });
    setReglas(texto);
    setGuardadas(texto);
    setEstado("ok");
    setEditando(false);
    return true;
  };
  /* Empezar de cero: guarda una copia y vacía las reglas */
  const deCero = () => {
    if (guardadas.trim()) savePerfil("reglasRespaldo", { text: guardadas, updated: new Date().toISOString() });
    savePerfil("reglas", { text: "", updated: new Date().toISOString() });
    setReglas("");
    setGuardadas("");
    setTodas(false);
    setConfirmCero(false);
    setQuizModo("inicio");
    setQuiz(true);
  };



  const lunes = addD(mondayOf(today()), semana === "proxima" ? 7 : 0);
  const fechas = Array.from({ length: 7 }, (_, i) => addD(lunes, i)).filter((f) => f >= today());
  const ultimo = addD(lunes, 6); // domingo (fechas puede tener menos de 7 días si la semana ya empezó)
  const rango = `${pd(fechas[0] ?? lunes).getDate()} al ${pd(ultimo).getDate()} de ${MES[pd(ultimo).getMonth()]}`;
  const editados = fechas.filter((f) => dias[f]).length;

  const proponer = async () => {
    if (cambiado) await guardar();
    setAplicado(false);
    const out: Prop[] = fechas.map((fecha) => ({ fecha }));
    setProps([...out]);
    let hechos = 0;
    // de 2 en 2 para no saturar la IA
    for (let i = 0; i < fechas.length; i += 2) {
      setTrabajando(`Armando ${fechas.slice(i, i + 2).map((f) => DOW[pd(f).getDay()].toLowerCase()).join(" y ")}… (${hechos} de ${fechas.length} listos)`);
      await Promise.all(
        fechas.slice(i, i + 2).map(async (fecha, k) => {
          try {
            const r = await fetch("/api/ai/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fecha, reglas }) });
            if (!r.ok) throw new Error();
            out[i + k] = { fecha, bloques: ((await r.json()) as { bloques: Bloque[] }).bloques };
          } catch {
            out[i + k] = { fecha, error: true };
          }
          hechos++;
          setProps([...out]);
        }),
      );
    }
    setTrabajando("");
  };

  const reintentar = async (fecha: string) => {
    setProps((p) => p && p.map((x) => (x.fecha === fecha ? { fecha } : x)));
    try {
      const r = await fetch("/api/ai/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fecha, reglas }) });
      if (!r.ok) throw new Error();
      const { bloques } = (await r.json()) as { bloques: Bloque[] };
      setProps((p) => p && p.map((x) => (x.fecha === fecha ? { fecha, bloques } : x)));
    } catch {
      setProps((p) => p && p.map((x) => (x.fecha === fecha ? { fecha, error: true } : x)));
    }
  };

  const listos = props?.filter((p) => p.bloques?.length) ?? [];
  const aplicar = () => {
    for (const p of listos) saveDia(p.fecha, p.bloques!);
    setAplicado(true);
  };

  const inicial = (email ?? "D")[0].toUpperCase();

  return (
    <>
      <h1>Tu perfil</h1>
      <p className="sub">Tus reglas para el horario y la información de la app.</p>

      <section className="card profile">
        <span className="avatar lg" aria-hidden="true">{inicial}</span>
        <div className="pinfo">
          <strong>{email ?? "Sin sesión"}</strong>
          <span>{cloud ? "Tus datos se guardan en la nube" : "Tus datos se guardan solo en este navegador"}</span>
        </div>
        {cloud && <a className="btn ghost sm" href="/cdn-cgi/access/logout">Cerrar sesión</a>}
      </section>

      <section className="card pad rules-card" aria-labelledby="reglas-h">
        <div className="rules-head">
          <h2 id="reglas-h">Mis reglas del horario</h2>
          {!editando && (
            <button className="nv-ib" aria-expanded={todas} aria-controls="reglas-zona" aria-label={todas ? "Ocultar reglas" : "Ver reglas"} title={todas ? "Ocultar" : "Ver"} onClick={() => setTodas(!todas)}>
              {todas ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          )}
        </div>
        {estado === "ok" && !todas && <p role="status" className="vok">✓ Reglas guardadas</p>}
        <div id="reglas-zona">
        {(todas || editando) && <p className="hint">
          Escríbelas como se las dirías a alguien: horas, días y excepciones. La IA las usa para armar tu semana. Tus compromisos con fecha y tus tareas pendientes se añaden solos.
        </p>}
        {editando ? (
          <>
            <label htmlFor="reglas" className="sr-only">Mis reglas</label>
            <textarea id="reglas" className="rules" value={reglas} onChange={(e) => { setReglas(e.target.value); setEstado(""); }} spellCheck autoFocus />
            <VoiceButton onText={(p) => { setReglas((r) => [r.trimEnd(), ...p].filter(Boolean).join("\n\n")); setEstado(""); }} />
            <div className="row actions">
              <button className="btn" onClick={() => guardar()} disabled={!cambiado || estado === "guardando"}>
                {estado === "guardando" ? "Guardando…" : "Guardar reglas"}
              </button>
              <button className="btn ghost" onClick={() => { setReglas(guardadas); setEstado(""); setEditando(false); }}>Cancelar</button>
            </div>
            <p role="status" className={estado === "error" ? "verr" : "hint"}>
              {estado === "error" ? "⚠ No se pudieron guardar. Inténtalo otra vez." : cambiado ? "Tienes cambios sin guardar" : ""}
            </p>
          </>
        ) : todas && !guardadas.trim() ? (
          <>
            <p className="rules-view all">Aún no tienes reglas. Te hago unas preguntas y las escribo por ti.</p>
            <div className="row actions">
              <button className="btn" onClick={() => { setQuizModo("inicio"); setQuiz(true); }}>Empezar</button>
              <button className="btn ghost" onClick={() => setEditando(true)}>Escribirlas yo</button>
            </div>
          </>
        ) : todas ? (
          <>
            <p className="rules-view all" id="reglas-texto">{guardadas}</p>
            <div className="row actions">
              <button className="btn" onClick={() => setEditando(true)}>Editar reglas</button>
              {cloud && (
                <button className="btn ghost" onClick={() => { setQuizModo("completar"); setQuiz(true); }}>{pendiente ? "Seguir con las preguntas" : "Completar con preguntas"}</button>
              )}
              {estado === "ok" && <span role="status" className="vok">✓ Reglas guardadas</span>}
            </div>
            {confirmCero ? (
              <div className="confirm">
                ¿Empezar de cero? Guardo una copia de tus reglas y te hago las preguntas desde el principio.
                <button className="btn sm warn" onClick={deCero}>Empezar de cero</button>
                <button className="btn sm ghost" onClick={() => setConfirmCero(false)}>No</button>
              </div>
            ) : (
              <button className="linkbtn rq-reset" onClick={() => setConfirmCero(true)}>Empezar de cero</button>
            )}
          </>
        ) : null}
        </div>
      </section>
      {quiz && <RulesQuiz modo={quizModo} reglas={guardadas} onClose={() => setQuiz(false)} onGuardar={(t) => guardar(t)} />}

      <Compromisos />

      <h2 id="ia-h" className="banda">Armar mi semana con IA</h2>
      <section className="card pad" aria-labelledby="ia-h">
        {!cloud ? (
          <p className="hint">Para usar la IA tienes que haber iniciado sesión.</p>
        ) : (
          <>
            <div className="st-box">
              <h3 className="rules-h">Mi semana tipo</h3>
              <p className="hint">
                {perfil.plantilla && Object.keys(perfil.plantilla).length
                  ? "Ya tienes tu semana tipo: un día típico de lunes a domingo. Tus compromisos se añaden encima."
                  : "Un día típico de lunes a domingo, armado con tus reglas. Es la base de tu horario."}
              </p>
              <div className="row actions">
                <button className="btn" onClick={armarTipo} disabled={tipo === "armando" || !guardadas.trim()}>
                  {tipo === "armando" ? "Armando tu semana…" : perfil.plantilla ? "Volver a armarla" : "Armar mi semana tipo"}
                </button>
                {!guardadas.trim() && <span className="hint">Primero escribe tus reglas.</span>}
                {tipo === "ok" && <span className="vok" role="status">✓ Semana tipo lista</span>}
                {tipo === "error" && <span className="verr" role="alert">⚠ No se pudo armar. Inténtalo otra vez.</span>}
              </div>
            </div>
            <h3 className="rules-h st-h2">Ajustar una semana concreta</h3>
            <div className="row actions">
              <label htmlFor="semana" className="sr-only">Semana</label>
              <select id="semana" value={semana} onChange={(e) => { setSemana(e.target.value as typeof semana); setProps(null); }} style={{ width: "auto" }}>
                <option value="esta">Esta semana</option>
                <option value="proxima">La próxima semana</option>
              </select>
              <button className="btn" onClick={proponer} disabled={!!trabajando}>
                {trabajando ? "Armando…" : "Proponer horario"}
              </button>
            </div>
            <p className="hint">
              Del {rango}. Primero ves la propuesta y después decides si la aplicas.
              {editados > 0 && ` Ojo: ${editados === 1 ? "1 día de esa semana lo editaste" : `${editados} días de esa semana los editaste`} a mano; al aplicar se reemplazan.`}
            </p>
            {trabajando && (
              <p className="vwork" role="status"><span className="spin" aria-hidden="true" /> {trabajando}</p>
            )}
          </>
        )}
      </section>

      {props && (
        <>
          <div className="plan-days">
            {props.map((p) => (
              <details key={p.fecha} className="card plan-day" open={p.fecha === today()}>
                <summary>
                  <span>{DOW[pd(p.fecha).getDay()]} {pd(p.fecha).getDate()}</span>
                  <small>{p.error ? "No salió" : p.bloques ? `${p.bloques.length} bloques` : "Armando…"}</small>
                </summary>
                {p.error ? (
                  <div className="row actions">
                    <span className="verr">⚠ La IA no pudo armar este día.</span>
                    <button className="btn sm" onClick={() => reintentar(p.fecha)}>Reintentar</button>
                  </div>
                ) : p.bloques ? (
                  <ol className="plan-list">
                    {p.bloques.map((b, i) => (
                      <li key={i}>
                        <span className="pt">{b.s}–{b.e}</span>
                        <span className="pn">{b.t}{b.sub && <small>{b.sub}</small>}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="vwork"><span className="spin" aria-hidden="true" /> Armando…</p>
                )}
              </details>
            ))}
          </div>
          {!trabajando && (
            <div className="card pad apply">
              {aplicado ? (
                <>
                  <span className="vok">✓ Listo, tu semana ya tiene este horario.</span>
                  <Link className="btn" href="/semana">Ver mi semana</Link>
                </>
              ) : (
                <>
                  <span>{listos.length === fechas.length ? "¿Te gusta? Puedes cambiar cualquier día después con «Editar»." : `${listos.length} de ${fechas.length} días listos.`}</span>
                  <div className="row" style={{ flex: "none", gap: 8 }}>
                    <button className="btn ghost" onClick={() => setProps(null)}>Descartar</button>
                    <button className="btn" onClick={aplicar} disabled={!listos.length}>Aplicar a mi semana</button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      <h2 className="banda">Acerca de</h2>
      <section className="card pad about">
        <div className="ver">
          <img className="brandmark sm logo" src="/icon.svg" alt="" aria-hidden="true" />
          <div>
            <strong>Mi Semana · versión {VERSION}</strong>
            <span>{VERSION_FECHA}</span>
          </div>
        </div>
        <ul>
          {NOVEDADES.slice(0, 6).map((n) => <li key={n}>{n}</li>)}
        </ul>
        {NOVEDADES.length > 6 && (
          <details className="nov-mas">
            <summary>Ver todas las novedades ({NOVEDADES.length})</summary>
            <ul>{NOVEDADES.slice(6).map((n) => <li key={n}>{n}</li>)}</ul>
          </details>
        )}
      </section>
    </>
  );
}
