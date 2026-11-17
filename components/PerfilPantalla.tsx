"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useData } from "@/lib/data";
import Compromisos from "@/components/Compromisos";
import Avisos from "@/components/Avisos";
import ReglasEditor from "@/components/ReglasEditor";
import { useReglasDeTipo } from "@/components/ReglasDeTipo";
import Memoria from "@/components/Memoria";
import SemanaTipo from "@/components/SemanaTipo";
import RulesQuiz, { hayPreguntasPendientes, type Modo } from "@/components/RulesQuiz";
import { NOVEDADES, VERSION, VERSION_FECHA } from "@/lib/version";

export type Ver = "cuenta" | "reglas" | "compromisos" | "semana" | "memoria" | "avisos" | "acerca";
/** Las pantallas de tu cuenta: cada cosa en la suya (se abren desde el menú de arriba a la derecha) */
export const PANTALLAS: { ver: Exclude<Ver, "cuenta" | "reglas">; href: string; titulo: string; sub: string }[] = [
  { ver: "memoria", href: "/perfil/memoria", titulo: "Lo que la IA sabe de mí", sub: "Tus reglas (lo que tú le dices) y lo que ha aprendido de ti. Tú decides qué se queda." },
  { ver: "semana", href: "/perfil/semana", titulo: "Mi semana tipo", sub: "Tu semana normal, hecha por ti: qué haces cada día y a qué hora. Es la base de tu horario y de lo que la IA te propone." },
  { ver: "compromisos", href: "/perfil/compromisos", titulo: "Mis compromisos", sub: "Lo que tiene fecha: iglesia, turnos, citas." },
  { ver: "avisos", href: "/perfil/avisos", titulo: "Avisos", sub: "Qué te avisa la app y a qué hora: tu día, tus hábitos y tu diario." },
  { ver: "acerca", href: "/perfil/acerca", titulo: "Acerca de", sub: "La versión de la app, sus novedades y cómo funciona la IA." },
];

