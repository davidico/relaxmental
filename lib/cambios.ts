import { baseDe, type Bloque, type Eventos, type Plantilla } from "./plan";
import { claveDe } from "./momentos";
import { esMeta, type Tarea } from "./types";

/**
 * Los cambios que «Pregúntale a la IA» propone en las metas y tareas: moverlas de día, meterlas dentro de un momento del día,
 * darles una hora propia, pasarlas a Pendientes o crear una nueva. La IA solo los propone; la persona los ve debajo de la
 * respuesta y nada cambia hasta que toca «Aplicar». Lo usan el Worker (para leer y comprobar lo que dice la IA) y la app (para aplicarlos).
 */
export type Cambio = {
  /** La tarea que cambia; sin id, es una nueva */
  id?: string;
  titulo: string;
  /** AAAA-MM-DD, o "" para dejarla en Pendientes */
  due: string;
  /** Dentro de este momento del día («HH:MM|nombre») */
  momento?: string;
  /** Con hora propia */
  hora?: string;
  fin?: string;
  /** Solo en las nuevas */
  meta?: boolean;
  lado?: "trabajo";
  /** Cómo se le enseña a la persona */
  texto: string;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
const fechaOk = /^\d{4}-\d{2}-\d{2}$/;
export const masDias = (f: string, n: number) => new Date(new Date(f + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
const nombreDia = (f: string, hoy: string) => {
  if (f === hoy) return "hoy";
  if (f === masDias(hoy, 1)) return "mañana";
  const d = new Date(f + "T12:00:00Z");
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
};

/** Cómo se lee un cambio: «Licencia de Adobe → lunes 16, dentro de Trabajo (08:00)» */
export function describir(c: Omit<Cambio, "texto">, hoy: string): string {
  const donde = !c.due
    ? "a Pendientes, sin día"
    : `${nombreDia(c.due, hoy)}, ${c.momento ? `dentro de «${c.momento.slice(c.momento.indexOf("|") + 1)}» (${c.momento.slice(0, 5)})` : c.hora ? (c.fin ? `de ${c.hora} a ${c.fin}` : `a las ${c.hora}`) : "sin hora"}`;
  return `${c.id ? "" : "Nueva: "}«${c.titulo}» → ${donde}`;
}

/** Lo que hace falta del perfil para saber los momentos de cada día */
export type DatosDia = { dias: Record<string, Bloque[]>; plantilla: Plantilla; eventos: Eventos };
/** Los momentos de un día (sin las tareas con hora): son donde se pueden meter las subtareas */
export const momentosDe = (fecha: string, d: DatosDia) => baseDe(fecha, d).filter((b) => !b.tarea);

/** Los días en que la IA puede poner cosas: de hoy a dos semanas */
export const DIAS_ORGANIZAR = 14;

/**
 * Lo que la IA ve para organizar: los momentos de los próximos 8 días y las metas y tareas sin hacer, cada una con un código (T1, T2…),
 * que es como la nombra al proponer un cambio. Devuelve el texto y los códigos.
 */
export function paraOrganizar(tareas: Tarea[], d: DatosDia, hoy: string): { texto: string; codigos: Map<string, Tarea> } {
  const hasta = masDias(hoy, DIAS_ORGANIZAR - 1);
  const desde = masDias(hoy, -14);
  const xs = tareas
    .filter((t) => t && !t.done && t.title && (!t.due || (t.due >= desde && t.due <= hasta)))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.hora ?? a.momento ?? "").localeCompare(b.hora ?? b.momento ?? ""))
    .slice(0, 90);
  const codigos = new Map<string, Tarea>();
  const lineas = xs.map((t, i) => {
    const k = `T${i + 1}`;
    codigos.set(k, t);
    const clase = `${esMeta(t) ? "meta" : "tarea"}${t.lado === "trabajo" ? ", trabajo" : ""}`;
    const donde = !t.due
      ? "pendiente, sin día"
      : `${t.due < hoy ? "atrasada, era del " : ""}${nombreDia(t.due, hoy)} ${t.due}, ${t.momento ? `dentro de «${t.momento.slice(t.momento.indexOf("|") + 1)}»` : t.hora ? `${t.hora}${t.fin ? "-" + t.fin : ""}` : "sin hora"}`;
    return `[${k}] «${t.title.slice(0, 90)}» (${clase}) — ${donde}`;
  });
  const dias = Array.from({ length: 8 }, (_, i) => masDias(hoy, i)).map((f) => {
    const ms = momentosDe(f, d);
    return `${nombreDia(f, hoy)} ${f}: ${ms.length ? ms.map((b) => `${b.s}-${b.e} ${b.t} [${claveDe(b)}]`).join(" · ") : "(sin momentos)"}`;
  });
  return {
    texto: `LOS MOMENTOS DE MIS PRÓXIMOS DÍAS (entre corchetes, la clave de cada momento):\n${dias.join("\n")}\n\nMIS METAS Y TAREAS SIN HACER (con su código):\n${lineas.join("\n") || "(ninguna)"}`,
    codigos,
  };
}

/**
 * Lee la lista de cambios que escribió la IA y se queda solo con los que tienen sentido: tareas que existen, fechas entre hoy y dentro de
 * dos semanas, momentos que existen ese día (por su clave o, si no, por el nombre) y horas bien escritas.
 */
export function leerCambios(raw: unknown, o: { codigos: Map<string, Tarea>; datos: DatosDia; hoy: string }): Cambio[] {
  if (!Array.isArray(raw)) return [];
  const hasta = masDias(o.hoy, DIAS_ORGANIZAR - 1);
  const out: Cambio[] = [];
  const vistos = new Set<string>();
  for (const x of raw.slice(0, 40)) {
    if (!x || typeof x !== "object") continue;
    const v = x as Record<string, unknown>;
    const t = typeof v.tarea === "string" ? o.codigos.get(v.tarea.trim().toUpperCase()) : undefined;
    const nueva = !t && typeof v.nueva === "string" ? v.nueva.trim().slice(0, 140) : "";
    if (!t && !nueva) continue;
    if (t && vistos.has(t.id)) continue;
    const due = typeof v.fecha === "string" && fechaOk.test(v.fecha) && v.fecha >= o.hoy && v.fecha <= hasta ? v.fecha : v.fecha === "" ? "" : null;
    if (due === null) continue;
    let momento: string | undefined;
    let hora: string | undefined;
    let fin: string | undefined;
    if (due && typeof v.momento === "string" && v.momento.trim()) {
      const ms = momentosDe(due, o.datos);
      const k = v.momento.trim();
      const nombre = k.slice(k.indexOf("|") + 1).trim().toLowerCase();
      const b = ms.find((m) => claveDe(m) === k) ?? ms.find((m) => m.t.trim().toLowerCase() === nombre);
      if (!b) continue;
      momento = claveDe(b);
    } else if (due && typeof v.hora === "string" && hm.test(v.hora)) {
      hora = v.hora;
      if (typeof v.fin === "string" && hm.test(v.fin) && v.fin > v.hora) fin = v.fin;
    }
    const base = t
      ? { id: t.id, titulo: t.title.slice(0, 140), due, momento, hora, fin }
      : { titulo: nueva, due, momento, hora, fin, meta: v.meta === true, ...(v.lado === "trabajo" ? { lado: "trabajo" as const } : {}) };
    /* Un cambio que deja la tarea igual no se enseña */
    if (t && t.due === due && (t.momento ?? "") === (momento ?? "") && (t.hora ?? "") === (hora ?? "") && (!hora || (t.fin ?? "") === (fin ?? ""))) continue;
    if (t) vistos.add(t.id);
    out.push({ ...base, texto: describir(base, o.hoy) });
  }
  return out;
}

/** Cómo queda la tarea al aplicar el cambio (o la nueva, con su id). Si la tarea ya no existe o ya está hecha, nada */
export function aplicarCambio(c: Cambio, actual: Tarea | undefined, nuevo: () => { id: string; created: string }): Tarea | null {
  const donde = { due: c.due, ...(c.momento ? { momento: c.momento } : {}), ...(c.hora ? { hora: c.hora, ...(c.fin ? { fin: c.fin } : {}) } : {}) };
  if (c.id) {
    if (!actual || actual.done) return null;
    const { momento: _m, hora: _h, fin: _f, ...resto } = actual;
    return { ...resto, ...donde };
  }
  return { ...nuevo(), title: c.titulo, step: "", done: false, meta: !!c.meta, ...(c.lado ? { lado: c.lado } : {}), ...donde };
}
