"use client";

import { useEffect, useMemo } from "react";
import { useData } from "./data";
import type { Bloque } from "./plan";
import { TIPOS, llano, tipoPorNombre } from "./tipos";

const VACIO: Record<string, string> = {};
/** Nombres por los que ya se preguntó en esta sesión (si la IA falla, no se insiste hasta la próxima) */
const pedidos = new Set<string>();

/**
 * Lo que la IA dijo de las actividades que la app no reconoce por su nombre (nombre → tipo).
 * Si en el día que se ve o en la semana tipo hay nombres nuevos, se los pregunta una sola vez y lo guarda en `perfil/tipos`.
 * Las tareas y metas no se envían: solo los bloques del horario.
 */
export function useTipos(blocks: Bloque[]): Record<string, string> {
  const { mode, offline, perfil, savePerfil } = useData();
  const memo = (perfil.tipos as Record<string, string> | undefined) ?? VACIO;
  const faltan = useMemo(() => {
    const vistos = new Map<string, { t: string; sub?: string }>();
    for (const b of [...blocks, ...Object.values(perfil.plantilla ?? {}).flat()]) {
      if (b.tarea || tipoPorNombre(b.t)) continue;
      const k = llano(b.t);
      if (!k || k in memo || pedidos.has(k) || vistos.has(k)) continue;
      vistos.set(k, { t: b.t, ...(b.sub ? { sub: b.sub } : {}) });
    }
    return [...vistos.entries()].slice(0, 40);
  }, [blocks, perfil.plantilla, memo]);
  const clave = faltan.map(([k]) => k).join("|");

  useEffect(() => {
    if (mode !== "cloud" || offline || !faltan.length) return;
    const id = setTimeout(async () => {
      faltan.forEach(([k]) => pedidos.add(k));
      try {
        const r = await fetch("/api/ai/tipos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nombres: faltan.map(([, v]) => v) }) });
        if (!r.ok) return;
        const { tipos } = (await r.json()) as { tipos?: unknown };
        if (!Array.isArray(tipos)) return;
        const nuevo: Record<string, string> = { ...memo };
        faltan.forEach(([k], i) => {
          if (typeof tipos[i] === "string" && tipos[i] in TIPOS) nuevo[k] = tipos[i];
        });
        /* Como mucho 400 nombres: se quedan los más recientes */
        savePerfil("tipos", Object.fromEntries(Object.entries(nuevo).slice(-400)));
      } catch {
        /* sin conexión o la IA no respondió: los íconos siguen saliendo por las palabras */
      }
    }, 1200);
    return () => clearTimeout(id);
  }, [clave, mode, offline]); // eslint-disable-line react-hooks/exhaustive-deps
  return memo;
}
