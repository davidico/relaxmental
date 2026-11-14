"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PANTALLAS } from "./PerfilPantalla";

/**
 * El menú de tu cuenta: tu inicial y tres puntitos arriba a la derecha.
 * Al tocarlo se abre una lista; cada cosa lleva a su propia pantalla.
 */
export default function MenuCuenta({ email, cloud, path }: { email: string | null | undefined; cloud: boolean; path: string }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const inicial = (email ?? "D")[0].toUpperCase();
  const enCuenta = path.startsWith("/perfil");

  /* Se cierra al cambiar de pantalla y con Escape (el foco vuelve al botón) */
  useEffect(() => setAbierto(false), [path]);
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [abierto]);

  return (
    <div className="mc">
      <button ref={boton} className={`mc-btn${enCuenta ? " en" : ""}`} aria-expanded={abierto} aria-controls="mc-menu" aria-label="Tu cuenta" onClick={() => setAbierto(!abierto)}>
        <span className="avatar" aria-hidden="true">{inicial}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
      </button>
      {abierto && (
        <>
          <div className="mc-velo" onClick={() => setAbierto(false)} aria-hidden="true" />
          <nav id="mc-menu" className="mc-menu" aria-label="Tu cuenta">
            <div className="mc-quien">
              <span className="avatar lg" aria-hidden="true">{inicial}</span>
              <div className="mc-datos">
                <strong>{email ?? "Sin sesión"}</strong>
                <span>{cloud ? "Tus datos se guardan en la nube" : "Se guardan solo en este navegador"}</span>
              </div>
            </div>
            <ul>
              {PANTALLAS.map((p) => (
                <li key={p.ver}>
                  <Link href={p.href} aria-current={path === p.href ? "page" : undefined} onClick={() => setAbierto(false)}>
                    {p.titulo}
                  </Link>
                </li>
              ))}
              {cloud && (
                <li className="mc-salir">
                  <a href="/cdn-cgi/access/logout">Cerrar sesión</a>
                </li>
              )}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
