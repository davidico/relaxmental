"use client";

import { useEffect, useState } from "react";

/** Minuto actual del día; se actualiza cada 30 s */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** true en pantallas de escritorio (≥ 900 px) */
export function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = matchMedia("(min-width:900px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Ctrl/Cmd + Enter envía el formulario */
export const submitOnCtrlEnter = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    (e.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
  }
};
