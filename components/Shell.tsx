"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DataProvider, useData } from "@/lib/data";
import QuickTask from "./QuickTask";
import { pad } from "@/lib/dates";
import type { Tarea } from "@/lib/types";

const NAV = [
  { href: "/semana", label: "Semana", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
  {
    href: "/habitos",
    label: "Hábitos",
    icon: <><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="10" y="3" width="5" height="5" rx="1" /><rect x="17" y="3" width="4" height="5" rx="1" /><rect x="3" y="10" width="5" height="5" rx="1" /><rect x="10" y="10" width="5" height="5" rx="1" /><rect x="3" y="17" width="5" height="4" rx="1" /></>,
  },
  { href: "/hoy", label: "Hoy", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
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
  const { mode, email, error, carpetas, offline, pendientes, retry } = useData();
  const tops = carpetas.filter((c) => !c.parent).sort((a, b) => a.orden - b.orden);
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      setHash(h === "todo" ? "" : h);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, [path]);
  const hc = carpetas.find((c) => c.id === hash.split("/")[0]);
  const topOfHash = hc ? (hc.parent ?? hc.id) : "";
  const [focus, setFocus] = useState<Tarea | null>(null);
  /* Alto visible real (sin el teclado), para que las hojas a pantalla completa no se escondan */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => {
      document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
      document.documentElement.style.setProperty("--vvt", `${vv.offsetTop}px`);
    };
    set();
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
    };
  }, []);
  const wide = path === "/semana";
  const status =
    mode === "local" ? "Guardado en este navegador" : mode === "loading" ? "Cargando…" : offline ? "Sin conexión" : pendientes ? "Guardando…" : "Guardado en la nube";

  return (
    <FocusCtx.Provider value={setFocus}>
      <div className={`wrap${wide ? " wide" : ""}`}>
        <div className="top">
          <span className="brand">MI SEMANA</span>
          <span className="topr">
            <span className="sync">{status}</span>
            <Link href="/perfil" className="avatar" aria-label="Tu perfil y reglas" aria-current={path === "/perfil" ? "page" : undefined}>
              {(email ?? "D")[0].toUpperCase()}
            </Link>
          </span>
        </div>
        {mode === "cloud" && offline && (
          <div className="banner offline" role="status">
            <span>
              Sin conexión o tu sesión caducó.{" "}
              {pendientes ? `Tienes ${pendientes} ${pendientes === 1 ? "cambio guardado" : "cambios guardados"} en este teléfono` : "Lo que hagas se guarda en este teléfono"} y se subirá solo al volver.
            </span>
            <button className="btn sm" onClick={retry}>Reintentar</button>
          </div>
        )}
        {error && !offline && <div className="banner" role="alert">{error}</div>}
        {mode === "loading" ? <div className="empty">Cargando…</div> : children}
      </div>
      {mode !== "loading" && <QuickTask enPagina={path === "/tareas"} />}
      {focus && <FocusBar key={focus.id + focus.created} task={focus} onClose={() => setFocus(null)} />}
      <nav className="tabs" aria-label="Secciones">
        <div className="side-brand">
          <img className="brandmark logo" src="/icon.svg" alt="" aria-hidden="true" />
          <span>
            Mi Semana<small>David · Berlín</small>
          </span>
        </div>
        {NAV.map((n) => (
          <div key={n.href} className={`navitem${n.href === "/hoy" ? " hoy" : ""}`}>
            {n.href === "/cerebro" ? (
              <a href="/cerebro#notas" aria-current={path === n.href ? "page" : undefined} className={path === n.href ? "in" : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{n.icon}</svg>
                {n.label}
              </a>
            ) : (
              <Link href={n.href} aria-current={path === n.href ? "page" : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{n.icon}</svg>
                {n.label}
              </Link>
            )}
            {n.href === "/cerebro" && tops.filter((c) => !c.privada).length > 0 && (
              <div className="subnav">
                {tops.filter((c) => !c.privada).map((c) => (
                  <a key={c.id} href={`/cerebro#${c.id}`} aria-current={path === "/cerebro" && topOfHash === c.id ? "page" : undefined}>{c.name}</a>
                ))}
              </div>
            )}
          </div>
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
  useEffect(() => {
    if ("serviceWorker" in navigator && location.hostname !== "localhost") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <DataProvider>
      <Frame>{children}</Frame>
    </DataProvider>
  );
}
