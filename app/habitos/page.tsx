"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useData, newId } from "@/lib/data";
import { addD, fdate, today } from "@/lib/dates";
import { bestStreak, cantidad, conUnidad, enLaSemana, sinDias, sortHabits, streak, textoVeces, tipoDe, vecesDe, type TipoHabito } from "@/lib/habits";
import type { Habito } from "@/lib/types";
import { toggleHecho } from "@/components/ui";
import HabitoAnotar from "@/components/HabitoAnotar";
import HabitoDetalle, { CamposHabito, PreguntaDias, leerCampos } from "@/components/HabitoDetalle";
import HabitosSemana from "@/components/HabitosSemana";

/** Los últimos 30 días, de izquierda (hace 29 días) a derecha (hoy) */
function Mes({ h, t }: { h: Habito; t: string }) {
  const dias = Array.from({ length: 30 }, (_, i) => addD(t, i - 29));
  const n = dias.filter((d) => h.hechos[d]).length;
  return (
    <div className="hb-mes" role="img" aria-label={`Últimos 30 días: ${n} ${tipoDe(h) === "dejar" ? "logrados" : "hechos"}`}>
      {dias.map((d) => (
        <i key={d} className={h.hechos[d] ? "on" : d === t ? "tdy" : ""} title={fdate(d)} />
      ))}
    </div>
  );
}

/** La frase de cada tarjeta: anima, nunca regaña (en «dejar» no se habla de recaídas) */
function frase(h: Habito, t: string) {
  const tipo = tipoDe(h);
  /* Unos días por semana: se cuenta la semana, no los días seguidos */
  const v = vecesDe(h);
  if (v < 7 && tipo !== "medible") {
    const n = enLaSemana(h, t);
    const falta = v - n === 1 ? "falta 1 día" : `faltan ${v - n} días`;
    return n >= v ? "Esta semana ya está" : h.hechos[t] ? `Hoy ya está · te ${falta} esta semana` : `Esta semana te ${falta}`;
  }
  const on = !!h.hechos[t];
  const s = streak(h, t);
  if (tipo === "medible") {
    const c = cantidad(h, t);
    if (!c) return "Hoy aún no has anotado nada";
    return `Hoy: ${conUnidad(h, c)}${h.objetivo ? ` de ${conUnidad(h, h.objetivo)}` : ""}`;
  }
  if (tipo === "dejar") return on ? "Hoy lo lograste" : s > 0 ? "Marca hoy cuando lo logres" : "Marca los días que lo logras";
  return on ? "Hoy ya está" : s > 0 ? "Hoy aún no: márcalo y sigue la racha" : bestStreak(h) > 0 ? "Empieza otra vez hoy" : "Hoy es buen día para empezar";
}

const VACIO = { name: "", tipo: "marca" as TipoHabito, unidad: "", objetivo: "", hora: "", veces: 7 };

