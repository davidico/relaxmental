"use client";

import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { toMin } from "@/lib/dates";
import type { Bloque, Plantilla } from "@/lib/plan";
import { armarPlantilla } from "@/lib/imagen";
import HoraInput from "./HoraInput";
import TextoCrece from "./TextoCrece";
import { useReglasDeTipo } from "./ReglasDeTipo";

/* De lunes a domingo; la clave de cada día en la plantilla es su número (domingo = 0) */
const DIAS = [
  { k: "1", corto: "L", nombre: "Lunes" },
  { k: "2", corto: "M", nombre: "Martes" },
  { k: "3", corto: "M", nombre: "Miércoles" },
  { k: "4", corto: "J", nombre: "Jueves" },
  { k: "5", corto: "V", nombre: "Viernes" },
  { k: "6", corto: "S", nombre: "Sábado" },
  { k: "0", corto: "D", nombre: "Domingo" },
];
const hhmm = (min: number) => `${String(Math.floor(Math.min(min, 1439) / 60)).padStart(2, "0")}:${String(Math.min(min, 1439) % 60).padStart(2, "0")}`;
const limpia = (p: Plantilla): Plantilla => Object.fromEntries(DIAS.map((d) => [d.k, (p[d.k] ?? []).map((b) => ({ ...b }))]));
const igual = (a: Plantilla, b: Plantilla) => JSON.stringify(limpia(a)) === JSON.stringify(limpia(b));

/**
 * «Mi semana tipo»: la semana normal de la persona, hecha por ella: qué hace cada día y a qué hora.
 * Es la base de su horario (la línea de Hoy) y de lo que la IA le propone. Se guarda en `perfil/plantilla`.
 * Si quiere, la IA le propone una con sus reglas (y ella la retoca aquí).
 */
