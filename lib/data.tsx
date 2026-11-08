"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { Habito, Labores, Nota, Tarea } from "./types";
import laboresBase from "@/data/labores.json";

type Mode = "loading" | "local" | "cloud" | "login";
type Table = "tareas" | "notas" | "habitos";
type Row = { tareas: Tarea; notas: Nota; habitos: Habito };

interface DataCtx {
  mode: Mode;
  email: string | null;
  error: string | null;
  labores: Labores;
  tareas: Tarea[];
  notas: Nota[];
  habitos: Habito[];
  save: <T extends Table>(table: T, item: Row[T]) => void;
  remove: (table: Table, id: string) => void;
  signIn: (email: string) => Promise<string | null>;
  signOut: () => void;
}

const Ctx = createContext<DataCtx | null>(null);
const LS = "mi-semana-v1";
const BASE_LABORES = (laboresBase as { dias: Labores }).dias;

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

/* La base de datos guarda la fecha límite como date (o null); la app usa "" */
const toRow = (table: Table, x: Record<string, unknown>) => (table === "tareas" ? { ...x, due: x.due || null } : x);
const fromRow = (table: Table, r: Record<string, unknown>) => {
  const { user_id: _u, ...rest } = r;
  return (table === "tareas" ? { ...rest, due: rest.due ?? "" } : rest) as never;
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labores, setLabores] = useState<Labores>(BASE_LABORES);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [habitos, setHabitos] = useState<Habito[]>([]);

  const setters = useMemo(() => ({ tareas: setTareas, notas: setNotas, habitos: setHabitos }) as const, []);

  /* Modo local: todo en el navegador */
  const loadLocal = useCallback(() => {
    let st: Partial<Record<Table, unknown[]>> = {};
    try {
      st = JSON.parse(localStorage.getItem(LS) || "{}");
    } catch {}
    setTareas((st.tareas as Tarea[]) ?? []);
    setNotas((st.notas as Nota[]) ?? []);
    setHabitos((st.habitos as Habito[]) ?? seedHabits());
    setMode("local");
  }, []);

  /* Modo nube: Supabase, cada usuario solo ve sus filas (RLS) */
  const loadCloud = useCallback(async (userId: string) => {
    if (!supabase) return;
    const [t, n, h, l] = await Promise.all([
      supabase.from("tareas").select("*"),
      supabase.from("notas").select("*"),
      supabase.from("habitos").select("*"),
      supabase.from("labores").select("fecha, roles"),
    ]);
    const err = t.error || n.error || h.error || l.error;
    if (err) setError(`No se pudieron cargar tus datos: ${err.message}`);
    setTareas((t.data ?? []).map((r) => fromRow("tareas", r)));
    setNotas((n.data ?? []).map((r) => fromRow("notas", r)));
    let hab: Habito[] = (h.data ?? []).map((r) => fromRow("habitos", r));
    const flag = `mi-semana-seeded-${userId}`;
    if (!h.error && hab.length === 0 && !localStorage.getItem(flag)) {
      hab = seedHabits();
      await supabase.from("habitos").insert(hab);
      localStorage.setItem(flag, "1");
    }
    setHabitos(hab);
    if (l.data?.length) {
      const extra: Labores = {};
      for (const r of l.data as { fecha: string; roles: string[] }[]) extra[r.fecha] = r.roles;
      setLabores({ ...BASE_LABORES, ...extra });
    }
    setMode("cloud");
  }, []);

  useEffect(() => {
    if (!supabase) {
      loadLocal();
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) {
        setEmail(u.email ?? null);
        loadCloud(u.id);
      } else setMode("login");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        setEmail(session.user.email ?? null);
        loadCloud(session.user.id);
      } else {
        setEmail(null);
        setMode("login");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadCloud, loadLocal]);

  /* Guardar en el navegador cada vez que cambia algo (solo modo local) */
  useEffect(() => {
    if (mode !== "local") return;
    try {
      localStorage.setItem(LS, JSON.stringify({ tareas, notas, habitos }));
    } catch {}
  }, [mode, tareas, notas, habitos]);

  const save = useCallback(
    <T extends Table>(table: T, item: Row[T]) => {
      const set = setters[table] as unknown as (fn: (a: Row[T][]) => Row[T][]) => void;
      set((a) => {
        const i = a.findIndex((x) => x.id === item.id);
        return i < 0 ? [...a, item] : a.map((x) => (x.id === item.id ? item : x));
      });
      if (mode === "cloud" && supabase)
        supabase
          .from(table)
          .upsert(toRow(table, item as unknown as Record<string, unknown>))
          .then(({ error: e }) => e && setError(`No se guardó el cambio: ${e.message}`));
    },
    [mode, setters],
  );

  const remove = useCallback(
    (table: Table, id: string) => {
      const set = setters[table] as unknown as (fn: (a: { id: string }[]) => { id: string }[]) => void;
      set((a) => a.filter((x) => x.id !== id));
      if (mode === "cloud" && supabase)
        supabase
          .from(table)
          .delete()
          .eq("id", id)
          .then(({ error: e }) => e && setError(`No se borró: ${e.message}`));
    },
    [mode, setters],
  );

  const signIn = useCallback(async (mail: string) => {
    if (!supabase) return "Supabase no está configurado.";
    const { error: e } = await supabase.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: window.location.origin } });
    return e ? e.message : null;
  }, []);

  const signOut = useCallback(() => {
    supabase?.auth.signOut();
  }, []);

  const value: DataCtx = { mode, email, error, labores, tareas, notas, habitos, save, remove, signIn, signOut };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData debe usarse dentro de <DataProvider>");
  return c;
}
