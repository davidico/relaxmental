"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Habito, Labores, Nota, Tarea } from "./types";
import { scheduleFor, type Bloque } from "./schedule";
import laboresBase from "@/data/labores.json";

/**
 * Capa de datos.
 * - "cloud": la API del Worker (/api) guarda en Cloudflare D1. Se usa cuando has
 *   iniciado sesión con Cloudflare Access.
 * - "local": si la API no responde (Access aún no está activado, o estás en
 *   `npm run dev`), todo se guarda en este navegador.
 */
type Mode = "loading" | "local" | "cloud";
type Table = "tareas" | "notas" | "habitos";
type Row = { tareas: Tarea; notas: Nota; habitos: Habito };
type Dias = Record<string, Bloque[]>;

interface DataCtx {
  mode: Mode;
  email: string | null;
  error: string | null;
  labores: Labores;
  tareas: Tarea[];
  notas: Nota[];
  habitos: Habito[];
  /** Días que editaste a mano: fecha -> bloques */
  dias: Dias;
  /** Horario de un día: el que editaste, o el automático */
  planFor: (date: string) => Bloque[];
  /** Guarda tu versión de un día; null vuelve al horario automático */
  saveDia: (fecha: string, bloques: Bloque[] | null) => void;
  save: <T extends Table>(table: T, item: Row[T]) => void;
  remove: (table: Table, id: string) => void;
}

const Ctx = createContext<DataCtx | null>(null);
const LS = "mi-semana-v1";
const LABORES = (laboresBase as { dias: Labores }).dias;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const DEFAULT_HABITS: Array<Pick<Habito, "name" | "area">> = [
  { name: "Pastillas", area: "salud" },
  { name: "Escudriñar la Biblia", area: "iglesia" },
  { name: "Alemán", area: "aleman" },
  { name: "Ejercicio", area: "salud" },
  { name: "Tiempo con mi bebé", area: "familia" },
];
const seedHabits = (): Habito[] =>
  DEFAULT_HABITS.map((h, i) => ({ ...h, id: newId(), orden: i, hechos: {}, created: new Date().toISOString() }));

interface Snapshot { tareas: Tarea[]; notas: Nota[]; habitos: Habito[]; dias: Dias }

function readLocal(): Partial<Snapshot> {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}

async function call(path: string, init?: RequestInit) {
  const r = await fetch(path, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(r.status === 401 ? "Tu sesión caducó. Recarga la página para entrar de nuevo." : `Error ${r.status}`);
  return r.json();
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [habitos, setHabitos] = useState<Habito[]>([]);
  const [dias, setDias] = useState<Dias>({});
  const modeRef = useRef<Mode>("loading");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const setters = useMemo(() => ({ tareas: setTareas, notas: setNotas, habitos: setHabitos }) as const, []);
  const fail = useCallback((what: string) => (e: unknown) => setError(`${what}: ${e instanceof Error ? e.message : e}`), []);

  useEffect(() => {
    (async () => {
      let me: { email: string } | null = null;
      try {
        const r = await fetch("/api/me", { credentials: "same-origin" });
        if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) me = await r.json();
      } catch {}

      const local = readLocal();
      if (!me) {
        /* Modo navegador */
        setTareas(local.tareas ?? []);
        setNotas(local.notas ?? []);
        setHabitos(local.habitos ?? seedHabits());
        setDias(local.dias ?? {});
        setMode("local");
        return;
      }

      /* Modo nube */
      setEmail(me.email);
      try {
        let data = (await call("/api/data")) as Snapshot;
        const empty = !data.tareas.length && !data.notas.length && !data.habitos.length && !Object.keys(data.dias).length;
        if (empty) {
          // Primera vez: subir lo que tenías en este navegador (o los hábitos de inicio)
          const items = [
            ...(local.tareas ?? []).map((x) => ({ tabla: "tareas", id: x.id, data: x })),
            ...(local.notas ?? []).map((x) => ({ tabla: "notas", id: x.id, data: x })),
            ...(local.habitos?.length ? local.habitos : seedHabits()).map((x) => ({ tabla: "habitos", id: x.id, data: x })),
            ...Object.entries(local.dias ?? {}).map(([id, b]) => ({ tabla: "dias", id, data: b })),
          ];
          await call("/api/import", { method: "POST", body: JSON.stringify({ items }) });
          data = (await call("/api/data")) as Snapshot;
        }
        setTareas(data.tareas);
        setNotas(data.notas);
        setHabitos(data.habitos);
        setDias(data.dias);
      } catch (e) {
        fail("No se pudieron cargar tus datos")(e);
      }
      setMode("cloud");
    })();
  }, [fail]);

  /* En modo navegador, guardar cada cambio */
  useEffect(() => {
    if (mode !== "local") return;
    try {
      localStorage.setItem(LS, JSON.stringify({ tareas, notas, habitos, dias }));
    } catch {}
  }, [mode, tareas, notas, habitos, dias]);

  const save = useCallback(
    <T extends Table>(table: T, item: Row[T]) => {
      const set = setters[table] as unknown as (fn: (a: Row[T][]) => Row[T][]) => void;
      set((a) => (a.some((x) => x.id === item.id) ? a.map((x) => (x.id === item.id ? item : x)) : [...a, item]));
      if (modeRef.current === "cloud")
        call(`/api/${table}/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify(item) }).catch(fail("No se guardó el cambio"));
    },
    [setters, fail],
  );

  const remove = useCallback(
    (table: Table, id: string) => {
      const set = setters[table] as unknown as (fn: (a: { id: string }[]) => { id: string }[]) => void;
      set((a) => a.filter((x) => x.id !== id));
      if (modeRef.current === "cloud") call(`/api/${table}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(fail("No se borró"));
    },
    [setters, fail],
  );

  const saveDia = useCallback(
    (fecha: string, bloques: Bloque[] | null) => {
      setDias((all) => {
        const next = { ...all };
        if (bloques) next[fecha] = bloques;
        else delete next[fecha];
        return next;
      });
      if (modeRef.current === "cloud")
        call(`/api/dias/${fecha}`, bloques ? { method: "PUT", body: JSON.stringify(bloques) } : { method: "DELETE" }).catch(fail("No se guardó el día"));
    },
    [fail],
  );

  const planFor = useCallback((date: string) => dias[date] ?? scheduleFor(LABORES, date), [dias]);

  const value: DataCtx = { mode, email, error, labores: LABORES, tareas, notas, habitos, dias, planFor, saveDia, save, remove };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData debe usarse dentro de <DataProvider>");
  return c;
}
