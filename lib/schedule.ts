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
 * El horario de un día, armado con reglas a partir de las labores:
 * - Mañanas (mejor energía): Biblia, buscar trabajo (lun/mié/vie) y Tukuna.
 * - Si predica ese día: repaso por la mañana y sin ejercicio.
 * - Los 3 días antes de predicar: bloque de estudio de la predicación.
 * - Día con culto: ejercicio corto y salida a la iglesia. Sin culto: ejercicio completo y noche libre.
 */
export function scheduleFor(lab: Labores, date: string): Bloque[] {
  const dow = pd(date).getDay();
  const r = rolesOn(lab, date);
  const church = r.length > 0;
  const P = preachesOn(lab, date);
  const np = nextPreach(lab, date);
  const [svc] = SVC[dow];
  const B = (s: string, e: string, t: string, a: Area, sub?: string, x: Partial<Bloque> = {}): Bloque => ({ s, e, t, a, sub, ...x });
  const npTxt = np ? `Predicas el ${DOW[pd(np.d).getDay()].toLowerCase()} ${pd(np.d).getDate()}` : "";
  const culto = (s: string, e: string) => B(s, e, `Culto · ${svc}`, "iglesia", r.join(" · "), { church: true });

  const a: Bloque[] = [
    B("07:00", "07:15", "Levantarse · pastillas", "salud", "Tómalas antes de desayunar"),
    B("07:15", "08:00", "Desayuno", "rutina"),
    B("08:00", "08:30", "Escudriñar la Biblia", "iglesia", "Lectura y oración"),
  ];

  if (dow >= 1 && dow <= 5) {
    if (P) a.push(B("08:30", "10:00", "Repasar la predicación", "iglesia", "Hoy predicas: repaso tranquilo"));
    else if ([1, 3, 5].includes(dow)) a.push(B("08:30", "10:00", "Buscar trabajo", "trabajo", "Lo aburrido primero. En alemán si puedes"));
    else a.push(B("08:30", "10:00", "Tukuna", "tukuna", "Bloque de mañana"));
    a.push(B("10:00", "10:15", "Pausa", "rutina"), B("10:15", "12:30", "Tukuna", "tukuna", "Trabajo profundo"), B("12:30", "13:30", "Comida", "rutina"));
    a.push(
      np && !P
        ? B("13:30", "14:30", "Estudiar la predicación", "iglesia", npTxt)
        : B("13:30", "14:30", "Tareas de la semana", "casa", "Papeleo de casa o tu tarea pendiente"),
    );
    a.push(B("14:30", "15:00", "Alemán", "aleman", "20–30 min"), B("15:00", "17:00", "Tiempo con tu bebé", "familia", "Sin móvil"));
    if (church) {
      a.push(
        P ? B("17:00", "17:30", "Descanso", "salud", "Sin ejercicio hoy") : B("17:00", "17:30", "Ejercicio corto", "salud", "15–20 min"),
        B("17:30", "18:00", "Cena rápida y salir", "rutina"),
        culto("18:30", "20:30"),
      );
    } else {
      a.push(
        B("17:00", "18:00", "Ejercicio", "salud", "Sesión completa"),
        dow === 2 ? B("18:00", "19:00", "Cocinar en cantidad", "casa", "Para miércoles a viernes") : B("18:00", "19:00", "Cena en familia", "familia"),
        B("19:00", "21:00", "Noche libre", "familia", "Descanso"),
      );
    }
  } else if (dow === 6) {
    a.push(
      B("08:30", "12:00", "Mañana en familia", "familia", "Paseo o juego con tu bebé"),
      B("12:30", "13:30", "Comida", "rutina"),
      B("14:00", "16:00", "Cocinar en cantidad", "casa", "Para domingo a martes"),
      B("16:00", "16:30", "Alemán", "aleman", "20–30 min"),
    );
    if (np) a.push(B("16:30", "17:15", "Estudiar la predicación", "iglesia", npTxt));
    if (church) a.push(B("17:15", "17:45", "Prepararse y salir", "rutina"), culto("18:00", "20:00"));
    else a.push(B("18:00", "21:00", "Noche libre", "familia"));
  } else {
    if (church) a.push(B("09:15", "09:45", "Salir a la iglesia", "rutina"), culto("10:00", "12:00"));
    else a.push(B("08:30", "12:00", "Mañana en familia", "familia"));
    a.push(B("12:30", "13:30", "Comida", "rutina"), B("14:00", "17:00", "Tarde en familia", "familia"));
    if (np) a.push(B("17:00", "18:00", "Estudiar la predicación", "iglesia", npTxt));
    a.push(B("19:00", "19:30", "Revisión semanal", "casa", "Elige tus tareas de la semana"));
  }
  return a.sort((x, y) => toMin(x.s) - toMin(y.s));
}

/** Bloque actual y siguiente para un minuto del día */
export function nowInfo(lab: Labores, date: string, minute: number) {
  const s = scheduleFor(lab, date);
  const cur = s.find((b) => minute >= toMin(b.s) && minute < toMin(b.e));
  const nxt = s.find((b) => toMin(b.s) > minute);
  return { s, cur, nxt };
}
