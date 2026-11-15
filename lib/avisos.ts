/** Los recordatorios del día que se pueden encender, apagar y cambiar de hora (Perfil › Avisos). Lo usan la app y el Worker. */
export type Recordatorio = { on: boolean; hora: string };
export type Avisos = { habitos: Recordatorio; diario: Recordatorio };

/** De fábrica: los dos encendidos, los hábitos a las 20:00 y el diario a las 21:30 */
export const AVISOS_DEF: Avisos = { habitos: { on: true, hora: "20:00" }, diario: { on: true, hora: "21:30" } };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const uno = (x: unknown, def: Recordatorio): Recordatorio => {
  const o = (x && typeof x === "object" ? x : {}) as { on?: unknown; hora?: unknown };
  return { on: typeof o.on === "boolean" ? o.on : def.on, hora: typeof o.hora === "string" && HORA.test(o.hora) ? o.hora : def.hora };
};
/** Lee lo guardado en `perfil/avisos` (o nada) y completa con lo de fábrica */
export function leerAvisos(x: unknown): Avisos {
  const o = (x && typeof x === "object" ? x : {}) as { habitos?: unknown; diario?: unknown };
  return { habitos: uno(o.habitos, AVISOS_DEF.habitos), diario: uno(o.diario, AVISOS_DEF.diario) };
}
