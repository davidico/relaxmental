import type { Area } from "./types";
import { pd, toMin } from "./dates";

/**
 * El horario de cada persona, sin nada escrito a mano en la app:
 * - plantilla: su semana tipo (lunes a domingo), armada por la IA con sus reglas.
 * - eventos: compromisos con fecha (iglesia, turnos, citas…), subidos con foto o a mano.
 * - dias: días que ajustó a mano o que la IA armó para una fecha concreta (mandan sobre lo demás).
 */
export interface Bloque {
  s: string; // inicio "HH:MM"
  e: string; // fin "HH:MM"
  t: string; // título
  a: Area;
  sub?: string;
  /** Viene de un compromiso con fecha */
  evento?: boolean;
  /** Antiguo: bloque de culto */
  church?: boolean;
  /** Viene de una tarea con hora (id de la tarea) */
  tarea?: string;
}

export interface Evento {
  t: string;
  s?: string; // "HH:MM" (opcional: sin hora es un aviso del día)
  e?: string;
  nota?: string;
}
/** Fecha (AAAA-MM-DD) -> compromisos de ese día */
export type Eventos = Record<string, Evento[]>;
/** Día de la semana ("0" domingo … "6" sábado) -> bloques */
export type Plantilla = Record<string, Bloque[]>;

const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
export const conHora = (e: Evento) => !!e.s && !!e.e && hm.test(e.s) && hm.test(e.e) && toMin(e.e) > toMin(e.s);
export const areaDeEvento = (t: string): Area => (/culto|iglesia|p[uú]lpito|predic|misa|oraci/i.test(t) ? "iglesia" : /turno|trabajo|oficina|clase|curso/i.test(t) ? "trabajo" : "casa");

/** Pone los compromisos con hora dentro del día y recorta lo que se cruza */
export function mezclar(base: Bloque[], evs: Evento[]): Bloque[] {
  return encajar(base, evs.filter(conHora).map((e) => ({ s: e.s!, e: e.e!, t: e.t, a: areaDeEvento(e.t), ...(e.nota ? { sub: e.nota } : {}), evento: true })));
}

/** Mete bloques fijos en el día y recorta lo que se cruza con ellos */
export function encajar(base: Bloque[], fijos: Bloque[]): Bloque[] {
  if (!fijos.length) return base;
  const out: Bloque[] = [];
  for (const b of base) {
    let partes: Bloque[] = [b];
    for (const f of fijos) {
      const fs = toMin(f.s),
        fe = toMin(f.e);
      partes = partes.flatMap((p) => {
        const ps = toMin(p.s),
          pe = toMin(p.e);
        if (pe <= fs || ps >= fe) return [p];
        const r: Bloque[] = [];
        if (ps < fs && fs - ps >= 15) r.push({ ...p, e: f.s });
        if (pe > fe && pe - fe >= 15) r.push({ ...p, s: f.e });
        return r;
      });
    }
    out.push(...partes);
  }
  return [...out, ...fijos].sort((x, y) => toMin(x.s) - toMin(y.s));
}

type TareaConHora = { id: string; title: string; step?: string; due: string; hora?: string; done: boolean; lado?: string; meta?: boolean; fin?: string };
const hhmm = (m: number) => `${String(Math.floor(Math.min(m, 1439) / 60)).padStart(2, "0")}:${String(Math.min(m, 1439) % 60).padStart(2, "0")}`;

/** Las tareas de esa fecha que tienen hora, como bloques de 30 minutos */
export function bloquesDeTareas(fecha: string, tareas: TareaConHora[] = []): Bloque[] {
  return tareas
    .filter((t) => !t.done && t.due === fecha && t.hora && hm.test(t.hora))
    .map((t) => {
      const meta = t.meta ?? !!t.lado;
      const e = t.fin && hm.test(t.fin) && toMin(t.fin) > toMin(t.hora!) ? t.fin : hhmm(toMin(t.hora!) + 30);
      const tipo = meta ? "Meta" : "Tarea";
      return { s: t.hora!, e, t: t.title, a: (t.lado === "trabajo" ? "trabajo" : "casa") as Area, sub: t.step ? `${tipo} · ${t.step}` : tipo, tarea: t.id };
    });
}

/**
 * El horario de una fecha: lo ajustado a mano, o la semana tipo con los compromisos de ese día.
 * Encima van las tareas de ese día que tienen hora.
 */
export function planDe(fecha: string, o: { dias?: Record<string, Bloque[]>; plantilla?: Plantilla; eventos?: Eventos; tareas?: TareaConHora[] }): Bloque[] {
  const d = o.dias?.[fecha];
  const base = d ? d.filter((b) => !b.tarea) : mezclar(o.plantilla?.[String(pd(fecha).getDay())] ?? [], o.eventos?.[fecha] ?? []);
  return encajar(base, bloquesDeTareas(fecha, o.tareas));
}

/** Texto corto de los compromisos de un día: «Culto · Púlpito 18:30» */
export const textoEventos = (evs: Evento[]) => evs.map((e) => `${e.t}${e.s ? ` ${e.s}` : ""}`).join(" · ");

/** Bloque actual y siguiente para un minuto del día */
export function nowInfo(s: Bloque[], minute: number) {
  const cur = s.find((b) => minute >= toMin(b.s) && minute < toMin(b.e));
  const nxt = s.find((b) => toMin(b.s) > minute);
  return { s, cur, nxt };
}
