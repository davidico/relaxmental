"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Carpeta, Habito, Kind, Labores, Nota, Tarea } from "./types";
import { scheduleFor, type Bloque } from "./schedule";
import laboresBase from "@/data/labores.json";
import { today } from "./dates";

/**
 * Capa de datos.
 * - "cloud": la API del Worker (/api) guarda en Cloudflare D1. Se usa cuando has
 *   iniciado sesión con Cloudflare Access.
 * - "local": si la API no responde (Access aún no está activado, o estás en
 *   `npm run dev`), todo se guarda en este navegador.
 */
type Mode = "loading" | "local" | "cloud";
type Table = "tareas" | "notas" | "habitos" | "carpetas";
type Row = { tareas: Tarea; notas: Nota; habitos: Habito; carpetas: Carpeta };
type Dias = Record<string, Bloque[]>;

interface DataCtx {
  mode: Mode;
  email: string | null;
  error: string | null;
  /** Sin conexión (o sesión caducada): los cambios esperan en este teléfono */
  offline: boolean;
  /** Cambios que aún no llegaron a la nube */
  pendientes: number;
  /** Vuelve a intentar subir y traer los datos */
  retry: () => void;
  /** Fecha de hoy; cambia sola a medianoche aunque la app siga abierta */
  hoy: string;
  labores: Labores;
  tareas: Tarea[];
  notas: Nota[];
  habitos: Habito[];
  /** Carpetas del segundo cerebro (principales y subcarpetas) */
  carpetas: Carpeta[];
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

/* Secciones de inicio del segundo cerebro: Notas a la vista; Espiritual privada con Sueños y Profecías */
const DEFAULT_FOLDERS: Array<Omit<Carpeta, "created">> = [
  { id: "notas", name: "Notas", parent: null, area: "trabajo", orden: 0, v: 2 },
  { id: "espiritual", name: "Espiritual", parent: null, area: "iglesia", orden: 1, privada: true },
  { id: "suenos", name: "Sueños", parent: "espiritual", area: "iglesia", orden: 0 },
  { id: "profecias", name: "Profecías", parent: "espiritual", area: "iglesia", orden: 1 },
];
const seedFolders = (): Carpeta[] => DEFAULT_FOLDERS.map((f) => ({ ...f, created: new Date().toISOString() }));

/**
 * Reorganización en secciones (una sola vez): Notas queda como sección visible,
 * Sueños y Profecías pasan a la sección privada «Espiritual», y las demás carpetas
 * principales pasan a ser carpetas dentro de Notas. No se borra ninguna nota.
 */
function migrateSections(carpetas: Carpeta[], notas: Nota[]): { save: Carpeta[]; remove: string[] } {
  const now = new Date().toISOString();
  const byId = Object.fromEntries(carpetas.map((c) => [c.id, c]));
  if (byId.notas?.v === 2 || carpetas.some((c) => c.privada)) return { save: [], remove: [] };
  const out: Record<string, Carpeta> = {};
  const put = (c: Carpeta) => (out[c.id] = c);
  const notasSec: Carpeta = { ...(byId.notas ?? { id: "notas", name: "Notas", area: "trabajo", created: now }), parent: null, orden: 0, v: 2 } as Carpeta;
  put(notasSec);
  if (!byId.espiritual) put({ id: "espiritual", name: "Espiritual", parent: null, area: "iglesia", orden: 1, privada: true, created: now });
  const espirituales = new Set(["suenos", "profecias"]);
  let i = 0;
  for (const c of carpetas) {
    if (c.id === "notas" || c.id === "espiritual") continue;
    if (espirituales.has(c.id)) put({ ...c, parent: "espiritual", orden: c.id === "suenos" ? 0 : 1 });
    else if (!c.parent) put({ ...c, parent: "notas", orden: 10 + i++ });
  }
  /* Subcarpetas vacías con el mismo nombre que otra de Notas: sobran */
  const final = carpetas.map((c) => out[c.id] ?? c);
  const used = new Set(notas.map((n) => n.folder));
  const remove: string[] = [];
  const seen = new Set<string>();
  for (const c of final.filter((x) => x.parent === "notas").sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)))) {
    const k = c.name.trim().toLowerCase();
    if (seen.has(k) && !used.has(c.id) && !final.some((x) => x.parent === c.id)) remove.push(c.id);
    seen.add(k);
  }
  return { save: Object.values(out), remove };
}
/** Dónde va una nota antigua según su tipo */
export const FOLDER_OF_KIND: Record<Kind, string> = { profecia: "profecias", idea: "notas", predicacion: "notas", nota: "notas" };

interface Snapshot { tareas: Tarea[]; notas: Nota[]; habitos: Habito[]; carpetas: Carpeta[]; dias: Dias }

function readLocal(): Partial<Snapshot> {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}

/** Error pasajero (sin red, sesión caducada, servidor caído): se reintenta más tarde */
class Pasajero extends Error {}

