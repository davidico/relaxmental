"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DataProvider, useData } from "@/lib/data";
import { pad } from "@/lib/dates";
import type { Tarea } from "@/lib/types";

const NAV = [
  { href: "/hoy", label: "Hoy", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { href: "/semana", label: "Semana", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  {
    href: "/habitos",
    label: "Hábitos",
    icon: <><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="10" y="3" width="5" height="5" rx="1" /><rect x="17" y="3" width="4" height="5" rx="1" /><rect x="3" y="10" width="5" height="5" rx="1" /><rect x="10" y="10" width="5" height="5" rx="1" /><rect x="3" y="17" width="5" height="4" rx="1" /></>,
  },
  { href: "/cerebro", label: "Cerebro", icon: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></> },
  { href: "/tareas", label: "Tareas", icon: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M3.5 6l1.5 1.5L7 5M3.5 12l1.5 1.5L7 11M3.5 18l1.5 1.5L7 17" /></> },
];

/* Temporizador de 10 minutos, disponible desde cualquier pantalla */
const FocusCtx = createContext<(t: Tarea) => void>(() => {});
export const useFocus = () => useContext(FocusCtx);

function FocusBar({ task, onClose }: { task: Tarea; onClose: () => void }) {
  const [end] = useState(() => Date.now() + 10 * 60 * 1000);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - Date.now());
  return (
    <div className="focus">
      <div className="box">
        <span className="clock">{left ? `${pad(Math.floor(left / 60000))}:${pad(Math.floor(left / 1000) % 60)}` : "¡Listo!"}</span>
        <div className="what">
          {task.title}
          <small>{left ? task.step || "Solo 10 minutos" : "Puedes parar sin culpa, o seguir."}</small>
        </div>
        <button onClick={onClose}>{left ? "Parar" : "Cerrar"}</button>
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { mode, email, error } = useData();
  const [focus, setFocus] = useState<Tarea | null>(null);
  const wide = path === "/semana";
  const status = mode === "cloud" ? "Guardado en la nube" : mode === "local" ? "Guardado en este navegador" : "Cargando…";

  return (
    <FocusCtx.Provider value={setFocus}>
      <div className={`wrap${wide ? " wide" : ""}`}>
        <div className="top">
          <span className="brand">MI SEMANA</span>
          <span className="sync">{status}</span>
        </div>
        {error && <div className="banner">{error}</div>}
        {mode === "loading" ? <div className="empty">Cargando…</div> : children}
      </div>
      {focus && <FocusBar key={focus.id + focus.created} task={focus} onClose={() => setFocus(null)} />}
      <nav className="tabs" aria-label="Secciones">
        <div className="side-brand">
          Mi Semana<small>David · Berlín</small>
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{n.icon}</svg>
            {n.label}
          </Link>
        ))}
        {email && (
          <div className="side-foot">
            {email}
            <br />
            <a className="linkbtn" href="/cdn-cgi/access/logout">Cerrar sesión</a>
          </div>
        )}
      </nav>
    </FocusCtx.Provider>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <Frame>{children}</Frame>
    </DataProvider>
  );
}
