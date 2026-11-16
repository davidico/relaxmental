"use client";

import { useEffect, useState } from "react";
import { newId, useData } from "@/lib/data";
import { claveMomento, habitoDeMomento, sortHabits } from "@/lib/habits";
import { toMin } from "@/lib/dates";
import { baseDe, encajar, type Bloque } from "@/lib/plan";
import { claveDe } from "@/lib/momentos";
import { aprender, registrarCambio } from "@/lib/aprender";
import HoraInput from "./HoraInput";
import TextoCrece from "./TextoCrece";

/**
 * Cambiar un momento del día ahí mismo, en una hoja: su nombre, su descripción y sus horas, o quitarlo.
 * Vale solo para ese día (se guarda como día ajustado; la semana tipo no cambia). Lo que se cruce con las horas nuevas se recorta.
 * Si cambia de hora o de nombre, su marca de «hecho» y sus subtareas lo siguen.
 */
export default function MomentoSheet({ dia, bloque, onClose }: { dia: string; bloque: Bloque; onClose: () => void }) {
  const { dias, saveDia, perfil, savePerfil, tareas, save, habitos } = useData();
  const base = baseDe(dia, { dias, plantilla: perfil.plantilla, eventos: perfil.eventos });
  /* En la línea, una tarea con hora puede partir un momento en dos: aquí se cambia el momento entero */
  const orig =
    base.find((b) => b.s === bloque.s && b.e === bloque.e && b.t === bloque.t) ??
    base.find((b) => b.t === bloque.t && toMin(b.s) <= toMin(bloque.s) && toMin(b.e) >= toMin(bloque.e)) ??
    bloque;
  const [t, setT] = useState(orig.t);
  const [sub, setSub] = useState(orig.sub ?? "");
  const [s, setS] = useState(orig.s);
  const [e, setE] = useState(orig.e);
  const [quitar, setQuitar] = useState(false);
  /* El hábito que cuenta este momento (vale para todos los días que lo tengan): id, "" = ninguno, "nuevo" = crear uno con su nombre */
  const actual = habitoDeMomento(orig.t, habitos, perfil.habitosMomento)?.id ?? "";
  const [hab, setHab] = useState(actual);
  const listaHab = sortHabits(habitos);
  const yaExiste = habitos.some((h) => claveMomento(h.name) === claveMomento(t));

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !document.querySelector(".hora-dlg")) onClose();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const horasMal = toMin(e) <= toMin(s);
  const puede = !!t.trim() && !horasMal;

  /** Guarda a qué hábito cuenta este momento (por su nombre), creando el hábito si se pidió */
  const guardarHabito = (nombre: string) => {
    let id = hab;
    if (hab === "nuevo") {
      id = newId();
      save("habitos", { id, name: nombre, area: "salud", orden: habitos.length, hechos: {}, created: new Date().toISOString(), tipo: "marca" });
    }
    const k = claveMomento(nombre);
    const antes = perfil.habitosMomento ?? {};
    if (hab !== actual || k !== claveMomento(orig.t)) savePerfil("habitosMomento", { ...antes, [k]: id });
  };

  const aplicar = (nuevo: Bloque | null) => {
    if (nuevo) guardarHabito(nuevo.t);
    /* Si solo cambió el hábito, el día no se toca (sigue tu semana tipo) */
    if (nuevo && nuevo.t === orig.t && (nuevo.sub ?? "") === (orig.sub ?? "") && nuevo.s === orig.s && nuevo.e === orig.e) return onClose();
    const resto = base.filter((b) => b !== orig);
    const despues = nuevo ? encajar(resto, [nuevo]) : resto;
    saveDia(dia, despues);
    const vieja = claveDe(orig);
    const clave = nuevo ? claveDe(nuevo) : "";
    if (clave !== vieja) {
      /* La marca de «hecho» y las subtareas siguen al momento */
      const hechos = perfil.hechos?.[dia] ?? [];
      if (hechos.includes(vieja)) savePerfil("hechos", { ...(perfil.hechos ?? {}), [dia]: [...hechos.filter((x) => x !== vieja), ...(clave ? [clave] : [])] });
      for (const x of tareas) if (x.due === dia && x.momento === vieja) save("tareas", { ...x, momento: clave || undefined });
    }
    /* La IA aprende de lo que cambiaste, igual que al editar el día entero */
    const hist = registrarCambio(perfil, savePerfil, dia, base, despues);
    if (hist) void aprender(perfil, savePerfil, hist).catch(() => {});
    onClose();
  };

  return (
    <div className="modal" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <form
        className="sheet aq ms"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ms-h"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (puede) aplicar({ ...orig, t: t.trim(), sub: sub.trim() || undefined, s, e });
        }}
      >
        <h2 id="ms-h" className="aq-h">Cambiar este momento</h2>
        <label htmlFor="ms-t" className="sr-only">Nombre</label>
        <TextoCrece id="ms-t" className="ts-title" autoComplete="off" enterKeyHint="done" placeholder="Nombre" value={t} onTexto={setT} />
        <div className="ts-campo">
          <label htmlFor="ms-sub">Descripción (opcional)</label>
          <TextoCrece id="ms-sub" className="ms-sub" autoComplete="off" enterKeyHint="done" value={sub} onTexto={setSub} onEnter={() => {}} />
        </div>
        <div className="ms-horas">
          <div className="ts-campo">
            <span id="ms-s-l">Empieza</span>
            <HoraInput id="ms-s" label="Empieza" value={s} onChange={setS} />
          </div>
          <div className="ts-campo">
            <span id="ms-e-l">Termina</span>
            <HoraInput id="ms-e" label="Termina" value={e} onChange={setE} desde={s} invalid={horasMal} />
          </div>
        </div>
        {horasMal && <p className="verr" role="alert">⚠ Tiene que terminar después de empezar.</p>}
        <p className="ms-nota">Cambia solo este día. Si se cruza con otro momento, ese se recorta.</p>

        <div className="ts-campo">
          <label htmlFor="ms-hab">¿Cuenta como hábito?</label>
          <select id="ms-hab" value={hab === "nuevo" && (yaExiste || !t.trim()) ? "" : hab} onChange={(e) => setHab(e.target.value)}>
            <option value="">No</option>
            {listaHab.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
            {!yaExiste && t.trim() && <option value="nuevo">+ Nuevo hábito «{t.trim()}»</option>}
          </select>
          <p className="ms-nota ms-hab-nota">
            {hab ? `Al marcar «${t.trim() || orig.t}» como hecho, se marca también el hábito. Vale para todos los días que tengan este momento.` : "Vale para todos los días que tengan este momento."}
          </p>
        </div>

        {quitar ? (
          <div className="aq-pie" role="group" aria-label="Confirmar">
            <span className="ms-preg">¿Quitarlo de este día?</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="ts-save" onClick={() => setQuitar(false)}>No</button>
            <button type="button" className="ts-save ts-borrar" onClick={() => aplicar(null)}>Sí, quitar</button>
          </div>
        ) : (
          <div className="aq-pie">
            <button type="button" className="ts-save ts-borrar" onClick={() => setQuitar(true)}>Quitar</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="ts-save" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ts-save" disabled={!puede}>Guardar</button>
          </div>
        )}
      </form>
    </div>
  );
}
