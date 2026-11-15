/** Los recordatorios del día que se pueden encender, apagar y cambiar de hora (Perfil › Avisos). Lo usan la app y el Worker. */
export type Recordatorio = { on: boolean; hora: string };
export type Avisos = { habitos: Recordatorio; diario: Recordatorio; planificar: Recordatorio };

/** De fábrica: todos encendidos; los hábitos a las 20:00, el diario a las 21:30 y planificar la semana los domingos a las 21:00 */
export const AVISOS_DEF: Avisos = { habitos: { on: true, hora: "20:00" }, diario: { on: true, hora: "21:30" }, planificar: { on: true, hora: "21:00" } };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const uno = (x: unknown, def: Recordatorio): Recordatorio => {
  const o = (x && typeof x === "object" ? x : {}) as { on?: unknown; hora?: unknown };
  return { on: typeof o.on === "boolean" ? o.on : def.on, hora: typeof o.hora === "string" && HORA.test(o.hora) ? o.hora : def.hora };
};
/** Lee lo guardado en `perfil/avisos` (o nada) y completa con lo de fábrica */
export function leerAvisos(x: unknown): Avisos {
  const o = (x && typeof x === "object" ? x : {}) as { habitos?: unknown; diario?: unknown; planificar?: unknown };
  return { habitos: uno(o.habitos, AVISOS_DEF.habitos), diario: uno(o.diario, AVISOS_DEF.diario), planificar: uno(o.planificar, AVISOS_DEF.planificar) };
}

/**
 * La semana que toca planificar: el domingo, la que empieza mañana; el lunes, la que empieza hoy (si quedó pendiente).
 * Devuelve la fecha de su lunes, o "" los demás días. `dow` es el día de la semana de `hoy` (domingo = 0).
 */
export function semanaPorPlanificar(hoy: string, dow: number): string {
  if (dow === 1) return hoy;
  if (dow !== 0) return "";
  return new Date(new Date(hoy + "T12:00:00Z").getTime() + 864e5).toISOString().slice(0, 10);
}
