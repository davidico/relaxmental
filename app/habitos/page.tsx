"use client";

import { useState } from "react";
import { useData, newId } from "@/lib/data";
import { addD, fdate, today } from "@/lib/dates";
import { bestStreak, sortHabits, streak } from "@/lib/habits";
import { AREAS, type Area, type Habito } from "@/lib/types";
import { toggleHecho } from "@/components/ui";

/** Los últimos 30 días, de izquierda (hace 29 días) a derecha (hoy) */
function Mes({ h, t }: { h: Habito; t: string }) {
  const dias = Array.from({ length: 30 }, (_, i) => addD(t, i - 29));
  const n = dias.filter((d) => h.hechos[d]).length;
  return (
    <div className="hb-mes" role="img" aria-label={`Últimos 30 días: ${n} hechos`}>
      {dias.map((d) => (
        <i key={d} className={h.hechos[d] ? "on" : d === t ? "tdy" : ""} title={fdate(d)} />
      ))}
    </div>
  );
}

export default function Habitos() {
  const { habitos, save, remove } = useData();
  const t = today();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [area, setArea] = useState<Area>("salud");
  const list = sortHabits(habitos);

  return (
    <>
      <h1>Hábitos</h1>
      <p className="sub">Toca el círculo cuando lo hagas. El número grande es cuántos días seguidos llevas.</p>
      <div className="hy-dots" aria-hidden="true" />
      <div className="habgrid">
        {list.length ? (
          list.map((h) => {
            const on = !!h.hechos[t];
            const s = streak(h);
            const best = bestStreak(h);
            const frase = on
              ? "Hoy ya está ✓"
              : s > 0
                ? "Hoy aún no: márcalo y sigue la racha"
                : best > 0
                  ? "Empieza otra vez hoy"
                  : "Hoy es buen día para empezar";
            return (
              <article className="card hb" key={h.id} aria-labelledby={`hb-${h.id}`}>
                <div className="hb-top">
                  <div className={`hb-num${s ? "" : " cero"}`}>
                    <b>{s}</b>
                    <span>{s === 1 ? "día" : "días"}</span>
                  </div>
                  <div className="hb-txt">
                    <h2 id={`hb-${h.id}`}>{h.name}</h2>
                    <span>{frase}</span>
                    {best > s && <span>Tu mejor racha: {best} días</span>}
                  </div>
                  <button className="hb-check" aria-pressed={on} aria-label={on ? `${h.name}: hecho hoy. Tocar para desmarcar` : `Marcar ${h.name} como hecho hoy`} onClick={() => save("habitos", toggleHecho(h, t))}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                  </button>
                </div>
                <Mes h={h} t={t} />
                <div className="hb-foot">
                  <span>Últimos 30 días</span>
                  <button className="linkbtn hb-del" onClick={() => setConfirm(h.id)}>Borrar</button>
                </div>
                {confirm === h.id && (
                  <div className="confirm">
                    ¿Borrar &quot;{h.name}&quot; y su historial?
                    <button className="btn sm warn" onClick={() => { remove("habitos", h.id); setConfirm(null); }}>Borrar</button>
                    <button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="card empty">Todavía no tienes hábitos. Añade el primero abajo.</div>
        )}
      </div>
      <h2>Nuevo hábito</h2>
      <div className="card newhabit">
        <form
          className="add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            save("habitos", { id: newId(), name: name.trim(), area, orden: habitos.length, hechos: {}, created: new Date().toISOString() });
            setName("");
          }}
        >
          <div className="row">
            <input id="h-name" placeholder="Ej. Leer 1 capítulo" required value={name} onChange={(e) => setName(e.target.value)} />
            <select id="h-area" value={area} onChange={(e) => setArea(e.target.value as Area)}>
              {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><button className="btn" type="submit">Añadir hábito</button></div>
        </form>
      </div>
    </>
  );
}