/** Para «Cómo funciona la IA»: cada uso, qué lee y qué devuelve (debe coincidir con worker/ai.ts) */
const IA_USOS: { cuando: string; lee: string; da: string }[] = [
  { cuando: "Dictas con el micrófono", lee: "el audio.", da: "el texto escrito y, en las notas, un título corto." },
  { cuando: "Respondes las preguntas de «Armemos tu semana»", lee: "tus reglas, tus respuestas y tus compromisos próximos.", da: "más preguntas y, al final, tus reglas redactadas." },
  { cuando: "Subes una foto de tus compromisos", lee: "la foto, la fecha de hoy y tus reglas.", da: "la lista de compromisos con fecha y hora, que revisas antes de guardar." },
  { cuando: "Le pides que te proponga una semana tipo (opcional: normalmente la haces tú en Perfil › Mi semana tipo)", lee: "tus reglas, tus últimos 30 días ajustados a mano, tus últimos 14 días y lo que recuerda de ti.", da: "un día típico para cada día de la semana, que revisas y guardas tú." },
  { cuando: "Pides «Actualizar mis reglas con esta semana» (en Mi semana tipo) o «Actualizar con mi semana tipo» (en Lo que la IA sabe de mí)", lee: "tu semana tipo y tus reglas actuales.", da: "tus reglas puestas al día con tu semana tipo; las revisas a pantalla completa y decides si se guardan (se guarda una copia de las de antes)." },
  { cuando: "Pides «Armar mi semana con IA» (en Hoy › Semana)", lee: "tu semana tipo de cada día (es la base), tus reglas, los compromisos de ese día y de los 3 siguientes, los títulos de tus tareas pendientes, tus días ajustados, tus últimos 14 días y lo que recuerda de ti.", da: "el horario de cada día de esa semana, partiendo de tu semana tipo; tú lo aplicas o no." },
  { cuando: "Guardas un día que editaste", lee: "lo que la app te propuso y cómo lo dejaste (tus últimos 12 cambios), tus reglas y lo que ya decidiste.", da: "hasta 5 conclusiones sobre cómo armas tus días." },
  { cuando: "Pides «Proponme horas» para tus metas", lee: "tu itinerario de hoy, las metas sin hora, la hora que es, tus reglas, tus últimos 14 días y lo que recuerda de ti.", da: "un bloque de tiempo para cada meta." },
  { cuando: "Planeas la semana en el Planner (por metas o por días)", lee: "las metas de tu semana (o las que pusiste en cada día), el horario de cada día que queda, la hora que es, tus reglas, tus últimos 14 días y lo que recuerda de ti.", da: "por metas, cuántos días y a qué horas trabajar cada una; por días, la hora de cada meta. Nada se aplica hasta que tocas «Aplicar a mi semana»." },
  { cuando: "Pides «¿Cuándo las hago?» en Pendientes", lee: "los títulos de tus tareas sin fecha, lo que ya tienes apuntado y tus compromisos de los próximos 7 días, tus reglas, tus últimos 14 días y lo que recuerda de ti.", da: "un día para cada pendiente, con un motivo corto; tú dices sí o no a cada uno." },
  { cuando: "Guardas tu diario", lee: "el texto de ese día, lo que hiciste y lo que no, tus últimos 14 días, lo que recuerda de ti y tus reglas.", da: "hasta 3 propuestas; si aprendió algo nuevo de ti, lo apunta en su memoria; y los temas personales que podrías hablar con alguien, que solo se guardan si tú los apuntas en una lista." },
  { cuando: "Pides el resumen de tu semana", lee: "tus últimos 14 días, lo que recuerda de ti y tus reglas.", da: "un repaso de la semana, hasta 3 recomendaciones y, si aprendió algo nuevo, lo apunta en su memoria." },
  { cuando: "En tu horario hay una actividad que la app no reconoce por su nombre", lee: "el nombre y la descripción de esa actividad (no tus tareas ni tus notas).", da: "qué tipo de actividad es (despertar, ejercicio, diario…), para ponerle su ícono y su botón. Lo guarda y no vuelve a preguntar por ella." },
  { cuando: "Le preguntas algo en «Pregúntale a la IA» (en Hoy, en el botón + o en el Cerebro: es la misma)", lee: "tu pregunta, todas tus notas del Cerebro (de todas las secciones, también las privadas; si fueran muchísimas, las que más se parecen a lo que preguntas), tu itinerario de hoy, tus últimos 14 días, lo que recuerda de ti, tus reglas y, para organizarte, los momentos de tus próximos días y tus metas y tareas sin hacer.", da: "la respuesta a lo que sea que preguntes: sobre tus notas (con la lista por fechas y esas notas para abrirlas), sobre tu tiempo o cualquier otra cosa. Si le pides que ponga algo en tu semana (con Claude), te propone los cambios en tus metas y tareas —moverlas de día, meterlas dentro de un momento, darles hora o crear una nueva— y tú eliges cuáles aplicar: nada cambia hasta que tocas «Aplicar»." },
];