export default function Habitos() {
  const { habitos, save } = useData();
  const t = today();
  const [vista, setVista] = useState<"lista" | "semana">("lista");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [anotando, setAnotando] = useState<Habito | null>(null);
  const [nuevo, setNuevo] = useState(VACIO);
  const [creando, setCreando] = useState(false);
  const list = sortHabits(habitos);

  return (
    <>
      <div className="hb-head">
        <h1>Hábitos</h1>
        {/* Pequeño: solo el «+» en un círculo fino (se toca en 44 px) */}
        <button className="hb-nuevo" aria-label="Nuevo hábito" title="Nuevo hábito" onClick={() => { setNuevo(VACIO); setCreando(true); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      <div className="sem-vista" role="tablist" aria-label="Cómo ver tus hábitos">
        <button role="tab" aria-selected={vista === "lista"} onClick={() => setVista("lista")}>Mis hábitos</button>
        <button role="tab" aria-selected={vista === "semana"} onClick={() => setVista("semana")}>Semana</button>
      </div>

      {vista === "semana" ? (
        <HabitosSemana onAbrir={setAbierto} />
      ) : (
        <>
          {/* Los hábitos de antes de esta pregunta: cuántos días por semana quiere hacer cada uno (se va quitando al responder) */}
          {list.some(sinDias) && (
            <section className="card hb-preg" aria-labelledby="hb-preg-h">
              <h2 id="hb-preg-h">¿Cuántos días por semana quieres hacer cada uno?</h2>
              <p className="hb-preg-p">Así te cuento la semana («2 de 3») y no te aviso los días que no toca.</p>
              {list.filter(sinDias).map((h) => <PreguntaDias key={h.id} h={h} conNombre />)}
            </section>
          )}
          <div className="habgrid">
            {list.length ? (
              list.map((h) => {
                const tipo = tipoDe(h);
                const on = !!h.hechos[t];
                const s = streak(h, t);
                const best = bestStreak(h);
                const c = cantidad(h, t);
                /* Si es de unas veces por semana, el número grande es lo hecho esta semana («2 de 3»); si no, la racha de días */
                const v = vecesDe(h);
                const semanal = v < 7 && tipo !== "medible";
                const enSemana = semanal ? enLaSemana(h, t) : 0;
                return (
                  <article className="card hb" key={h.id} aria-labelledby={`hb-${h.id}`}>
                    <div className="hb-top">
                      {semanal ? (
                        <div className={`hb-num${enSemana ? "" : " cero"}`}>
                          <b>{enSemana}</b>
                          <span>de {v}</span>
                        </div>
                      ) : (
                        <div className={`hb-num${s ? "" : " cero"}`}>
                          <b>{s}</b>
                          <span>{s === 1 ? "día" : "días"}</span>
                        </div>
                      )}
                      <div className="hb-txt">
                        <h2 id={`hb-${h.id}`}>
                          {/* Toda la tarjeta abre el mes (el botón se estira sobre ella); el check de la derecha queda por encima */}
                          <button className="hb-abrir" aria-label={`${h.name}: ver el mes y marcar días anteriores`} onClick={() => setAbierto(h.id)}>{h.name}</button>
                        </h2>
                        {tipo === "dejar" && <span className="hb-tipo">Para dejar</span>}
                        <span>{frase(h, t)}</span>
                        {!semanal && best > s && <span>Tu mejor racha: {best} días</span>}
                        {(h.hora || semanal) && <span className="hb-cuando">{[h.hora ? `A las ${h.hora}` : "", semanal ? textoVeces(v) : ""].filter(Boolean).join(" · ")}</span>}
                      </div>
                      {tipo === "medible" ? (
                        <button className={`hb-medir${on ? " on" : ""}`} aria-label={`Anotar ${h.name} de hoy${c ? `: llevas ${conUnidad(h, c)}` : ""}`} onClick={() => setAnotando(h)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          Anotar
                        </button>
                      ) : (
                        <button
                          className="hb-check"
                          aria-pressed={on}
                          aria-label={tipo === "dejar" ? (on ? `${h.name}: hoy lo lograste. Tocar para desmarcar` : `Marcar que hoy lo lograste: ${h.name}`) : on ? `${h.name}: hecho hoy. Tocar para desmarcar` : `Marcar ${h.name} como hecho hoy`}
                          onClick={() => save("habitos", toggleHecho(h, t))}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                        </button>
                      )}
                    </div>
                    <Mes h={h} t={t} />
                  </article>
                );
              })
            ) : (
              <div className="card empty">Todavía no tienes hábitos. Toca el «+» de arriba para añadir el primero.</div>
            )}
          </div>
        </>
      )}

      {/* Nuevo hábito: una ventanita con lo que hay que escribir */}
      {creando && createPortal(
        <div className="modal hd-modal" onClick={(e) => e.target === e.currentTarget && setCreando(false)} onKeyDown={(e) => e.key === "Escape" && setCreando(false)}>
          <form
            className="sheet hf hd-hoja"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hb-nuevo-h"
            onSubmit={(e) => {
              e.preventDefault();
              const c = leerCampos(nuevo);
              if (!c.name) return;
              save("habitos", { id: newId(), ...c, area: "salud", orden: habitos.length, hechos: {}, created: new Date().toISOString() });
              setCreando(false);
            }}
          >
            <h2 id="hb-nuevo-h" className="hd-hoja-h">Nuevo hábito</h2>
            <CamposHabito v={nuevo} onChange={(p) => setNuevo((x) => ({ ...x, ...p }))} idp="hn" />
            <div className="hd-hoja-pie">
              <button type="button" className="btn ghost" onClick={() => setCreando(false)}>Cancelar</button>
              <button type="submit" className="btn" disabled={!nuevo.name.trim()}>Añadir</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
      {abierto && <HabitoDetalle id={abierto} onClose={() => setAbierto(null)} />}
      {anotando && <HabitoAnotar h={habitos.find((x) => x.id === anotando.id) ?? anotando} dia={t} onClose={() => setAnotando(null)} />}
    </>
  );
}
