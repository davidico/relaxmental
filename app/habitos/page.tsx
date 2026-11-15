"use client";

import { useState } from "react";
import { useData, newId } from "@/lib/data";
import { addD, fdate, today } from "@/lib/dates";
import { bestStreak, cantidad, conUnidad, sortHabits, streak, tipoDe, type TipoHabito } from "@/lib/habits";
import type { Habito } from "@/lib/types";
import { toggleHecho } from "@/components/ui";
import HabitoAnotar from "@/components/HabitoAnotar";
import HabitoDetalle, { CamposHabito, leerCampos } from "@/components/HabitoDetalle";
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

const VACIO = { name: "", tipo: "marca" as TipoHabito, unidad: "", objetivo: "" };

export default function Habitos() {
  const { habitos, save } = useData();
  const t = today();
  const [vista, setVista] = useState<"lista" | "semana">("lista");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [anotando, setAnotando] = useState<Habito | null>(null);
  const [nuevo, setNuevo] = useState(VACIO);
  const list = sortHabits(habitos);

  return (
    <>
      <h1>Hábitos</h1>
      <div className="sem-vista" role="tablist" aria-label="Cómo ver tus hábitos">
        <button role="tab" aria-selected={vista === "lista"} onClick={() => setVista("lista")}>Mis hábitos</button>
        <button role="tab" aria-selected={vista === "semana"} onClick={() => setVista("semana")}>Semana</button>
      </div>

      {vista === "semana" ? (
        <HabitosSemana onAbrir={setAbierto} />
      ) : (
        <>
          <div className="habgrid">
            {list.length ? (
              list.map((h) => {
                const tipo = tipoDe(h);
                const on = !!h.hechos[t];
                const s = streak(h, t);
                const best = bestStreak(h);
                const c = cantidad(h, t);
                return (
                  <article className="card hb" key={h.id} aria-labelledby={`hb-${h.id}`}>
                    <div className="hb-top">
                      <div className={`hb-num${s ? "" : " cero"}`}>
                        <b>{s}</b>
                        <span>{s === 1 ? "día" : "días"}</span>
                      </div>
                      <div className="hb-txt">
                        <h2 id={`hb-${h.id}`}>{h.name}</h2>
                        {tipo === "dejar" && <span className="hb-tipo">Para dejar</span>}
                        <span>{frase(h, t)}</span>
                        {best > s && <span>Tu mejor racha: {best} días</span>}
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
                    <div className="hb-foot">
                      <span>Últimos 30 días</span>
                      <button className="linkbtn hb-del" onClick={() => setAbierto(h.id)} aria-label={`Ver el mes de ${h.name} y marcar días anteriores`}>
                        Ver mes
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="card empty">Todavía no tienes hábitos. Añade el primero abajo.</div>
            )}
          </div>
          <h2 className="banda" id="hb-nuevo-h">Nuevo hábito</h2>
          <form
            className="card pad hf newhabit"
            aria-labelledby="hb-nuevo-h"
            onSubmit={(e) => {
              e.preventDefault();
              const c = leerCampos(nuevo);
              if (!c.name) return;
              save("habitos", { id: newId(), ...c, area: "salud", orden: habitos.length, hechos: {}, created: new Date().toISOString() });
              setNuevo(VACIO);
            }}
          >
            <CamposHabito v={nuevo} onChange={(p) => setNuevo((x) => ({ ...x, ...p }))} idp="hn" />
            <div>
              <button className="btn" type="submit" disabled={!nuevo.name.trim()}>Añadir hábito</button>
            </div>
          </form>
        </>
      )}

      {abierto && <HabitoDetalle id={abierto} onClose={() => setAbierto(null)} />}
      {anotando && <HabitoAnotar h={habitos.find((x) => x.id === anotando.id) ?? anotando} dia={t} onClose={() => setAnotando(null)} />}
    </>
  );
}
