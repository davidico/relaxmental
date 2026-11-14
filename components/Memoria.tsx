"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { MES } from "@/lib/dates";
import { anadirRecuerdos, type Recuerdo } from "@/lib/aprender";
import { avisarBorrado } from "@/lib/deshacer";

const ORIGEN: Record<Recuerdo["origen"], string> = { diario: "De tu diario", semana: "De tu semana", tu: "Lo escribiste tú" };
const cuando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} de ${MES[d.getMonth()]}`;
};

/**
 * «Lo que la IA recuerda de mí»: la memoria completa, a la vista.
 * La IA apunta aquí lo que aprende (del diario y del resumen semanal); la persona puede
 * añadir, corregir o borrar cualquier frase. Es lo único que la IA «recuerda».
 */
export default function Memoria() {
  const { perfil, savePerfil } = useData();
  const todos = (perfil.memoria as Recuerdo[] | undefined) ?? [];
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  const anadir = () => {
    if (!nuevo.trim()) return;
    anadirRecuerdos(perfil, savePerfil, [nuevo], "tu");
    setNuevo("");
  };
  const guardar = (r: Recuerdo) => {
    const t = texto.trim().slice(0, 200);
    if (t && t !== r.texto) savePerfil("memoria", todos.map((x) => (x.id === r.id ? { ...x, texto: t, origen: "tu" as const } : x)));
    setEditando(null);
  };
  const borrar = (r: Recuerdo) => {
    savePerfil("memoria", todos.filter((x) => x.id !== r.id));
    avisarBorrado({ texto: r.texto.length > 40 ? r.texto.slice(0, 40) + "…" : r.texto, deshacer: () => savePerfil("memoria", todos) });
  };

  return (
    <>
      <form
        className="card pad mem-nuevo"
        onSubmit={(e) => {
          e.preventDefault();
          anadir();
        }}
      >
        <label htmlFor="mem-in">Dile algo que deba saber de ti</label>
        <div className="mem-fila">
          <input id="mem-in" value={nuevo} maxLength={200} placeholder="Ej.: Rindo más de mañana…" autoComplete="off" onChange={(e) => setNuevo(e.target.value)} />
          <button className="btn" type="submit" disabled={!nuevo.trim()}>Añadir</button>
        </div>
      </form>

      <h2 className="banda" id="mem-h">
        {todos.length === 1 ? "Recuerda 1 cosa" : `Recuerda ${todos.length} cosas`}
      </h2>
      {todos.length ? (
        <ul className="card mem-lista" aria-labelledby="mem-h">
          {[...todos].reverse().map((r) => (
            <li key={r.id}>
              {editando === r.id ? (
                <form
                  className="mem-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    guardar(r);
                  }}
                >
                  <label htmlFor={`mem-${r.id}`} className="sr-only">Corregir</label>
                  <input id={`mem-${r.id}`} autoFocus value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditando(null)} />
                  <div className="mem-fila">
                    <button className="btn sm" type="submit" disabled={!texto.trim()}>Guardar</button>
                    <button className="btn ghost sm" type="button" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    className="mem-txt"
                    aria-label={`Corregir: ${r.texto}`}
                    onClick={() => {
                      setTexto(r.texto);
                      setEditando(r.id);
                    }}
                  >
                    <span>{r.texto}</span>
                    <span className="mem-meta">{[ORIGEN[r.origen] ?? "", cuando(r.fecha)].filter(Boolean).join(", ")}</span>
                  </button>
                  <button className="nv-ib mem-x" aria-label={`Olvidar: ${r.texto}`} onClick={() => borrar(r)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mem-vacio">
          Todavía no recuerdo nada. Cada noche, al guardar tu diario, apunto aquí lo importante que aprendo de ti. También puedes escribirlo tú arriba.
        </p>
      )}
      <p className="hint mem-pie">Toca una frase para corregirla. Lo que borres, la IA lo olvida.</p>
    </>
  );
}
