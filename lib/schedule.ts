import type { Area, Labores } from "./types";
import { DOW, addD, pd, toMin } from "./dates";

export interface Bloque {
  s: string; // inicio "HH:MM"
  e: string; // fin "HH:MM"
  t: string; // título
  a: Area;
  sub?: string;
  church?: boolean;
}

/** Culto de cada día de la semana (0 = domingo) */
export const SVC: Record<number, [string, string]> = {
  1: ["Alabanza", "18:30"],
  2: ["Estudio bíblico", "18:30"],
  3: ["Alabanza", "18:30"],
  4: ["Enseñanza", "18:30"],
  5: ["Alabanza", "18:30"],
  6: ["Estudio bíblico", "18:00"],
  0: ["Enseñanza", "10:00"],
};

export const rolesOn = (lab: Labores, date: string) => lab[date] ?? [];
export const preachesOn = (lab: Labores, date: string) => rolesOn(lab, date).some((r) => /predic/i.test(r));

export function nextPreach(lab: Labores, date: string) {
  for (let i = 1; i <= 3; i++) {
    const d = addD(date, i);
    if (preachesOn(lab, d)) return { d, i };
  }
  return null;
}

/**
 * Días de ejercicio de David (por la tarde):
 * - Martes, siempre (salvo si predica ese día).
 * - Además miércoles o viernes: el que no tenga iglesia; si los dos están libres, el miércoles.
 * Los demás días hace ejercicio Gaby, así que no se pone.
 */
export function exerciseOn(lab: Labores, date: string) {
  const dow = pd(date).getDay();
  if (preachesOn(lab, date)) return false;
  if (dow === 2) return true;
  const wed = dow === 3 ? date : dow === 5 ? addD(date, -2) : null;
  if (!wed) return false;
  const wedFree = rolesOn(lab, wed).length === 0;
  if (dow === 3) return wedFree;
  return !wedFree && rolesOn(lab, date).length === 0;
}

/**
 * El horario de un día, armado con reglas a partir de las labores:
 * - 9:00 Biblia todos los días (el domingo con culto, a las 8:30 para llegar a las 10:00).
 * - Mañanas (mejor energía): buscar trabajo (lun/mié/vie) o Tukuna.
 * - Si predica ese día: repaso por la mañana y descanso por la tarde.
 * - Los 3 días antes de predicar: bloque de estudio de la predicación.
 * - Alemán de 15:30 a 16:00.
 * - Ejercicio solo los días de exerciseOn(); los demás, tiempo con el bebé.
 */
export function scheduleFor(lab: Labores, date: string): Bloque[] {
  const dow = pd(date).getDay();
  const r = rolesOn(lab, date);
  const church = r.length > 0;
  const P = preachesOn(lab, date);
  const np = nextPreach(lab, date);
  const ex = exerciseOn(lab, date);
  const [svc] = SVC[dow];
  const B = (s: string, e: string, t: string, a: Area, sub?: string, x: Partial<Bloque> = {}): Bloque => ({ s, e, t, a, sub, ...x });
  const npTxt = np ? `Predicas el ${DOW[pd(np.d).getDay()].toLowerCase()} ${pd(np.d).getDate()}` : "";
  const culto = (s: string, e: string) => B(s, e, `Culto · ${svc}`, "iglesia", r.join(" · "), { church: true });
  const biblia = (s = "09:00", e = "09:30") => B(s, e, "Leer la Biblia", "iglesia", "Lectura y oración");
  const aleman = B("15:30", "16:00", "Alemán", "aleman", "Media hora");

  const a: Bloque[] = [B("07:00", "07:15", "Levantarse · pastillas", "salud", "Tómalas antes de desayunar"), B("07:15", "08:00", "Desayuno", "rutina")];

  if (dow >= 1 && dow <= 5) {
    if (P) a.push(B("08:00", "09:00", "Repasar la predicación", "iglesia", "Hoy predicas: repaso tranquilo"));
    else if ([1, 3, 5].includes(dow)) a.push(B("08:00", "09:00", "Buscar trabajo", "trabajo", "Lo aburrido primero. En alemán si puedes"));
    else a.push(B("08:00", "09:00", "Tukuna", "tukuna", "Bloque de mañana"));
    a.push(biblia(), B("09:30", "12:30", "Tukuna", "tukuna", "Trabajo profundo"), B("12:30", "13:30", "Comida", "rutina"));
    a.push(
      np && !P
        ? B("13:30", "14:30", "Estudiar la predicación", "iglesia", npTxt)
        : B("13:30", "14:30", "Tareas de la semana", "casa", "Papeleo de casa o tu tarea pendiente"),
    );
    a.push(B("14:30", "15:30", "Tiempo con tu bebé", "familia", "Sin móvil"), aleman);
    const finTarde = church ? "17:30" : "18:00";
    if (ex) a.push(B("16:00", "17:00", "Ejercicio", "salud", dow === 2 ? "Martes: día fijo" : "Hoy no tienes iglesia"), B("17:00", finTarde, "Tiempo con tu bebé", "familia"));
    else if (P) a.push(B("16:00", "17:30", "Descanso", "salud", "Hoy predicas"));
    else a.push(B("16:00", finTarde, "Tiempo con tu bebé", "familia", "Gaby hace su ejercicio"));
    if (church) a.push(B("17:30", "18:00", "Cena rápida y salir", "rutina"), culto("18:30", "20:30"));
    else
      a.push(
        dow === 2 ? B("18:00", "19:00", "Cocinar en cantidad", "casa", "Para miércoles a viernes") : B("18:00", "19:00", "Cena en familia", "familia"),
        B("19:00", "21:00", "Noche libre", "familia", "Descanso"),
      );
  } else if (dow === 6) {
    a.push(
      B("08:00", "09:00", "Mañana tranquila", "familia", "Juego con tu bebé"),
      biblia(),
      B("09:30", "12:30", "Mañana en familia", "familia", "Paseo o juego con tu bebé"),
      B("12:30", "13:30", "Comida", "rutina"),
      B("13:30", "15:30", "Cocinar en cantidad", "casa", "Para domingo a martes"),
      aleman,
    );
    if (np) a.push(B("16:00", "17:00", "Estudiar la predicación", "iglesia", npTxt));
    if (church) a.push(B("17:15", "17:45", "Prepararse y salir", "rutina"), culto("18:00", "20:00"));
    else a.push(B("18:00", "21:00", "Noche libre", "familia"));
  } else {
    if (church) a.push(biblia("08:30", "09:00"), B("09:15", "09:45", "Salir a la iglesia", "rutina"), culto("10:00", "12:00"));
    else a.push(biblia(), B("09:30", "12:00", "Mañana en familia", "familia"));
    a.push(B("12:30", "13:30", "Comida", "rutina"), B("14:00", "17:00", "Tarde en familia", "familia"));
    if (np) a.push(B("17:00", "18:00", "Estudiar la predicación", "iglesia", npTxt));
    a.push(B("19:00", "19:30", "Revisión semanal", "casa", "Elige tus tareas de la semana"));
  }
  return a.sort((x, y) => toMin(x.s) - toMin(y.s));
}

/** Bloque actual y siguiente para un minuto del día */
export function nowInfo(s: Bloque[], minute: number) {
  const cur = s.find((b) => minute >= toMin(b.s) && minute < toMin(b.e));
  const nxt = s.find((b) => toMin(b.s) > minute);
  return { s, cur, nxt };
}
