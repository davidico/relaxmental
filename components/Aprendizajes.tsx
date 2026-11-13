"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { anadirRegla, type Aprendizaje } from "@/lib/aprender";
import { armarPlantilla } from "@/lib/imagen";

/**
 * «Aprendí de tus días»: las conclusiones de la IA sobre cómo ajustas tu horario.
 * Nada se aplica solo: «Sí, úsalo» la añade a tus reglas; «No» la descarta.
 */
export default function Aprendizajes() {
  const { perfil, savePerfil, offline } = useData();
  const [aceptadas, setAceptadas] = useState(0);
  const [tipo, setTipo] = useState<"" | "armando" | "ok" | "error">("");
  const todas = (perfil.aprendizajes as Aprendizaje[] | undefined) ?? [];
  const nuevas = todas.filter((a) => a.estado === "nueva");
  if (offline || (!nuevas.length && !aceptadas && tipo !== "ok")) return null;

  const decidir = (a: Aprendizaje, si: boolean) => {
    if (si) {
      const reglas = anadirRegla(perfil.reglas?.text ?? "", a.regla);
      savePerfil("reglas", { text: reglas, updated: new Date().toISOString() });
      setAceptadas((n) => n + 1);
    }
    savePerfil("aprendizajes", todas.map((x) => (x.id === a.id ? { ...x, estado: si ? "si" : "no" } : x)));
  };
  const rearmar = async () => {
    setTipo("armando");
    try {
      savePerfil("plantilla", await armarPlantilla(perfil.reglas?.text ?? ""));
      setTipo("ok");
      setAceptadas(0);
    } catch {
      setTipo("error");
    }
  };

  return (
    <section className="card pad hy-aviso apr" aria-labelledby="apr-h">
      <h2 id="apr-h" className="hy-h">Aprendí de tus días</h2>
      {nuevas.length > 0 && <p>Miré cómo ajustaste tus días. ¿Lo tengo en cuenta?</p>}
      <ul className="apr-lista">
        {nuevas.slice(0, 3).map((a) => (
          <li key={a.id}>
            <p className="apr-txt">{a.texto}</p>
            <div className="row actions">
              <button className="btn sm" onClick={() => decidir(a, true)}>Sí, úsalo</button>
              <button className="btn ghost sm" onClick={() => decidir(a, false)}>No</button>
            </div>
          </li>
        ))}
      </ul>
      {nuevas.length > 3 && <p className="hint">Y {nuevas.length - 3} más después de estas.</p>}
      {aceptadas > 0 && (
        <div className="apr-rearmar">
          <p>Lo añadí a tus reglas. ¿Rehago tu semana tipo con esto?</p>
          <button className="btn" onClick={rearmar} disabled={tipo === "armando"}>{tipo === "armando" ? "Armando tu semana…" : "Rehacer mi semana tipo"}</button>
          {tipo === "error" && <p className="verr" role="alert">⚠ No se pudo. Inténtalo otra vez.</p>}
        </div>
      )}
      {tipo === "ok" && <p className="vok" role="status">✓ Tu semana tipo ya usa lo aprendido.</p>}
    </section>
  );
}