async function call(path: string, init?: RequestInit) {
  let r: Response;
  try {
    r = await fetch(path, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    // Sin internet, o Access redirige al login porque la sesión caducó
    throw new Pasajero("Sin conexión");
  }
  if (r.status === 401 || r.status === 429 || r.status >= 500) throw new Pasajero(`Error ${r.status}`);
  if (!r.ok) throw new Error(`Error ${r.status}`);
  if (!(r.headers.get("content-type") ?? "").includes("json")) throw new Pasajero("Sesión caducada");
  return r.json();
}

type Op = { path: string; method: "PUT" | "DELETE"; body?: string };
/** Cambios por subir y última copia de la nube (para abrir la app sin internet) */
const OUTBOX = "mi-semana-pendientes";
const CACHE = "mi-semana-nube";
const readJSON = <T,>(k: string, fb: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
};
const writeJSON = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
/** El modo "solo este navegador" es para probar en el ordenador, nunca en la app publicada */
const isDev = () => ["localhost", "127.0.0.1"].includes(location.hostname);

export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [hoy, setHoy] = useState(today);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [habitos, setHabitos] = useState<Habito[]>([]);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [dias, setDias] = useState<Dias>({});
  const modeRef = useRef<Mode>("loading");
  const emailRef = useRef<string | null>(null);
  const outbox = useRef<Op[]>([]);
  const flushing = useRef(false);
  /** Sube con cada cambio local: si cambia mientras llegan datos, no se pisan */
  const rev = useRef(0);

  const setters = useMemo(() => ({ tareas: setTareas, notas: setNotas, habitos: setHabitos, carpetas: setCarpetas }) as const, []);
  const fail = useCallback((what: string) => (e: unknown) => setError(`${what}: ${e instanceof Error ? e.message : e}`), []);

  const apply = useCallback((d: Partial<Snapshot>) => {
    setTareas(d.tareas ?? []);
    setNotas(d.notas ?? []);
    setHabitos(d.habitos ?? []);
    setCarpetas(d.carpetas ?? []);
    setDias(d.dias ?? {});
  }, []);

  const setBox = useCallback((ops: Op[]) => {
    outbox.current = ops;
    writeJSON(OUTBOX, ops);
    setPendientes(ops.length);
  }, []);

  /** Sube los cambios en orden, uno a uno. Devuelve false si no hay conexión. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current) return false;
    flushing.current = true;
    try {
      while (outbox.current.length) {
        const op = outbox.current[0];
        try {
          await call(op.path, { method: op.method, body: op.body });
        } catch (e) {
          if (e instanceof Pasajero) {
            setOffline(true);
            return false;
          }
          fail("No se guardó un cambio")(e); // el servidor lo rechazó: no tiene sentido reintentarlo
        }
        setBox(outbox.current.slice(1));
      }
      return true;
    } finally {
      flushing.current = false;
    }
  }, [fail, setBox]);

  const enqueue = useCallback(
    (op: Op) => {
      rev.current++;
      // El primero puede estar subiéndose; los demás cambios del mismo elemento se sustituyen por el nuevo
      const keep = flushing.current ? 1 : 0;
      setBox([...outbox.current.slice(0, keep), ...outbox.current.slice(keep).filter((o) => o.path !== op.path), op]);
      void flush();
    },
    [flush, setBox],
  );

  /** Trae los datos de la nube (sin pisar cambios que aún no subieron) */
  const load = useCallback(async (): Promise<boolean> => {
    const before = rev.current;
    try {
      if (!emailRef.current) {
        const me = (await call("/api/me")) as { email: string };
        emailRef.current = me.email;
        setEmail(me.email);
      }
      let data = (await call("/api/data")) as Snapshot;
      const empty = !data.tareas.length && !data.notas.length && !data.habitos.length && !data.carpetas?.length && !Object.keys(data.dias).length;
      if (empty) {
        // Primera vez: subir lo que tenías en este navegador (o los hábitos de inicio)
        const local = readLocal();
        const items = [
          ...(local.tareas ?? []).map((x) => ({ tabla: "tareas", id: x.id, data: x })),
          ...(local.notas ?? []).map((x) => ({ tabla: "notas", id: x.id, data: x })),
          ...(local.habitos?.length ? local.habitos : seedHabits()).map((x) => ({ tabla: "habitos", id: x.id, data: x })),
          ...(local.carpetas ?? []).map((x) => ({ tabla: "carpetas", id: x.id, data: x })),
          ...Object.entries(local.dias ?? {}).map(([id, b]) => ({ tabla: "dias", id, data: b })),
        ];
        await call("/api/import", { method: "POST", body: JSON.stringify({ items }) });
        data = (await call("/api/data")) as Snapshot;
      }
      setOffline(false);
      if (rev.current !== before || outbox.current.length) return false; // cambiaste algo mientras tanto: la próxima vez
      apply(data);
      setLoaded(true);
      setError(null);
      return true;
    } catch (e) {
      if (e instanceof Pasajero) setOffline(true);
      else fail("No se pudieron cargar tus datos")(e);
      return false;
    }
  }, [apply, fail]);

  /** Primero subir lo pendiente, luego traer lo último */
  const lastSync = useRef(0);
  const sync = useCallback(async () => {
    lastSync.current = Date.now();
    if (await flush()) return load();
    return false;
  }, [flush, load]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    (async () => {
      setBox(readJSON<Op[]>(OUTBOX, []));
      let me: { email: string } | null = null;
      try {
        const r = await fetch("/api/me", { credentials: "same-origin" });
        if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) me = await r.json();
      } catch {}

      if (!me && isDev()) {
        /* Modo navegador (solo para probar en el ordenador) */
        const local = readLocal();
        setTareas(local.tareas ?? []);
        setNotas(local.notas ?? []);
        setHabitos(local.habitos ?? seedHabits());
        setCarpetas(local.carpetas ?? []);
        setDias(local.dias ?? {});
        setLoaded(true);
        setMode("local");
        return;
      }

      /* Modo nube. Sin conexión: se abre con la última copia y los cambios esperan aquí */
      const cache = readJSON<{ email?: string; data?: Snapshot } | null>(CACHE, null);
      if (me) {
        emailRef.current = me.email;
        setEmail(me.email);
        if (!(await sync()) && cache?.data) apply(cache.data);
      } else {
        setOffline(true);
        if (cache?.data) apply(cache.data);
        if (cache?.email) setEmail(cache.email);
      }
      setMode("cloud");
    })();
  }, [apply, setBox, sync]);

  /* Al volver a la app, al recuperar internet y cada 20 s sin conexión: sincronizar. Y cambiar de día a medianoche. */
  useEffect(() => {
    const again = (force = false) => {
      setHoy(today());
      if (modeRef.current === "cloud" && document.visibilityState === "visible" && (force || Date.now() - lastSync.current > 5000)) void sync();
    };
    const online = () => again(true);
    const vis = () => document.visibilityState === "visible" && again();
    addEventListener("online", online);
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(() => {
      setHoy(today());
      if (offline || outbox.current.length) again();
    }, 20_000);
    return () => {
      removeEventListener("online", online);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(t);
    };
  }, [sync, offline]);

  /* Guardar en este teléfono: en modo navegador, todo; en modo nube, una copia para abrir sin internet */
  useEffect(() => {
    if (mode === "local") writeJSON(LS, { tareas, notas, habitos, carpetas, dias });
    else if (mode === "cloud" && (loaded || outbox.current.length)) writeJSON(CACHE, { email, data: { tareas, notas, habitos, carpetas, dias } });
  }, [mode, loaded, email, tareas, notas, habitos, carpetas, dias]);

  const save = useCallback(
    <T extends Table>(table: T, item: Row[T]) => {
      const set = setters[table] as unknown as (fn: (a: Row[T][]) => Row[T][]) => void;
      set((a) => (a.some((x) => x.id === item.id) ? a.map((x) => (x.id === item.id ? item : x)) : [...a, item]));
      if (modeRef.current === "cloud") enqueue({ path: `/api/${table}/${encodeURIComponent(item.id)}`, method: "PUT", body: JSON.stringify(item) });
    },
    [setters, enqueue],
  );

  const remove = useCallback(
    (table: Table, id: string) => {
      const set = setters[table] as unknown as (fn: (a: { id: string }[]) => { id: string }[]) => void;
      set((a) => a.filter((x) => x.id !== id));
      if (modeRef.current === "cloud") enqueue({ path: `/api/${table}/${encodeURIComponent(id)}`, method: "DELETE" });
    },
    [setters, enqueue],
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
        enqueue(bloques ? { path: `/api/dias/${fecha}`, method: "PUT", body: JSON.stringify(bloques) } : { path: `/api/dias/${fecha}`, method: "DELETE" });
    },
    [enqueue],
  );

  /* La primera vez: crear las carpetas de inicio y mover las notas antiguas a su carpeta.
     Solo con los datos de verdad cargados: si la carga falló, no se toca nada. */
  const seeded = useRef(false);
  useEffect(() => {
    if (mode === "loading" || !loaded || seeded.current) return;
    seeded.current = true;
    if (!carpetas.length) seedFolders().forEach((f) => save("carpetas", f));
    else {
      const m = migrateSections(carpetas, notas);
      m.save.forEach((c) => save("carpetas", c));
      m.remove.forEach((id) => remove("carpetas", id));
    }
    for (const n of notas) if (!n.folder) save("notas", { ...n, folder: FOLDER_OF_KIND[n.kind] ?? "general" });
  }, [mode, loaded, carpetas, notas, save, remove]);

  const planFor = useCallback((date: string) => dias[date] ?? scheduleFor(LABORES, date), [dias]);
  const retry = useCallback(() => {
    void sync().then((ok) => {
      if (!ok && navigator.onLine) location.reload(); // con internet pero sin sesión: recargar lleva al login
    });
  }, [sync]);

  const value: DataCtx = { mode, email, error, offline, pendientes, retry, hoy, labores: LABORES, tareas, notas, habitos, carpetas, dias, planFor, saveDia, save, remove };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData debe usarse dentro de <DataProvider>");
  return c;
}
