"use client";

import { useEffect, useState } from "react";
import { useData, newId } from "@/lib/data";
import { today } from "@/lib/dates";
import { useWide } from "@/lib/hooks";
import { DueChoice } from "./ui";
import NoteView from "./NoteView";
import TaskSheet from "./TaskSheet";
import Entreno from "./Entreno";
import Preguntar, { type ModoPregunta } from "./Preguntar";

type Mode = "task" | "note" | "entreno" | "ask" | null;

/**
 * Botón flotante.
 * - Escritorio: "+ Nueva tarea" (la captura de notas está en el panel).
 * - Móvil: "+" que abre dos opciones: Nueva tarea / Nueva nota.
 */
export default function QuickTask({ enPagina = false }: { enPagina?: boolean }) {
  const { save, hoy } = useData();
  const wide = useWide();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [done, setDone] = useState(false);
  /* Día y hora con los que se abre «Nueva tarea» (p. ej. desde «Planificar» en un hueco del día) */
  const [inicial, setInicial] = useState<{ due?: string; hora?: string } | undefined>(undefined);
  const [modoPregunta, setModoPregunta] = useState<ModoPregunta>("dia");
  const [f, setF] = useState({ title: "", step: "", due: today() });
  /* Si la app quedó abierta pasada la medianoche, "hoy" pasa al día nuevo */
  useEffect(() => setF((x) => (x.due && x.due < hoy ? { ...x, due: hoy } : x)), [hoy]);

  useEffect(() => {
    if (!mode && !menu) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(null);
        setMenu(false);
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [mode, menu]);

  const open = (m: Mode) => {
    setMenu(false);
    setDone(false);
    setMode(m);
  };
  const close = () => setMode(null);

  /* Otras pantallas (p. ej. Hoy en escritorio) pueden abrir "Nueva tarea" con un evento */
  useEffect(() => {
    const h = (e: Event) => {
      setInicial((e as CustomEvent<{ due?: string; hora?: string }>).detail ?? undefined);
      open("task");
    };
    const q = (e: Event) => {
      setModoPregunta((e as CustomEvent<{ modo?: ModoPregunta }>).detail?.modo ?? "dia");
      open("ask");
    };
    addEventListener("mi-semana:nueva-tarea", h);
    addEventListener("mi-semana:preguntar", q);
    return () => {
      removeEventListener("mi-semana:nueva-tarea", h);
      removeEventListener("mi-semana:preguntar", q);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {wide && enPagina ? null : wide ? (
        <button className="fab" onClick={() => open("task")} aria-label="Nueva tarea">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> Nueva tarea
        </button>
      ) : (
        <>
          {menu && <div className="dial-backdrop" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="dial" role="menu">
              <button role="menuitem" onClick={() => { setModoPregunta("dia"); open("ask"); }}>
                <span className="dial-ico" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4.2A8 8 0 1 1 20 12z" /></svg>
                </span>{" "}
                Preguntar a la IA
              </button>
              <button role="menuitem" onClick={() => open("entreno")}>
                <span className="dial-ico" aria-hidden="true">▶</span> Entrenar
              </button>
              <button role="menuitem" onClick={() => open("note")}>
                <span className="dial-ico" aria-hidden="true">✎</span> Nueva nota
              </button>
              <button role="menuitem" onClick={() => open("task")}>
                <span className="dial-ico" aria-hidden="true">✓</span> Nueva tarea
              </button>
            </div>
          )}
          <button className={`fab round${menu ? " open" : ""}`} onClick={() => setMenu(!menu)} aria-label={menu ? "Cerrar" : "Añadir"} aria-expanded={menu}>
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </>
      )}

      {mode === "entreno" && <Entreno onClose={close} />}
      {mode === "ask" && <Preguntar modo={modoPregunta} onClose={close} />}
      {mode === "note" && <NoteView list={[]} index={0} nueva={{ folder: "notas", tipo: "texto" }} onClose={close} />}
      {mode === "task" && <TaskSheet onClose={() => { close(); setInicial(undefined); }} inicial={inicial} />}
    </>
  );
}