export default function PerfilPantalla({ ver }: { ver: Ver }) {
  const { email, mode, perfil, savePerfil } = useData();
  const cloud = mode === "cloud";
  const [estado, setEstado] = useState<"" | "ok">("");
  const rt = useReglasDeTipo();
  const hayTipo = !!perfil.plantilla && Object.values(perfil.plantilla).some((x) => x.length);
  const [editando, setEditando] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [quizModo, setQuizModo] = useState<Modo>("completar");
  const [confirmCero, setConfirmCero] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  useEffect(() => setPendiente(hayPreguntasPendientes()), [quiz]);

  /* Las reglas vienen del perfil (se guardan en la nube, o en el teléfono sin conexión) */
  const guardadas = mode === "loading" ? "" : (perfil.reglas?.text ?? "");
  const guardar = (texto: string) => {
    savePerfil("reglas", { text: texto, updated: new Date().toISOString() });
    savePerfil("revision", { mes: new Date().toISOString().slice(0, 7) });
    setEstado("ok");
    setEditando(false);
    return true;
  };
  /* Empezar de cero: guarda una copia y vacía las reglas */
  const deCero = () => {
    if (guardadas.trim()) savePerfil("reglasRespaldo", { text: guardadas, updated: new Date().toISOString() });
    savePerfil("reglas", { text: "", updated: new Date().toISOString() });
    setConfirmCero(false);
    setQuizModo("inicio");
    setQuiz(true);
  };

  const inicial = (email ?? "D")[0].toUpperCase();
  const pant = PANTALLAS.find((p) => p.ver === (ver === "reglas" ? "memoria" : ver));

  return (
    /* Las pantallas de la cuenta son para leer y ajustar: en pantallas anchas van en una columna cómoda, no a todo lo ancho */
    <div className="pag-leer">
      <h1>{pant?.titulo ?? "Tu cuenta"}</h1>
      <p className="sub">{pant?.sub ?? "Tus datos y los ajustes de tu horario."}</p>

      {ver === "cuenta" && (
        <>
          <section className="card profile">
            <span className="avatar lg" aria-hidden="true">{inicial}</span>
            <div className="pinfo">
              <strong>{email ?? "Sin sesión"}</strong>
              <span>{cloud ? "Tus datos se guardan en la nube" : "Tus datos se guardan solo en este navegador"}</span>
            </div>
            {cloud && <a className="btn ghost sm" href="/cdn-cgi/access/logout">Cerrar sesión</a>}
          </section>
          <nav className="card cta-lista" aria-label="Pantallas de tu cuenta">
            {PANTALLAS.map((p) => (
              <Link key={p.ver} href={p.href}>
                <span className="cta-t">{p.titulo}</span>
                <span className="cta-s">{p.sub}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            ))}
          </nav>
        </>
      )}

      {ver === "memoria" && (
        <>
      <h2 className="banda" id="reglas-h">Mis reglas: lo que tú le dices</h2>
      <section className="card pad rules-card" aria-labelledby="reglas-h">
        {guardadas.trim() ? (
          <>
            {/* Un resumen: tocarlo abre las reglas enteras, a pantalla completa */}
            <button type="button" className="rules-previa" onClick={() => setEditando(true)} aria-label="Leer y editar mis reglas">
              <span className="rules-view" id="reglas-texto">{guardadas}</span>
              <span className="rules-mas">Leer todo y editar</span>
            </button>
            {(estado === "ok" || rt.ok) && <p role="status" className="vok rules-ok">✓ Reglas guardadas</p>}
            {rt.estado === "error" && <p className="verr rules-ok" role="alert">⚠ No se pudieron actualizar con tu semana tipo. Inténtalo otra vez.</p>}
            {confirmCero ? (
              <div className="confirm">
                ¿Empezar de cero? Guardo una copia de tus reglas y te hago las preguntas desde el principio.
                <button className="btn sm warn" onClick={deCero}>Empezar de cero</button>
                <button className="btn sm ghost" onClick={() => setConfirmCero(false)}>No</button>
              </div>
            ) : (
              /* Dos enlaces pequeños, uno al lado del otro: completar la información con preguntas, o empezar de cero */
              <div className="rules-enlaces">
                {/* Poner las reglas al día con la semana tipo (la misma opción que hay en «Mi semana tipo»): solo si la semana cambió y aún no se ha hecho */}
                {cloud && hayTipo && (!!perfil.tipoCambiada || rt.estado !== "") && (
                  <button className="linkbtn" onClick={() => void rt.pedir()} disabled={rt.estado === "armando"}>{rt.estado === "armando" ? "Actualizando…" : "Actualizar con mi semana tipo"}</button>
                )}
                {cloud && (
                  <button className="linkbtn" onClick={() => { setQuizModo("completar"); setQuiz(true); }}>{pendiente ? "Seguir con las preguntas" : "Completar con preguntas"}</button>
                )}
                <button className="linkbtn rules-cero" onClick={() => setConfirmCero(true)}>Empezar de cero</button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="rules-view all">Aún no tienes reglas. Te hago unas preguntas y las escribo por ti.</p>
            <div className="row actions">
              <button className="btn" onClick={() => { setQuizModo("inicio"); setQuiz(true); }}>Empezar</button>
              <button className="btn ghost" onClick={() => setEditando(true)}>Escribirlas yo</button>
            </div>
          </>
        )}
      </section>
      {rt.editor}
      {editando && <ReglasEditor texto={guardadas} onGuardar={guardar} onClose={() => setEditando(false)} />}
      {quiz && <RulesQuiz modo={quizModo} reglas={guardadas} onClose={() => setQuiz(false)} onGuardar={(t) => guardar(t)} />}
      <h2 className="banda" id="mem-h">Lo que ha aprendido de ti</h2>
      <p className="sub ia-sabe-sub">Lo apunta sola cuando guardas tu diario o pides el resumen de la semana. Puedes corregirlo, borrarlo o añadirle cosas.</p>
      <Memoria />
        </>
      )}

      {ver === "compromisos" && <Compromisos />}

      {ver === "avisos" && <Avisos />}

      {ver === "semana" && <SemanaTipo />}

      {ver === "acerca" && (
        <>
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

          <h2 id="ia-como" className="banda">Cómo funciona la IA</h2>
          <section className="card pad ia-exp" aria-labelledby="ia-como">
            <p>
              La IA solo actúa cuando tú pulsas algo. Lee únicamente lo que hace falta para esa tarea y casi todo lo que devuelve es una propuesta: tú decides con «Sí» o «No».
            </p>

            <h3>Qué lee en cada momento</h3>
            <dl className="ia-lista">
              {IA_USOS.map((u) => (
                <div key={u.cuando}>
                  <dt>{u.cuando}</dt>
                  <dd><span>Lee:</span> {u.lee}</dd>
                  <dd><span>Te da:</span> {u.da}</dd>
                </div>
              ))}
            </dl>

            <h3>Cómo decide</h3>
            <ul>
              <li>Tu semana tipo es la base: la haces tú y la IA parte de ella; solo cambia lo necesario para tus compromisos y tareas de esa semana.</li>
              <li>Tus reglas mandan: es el texto que lee siempre.</li>
              <li>Tus compromisos con fecha son fijos: no los mueve ni pone nada encima.</li>
              <li>Aprende de lo que corriges: compara lo que te propuso con cómo lo dejaste y busca lo que se repite.</li>
              <li>«Tus últimos 14 días» es un resumen que arma la app: qué momentos de tu día marcaste como hechos y cuáles no, lo que cambiaste a mano, tus hábitos, tus metas y tareas (hechas, sin hacer y lo que viene) y tus diarios. Con eso ajusta lo que te propone: si algo casi nunca lo cumples a esa hora, te lo pone a otra o más corto.</li>
              <li>No vuelve a proponer lo que ya aceptaste o rechazaste.</li>
              <li>Antes de mostrarte algo, la app descarta horas imposibles, fechas pasadas y bloques que se pisan.</li>
            </ul>

            <h3>Tus datos</h3>
            <ul>
              <li>Si conectaste tu clave de Claude (de Anthropic), toda la IA de la app la hace Claude (menos el dictado por voz, que sigue en Cloudflare): lo que lee en cada caso (arriba) va a Anthropic, que no usa lo que recibe por su API para entrenar sus modelos. Si Claude falla, o sin clave, la hace la IA de Cloudflare, el mismo servicio donde se guardan tus datos, que no conserva lo que se le envía ni lo usa para entrenar modelos.</li>
              <li>
                Su memoria es una lista de frases que puedes ver, corregir y borrar en <Link href="/perfil/memoria">Lo que la IA sabe de mí</Link>. No recuerda nada más.
              </li>
              <li>«Tus últimos 14 días» son tus diarios, tus metas y tareas (hechas y sin hacer) y tus hábitos. Solo los lee cuando guardas el diario, pides el resumen o le preguntas algo.</li>
              <li>Tus notas del Cerebro solo las lee cuando tú le preguntas algo en «Pregúntale a la IA». Lo que te propone por su cuenta (tu horario, el diario, el resumen de la semana) no las lee.</li>
              <li>Lo único que se guarda sin tu «Sí» es el texto que dictas, el título de una nota dictada y lo que apunta en su memoria. Puedes cambiarlo o borrarlo.</li>
            </ul>

            <h3>Sus límites</h3>
            <p>
              Puede equivocarse o inventar algo, sea Claude o la IA de Cloudflare (Llama, de Meta; Whisper para la voz). Por eso nada cambia en tu horario sin que tú lo aceptes.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