export default function SemanaTipo() {
  const { perfil, savePerfil, mode, offline } = useData();
  const guardada = (perfil.plantilla ?? {}) as Plantilla;
  const [p, setP] = useState<Plantilla>(() => limpia(guardada));
  const [dia, setDia] = useState(() => String(new Date().getDay()));
  const [estado, setEstado] = useState<"" | "ok">("");
  const [copiar, setCopiar] = useState(false);
  const [ia, setIa] = useState<"" | "preguntar" | "armando" | "error">("");
  /* Al cargar los datos (o si cambian desde otro sitio) y no hay nada a medias, se muestra lo guardado */
  const [base, setBase] = useState(() => JSON.stringify(limpia(guardada)));
  useEffect(() => {
    const g = JSON.stringify(limpia(guardada));
    if (g === base) return;
    if (JSON.stringify(p) === base) setP(limpia(guardada));
    setBase(g);
  }, [guardada]); // eslint-disable-line react-hooks/exhaustive-deps

  const filas = p[dia] ?? [];
  const cambiado = !igual(p, guardada);
  const nombreDia = DIAS.find((d) => d.k === dia)!.nombre;
  const poner = (rows: Bloque[]) => {
    setP((x) => ({ ...x, [dia]: rows }));
    setEstado("");
  };
  /* Al cambiar el final de un momento, el siguiente empieza a esa hora (y conserva lo que duraba) */
  const set = (i: number, patch: Partial<Bloque>) =>
    poner(
      filas.map((b, j) => {
        if (j === i) return { ...b, ...patch };
        if (j === i + 1 && patch.e && toMin(patch.e) > toMin(filas[i].s)) {
          const dur = Math.max(15, toMin(b.e) - toMin(b.s));
          const s = patch.e;
          return { ...b, s, e: toMin(b.e) > toMin(s) ? b.e : hhmm(toMin(s) + dur) };
        }
        return b;
      }),
    );
  const anadir = () => {
    const ult = filas[filas.length - 1];
    const s = ult ? ult.e : "07:00";
    poner([...filas, { s, e: hhmm(toMin(s) + 60), t: "", a: "casa" }]);
  };
  const malas = (rows: Bloque[]) => rows.some((b) => !b.t.trim() || toMin(b.e) <= toMin(b.s));
  const valido = DIAS.every((d) => !malas(p[d.k] ?? []));
  const guardar = () => {
    if (!valido) return null;
    const lista = Object.fromEntries(DIAS.map((d) => [d.k, (p[d.k] ?? []).map((b) => ({ ...b, t: b.t.trim() })).sort((x, y) => toMin(x.s) - toMin(y.s))]));
    savePerfil("plantilla", lista);
    /* La semana cambió: las reglas pueden haberse quedado viejas (se ofrece ponerlas al día hasta que se haga) */
    savePerfil("tipoCambiada", { at: new Date().toISOString() });
    /* Ya la revisó: se quita el aviso de «revísala» */
    if (perfil.plantillaRevisar) savePerfil("plantillaRevisar", null);
    setP(lista);
    setEstado("ok");
    return lista as Plantilla;
  };
  const copiarA = (ks: string[]) => {
    setP((x) => ({ ...x, ...Object.fromEntries(ks.map((k) => [k, filas.map((b) => ({ ...b }))])) }));
    setCopiar(false);
    setEstado("");
  };
  const conIA = async () => {
    setIa("armando");
    try {
      setP(limpia((await armarPlantilla(perfil.reglas?.text ?? "")) as Plantilla));
      setEstado("");
      setIa("");
    } catch {
      setIa("error");
    }
  };
  const puedeIA = mode === "cloud" && !offline && !!perfil.reglas?.text?.trim();
  /* Poner las reglas al día con esta semana tipo: la IA las reescribe y la persona las revisa a pantalla completa antes de guardarlas */
  const rt = useReglasDeTipo();
  const hayAlgo = DIAS.some((d) => (p[d.k] ?? []).length);
  const actualizarReglas = () => {
    if (!valido) return;
    /* Si hay cambios sin guardar, primero se guardan; la semana va en la petición para que la IA lea justo esta */
    const semana = cambiado ? guardar() : limpia(guardada);
    if (semana) void rt.pedir(semana);
  };

  return (
    <section className="card pad st" aria-label="Mi semana tipo">
      {perfil.plantillaRevisar && (
        <p className="st-aviso" role="note">
          Esta semana te la propuso la IA con lo que le contaste. Cámbiala para que sea como tu semana de verdad (horas, nombres, lo que sobre o falte) y guárdala.
        </p>
      )}
      <div className="st-dias" role="tablist" aria-label="Día de la semana">
        {DIAS.map((d) => (
          <button key={d.k} role="tab" aria-selected={d.k === dia} aria-label={`${d.nombre}: ${(p[d.k] ?? []).length} momentos`} className={(p[d.k] ?? []).length ? "" : "vacio"} onClick={() => { setDia(d.k); setCopiar(false); }}>
            {d.corto}
          </button>
        ))}
      </div>

      <div className="st-cab">
        <h2 className="st-h">{nombreDia}</h2>
        {filas.length > 0 && (
          <button type="button" className="linkbtn" aria-expanded={copiar} onClick={() => setCopiar(!copiar)}>Copiar a otros días</button>
        )}
      </div>
      {copiar && (
        <div className="st-copiar" role="group" aria-label={`Copiar el ${nombreDia.toLowerCase()} a`}>
          <button className="btn ghost sm" onClick={() => copiarA(["1", "2", "3", "4", "5"].filter((k) => k !== dia))}>De lunes a viernes</button>
          <button className="btn ghost sm" onClick={() => copiarA(DIAS.map((d) => d.k).filter((k) => k !== dia))}>Todos los días</button>
          {DIAS.filter((d) => d.k !== dia).map((d) => (
            <button key={d.k} className="btn ghost sm" onClick={() => copiarA([d.k])}>{d.nombre}</button>
          ))}
        </div>
      )}

      {filas.length ? (
        <ul className="st-lista">
          {filas.map((b, i) => {
            const mal = toMin(b.e) <= toMin(b.s);
            return (
              <li key={i} className="st-fila">
                <div className="st-horas">
                  <HoraInput id={`st-s-${dia}-${i}`} label="Empieza" value={b.s} onChange={(v) => set(i, { s: v })} />
                  <span aria-hidden="true">–</span>
                  <HoraInput id={`st-e-${dia}-${i}`} label="Termina" value={b.e} onChange={(v) => set(i, { e: v })} invalid={mal} desde={b.s} />
                </div>
                <label htmlFor={`st-t-${dia}-${i}`} className="sr-only">Qué haces</label>
                <TextoCrece id={`st-t-${dia}-${i}`} className="st-nombre" placeholder="Qué haces" autoComplete="off" value={b.t} onTexto={(t) => set(i, { t })} />
                <button type="button" className="st-x" aria-label={`Quitar ${b.t || "este momento"}`} onClick={() => poner(filas.filter((_, j) => j !== i))}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="st-vacio">Aún no has puesto nada el {nombreDia.toLowerCase()}. Añade tus momentos: levantarte, trabajo, comidas, descanso…</p>
      )}
      <button type="button" className="linkbtn st-mas" onClick={anadir}>+ Añadir momento</button>

      <div className="st-pie">
        <button className="btn" onClick={() => void guardar()} disabled={!cambiado || !valido}>Guardar mi semana tipo</button>
        {cambiado && <button className="btn ghost" onClick={() => { setP(limpia(guardada)); setEstado(""); }}>Deshacer cambios</button>}
        <span role="status" className={!valido ? "verr" : estado === "ok" ? "vok" : "hint"}>
          {!valido ? "⚠ Revisa: cada momento necesita nombre y terminar después de empezar." : estado === "ok" ? "✓ Guardada" : cambiado ? "Tienes cambios sin guardar" : ""}
        </span>
      </div>

      {/* Solo si la semana cambió (hay cambios sin guardar, o se guardaron y las reglas aún no se han puesto al día) */}
      {mode === "cloud" && !offline && hayAlgo && (cambiado || !!perfil.tipoCambiada || rt.estado !== "" || rt.ok) && (
        <div className="st-reglas">
          {(cambiado || !!perfil.tipoCambiada || rt.estado !== "") && (
            <>
              <p>Cambiaste tu semana: tus reglas pueden haberse quedado viejas. La IA las pone al día con esta semana tipo y tú las revisas antes de guardarlas.</p>
              <div className="row actions">
                <button type="button" className="btn ghost" onClick={actualizarReglas} disabled={rt.estado === "armando" || !valido}>
                  {rt.estado === "armando" ? "Actualizando tus reglas…" : cambiado ? "Guardar y actualizar mis reglas" : "Actualizar mis reglas con esta semana"}
                </button>
              </div>
            </>
          )}
          {rt.ok && <p className="vok" role="status">✓ Tus reglas ya están al día con esta semana.</p>}
          {rt.estado === "error" && <p className="verr" role="alert">⚠ No se pudieron actualizar. Inténtalo otra vez.</p>}
        </div>
      )}
      {rt.editor}

      {puedeIA && (
        <div className="st-ia">
          {ia === "preguntar" ? (
            <div className="confirm">
              La IA arma los 7 días con tus reglas y reemplaza lo que ves aquí. Después lo revisas y lo guardas tú.
              <button className="btn sm" onClick={conIA}>Sí, proponme una</button>
              <button className="btn sm ghost" onClick={() => setIa("")}>No</button>
            </div>
          ) : (
            <button type="button" className="linkbtn" disabled={ia === "armando"} onClick={() => (Object.values(p).some((x) => x.length) ? setIa("preguntar") : void conIA())}>
              {ia === "armando" ? "La IA está armando tu semana…" : "¿No sabes por dónde empezar? Que la IA te proponga una con tus reglas"}
            </button>
          )}
          {ia === "error" && <p className="verr" role="alert">⚠ No se pudo armar. Inténtalo otra vez.</p>}
        </div>
      )}
    </section>
  );
}
