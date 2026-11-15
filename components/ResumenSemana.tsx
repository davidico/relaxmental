"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { addD, mondayOf, pd } from "@/lib/dates";
import { pedirResumenSemana } from "@/lib/aprender";

/**
 * El repaso de la semana (domingo, y el lunes si quedó pendiente): la IA mira tus últimos días
 * y lo que recuerda de ti, te cuenta cómo fue y deja recomendaciones en «Mis propuestas para ti».
 */
export default function ResumenSemana() {
  const { mode, offline, perfil, savePerfil, hoy } = useData();
  const [estado, setEstado] = useState<"" | "pensando" | "error">("");
  const [nuevas, setNuevas] = useState<number | null>(null);
  const dow = pd(hoy).getDay();
  if (mode !== "cloud" || offline || (dow !== 0 && dow !== 1)) return null;
  /* La semana que se repasa: la que acaba hoy (domingo) o la que acabó ayer (lunes) */
  const semana = dow === 0 ? mondayOf(hoy) : addD(mondayOf(hoy), -7);
  const hecho = perfil.resumenSemana?.semana === semana ? perfil.resumenSemana : null;
  if ((perfil.semanaVista as string | undefined) === semana && nuevas === null) return null;

  const pedir = async () => {
    setEstado("pensando");
    try {
      setNuevas(await pedirResumenSemana(perfil, savePerfil, semana));
      setEstado("");
    } catch {
      setEstado("error");
    }
  };

  return (
    <section className="card pad hy-aviso rs" aria-labelledby="rs-h">
      <h2 id="rs-h" className="hy-h">{hecho ? "Tu semana" : "¿Repasamos tu semana?"}</h2>
      {hecho ? (
        <>
          <p className="rs-txt">{hecho.texto}</p>
          {nuevas !== null && nuevas > 0 && <p role="status">Te dejé {nuevas === 1 ? "1 recomendación" : `${nuevas} recomendaciones`} en «Mis propuestas para ti».</p>}
          <div className="row actions">
            <button className="btn sm" onClick={() => { try { localStorage.setItem("mi-semana-hoy-vista", "semana"); } catch {} dispatchEvent(new Event("mi-semana:ver-semana")); }}>Armar la semana que viene</button>
            <button className="btn ghost sm" onClick={() => { savePerfil("semanaVista", semana); setNuevas(null); }}>Ocultar</button>
          </div>
        </>
      ) : (
        <>
          <p>Miro tus diarios, tus metas, tus tareas y tus hábitos de estos días y te cuento cómo fue, con dos o tres recomendaciones para la que viene.</p>
          {estado === "error" && <p className="verr" role="alert">⚠ No pude hacerlo ahora. Inténtalo otra vez.</p>}
          <div className="row actions">
            <button className="btn sm" onClick={pedir} disabled={estado === "pensando"}>{estado === "pensando" ? "Repasando tu semana…" : "Ver mi resumen"}</button>
            <button className="btn ghost sm" onClick={() => savePerfil("semanaVista", semana)}>Ahora no</button>
          </div>
        </>
      )}
    </section>
  );
}
