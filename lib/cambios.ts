import { baseDe, encajar, type Bloque, type Eventos, type Plantilla } from "./plan";
import { claveDe } from "./momentos";
import { esMeta, type Area, type Tarea } from "./types";

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
  /** Un cambio en los momentos de un día (no en una tarea): quitar uno, cambiarlo o añadir uno nuevo. Solo ese día */
  dia?: CambioDia;
  /** Cómo se le enseña a la persona */
  texto: string;
};
export type CambioDia = { accion: "quitar" | "cambiar" | "anadir"; clave?: string; s?: string; e?: string; t?: string; sub?: string };

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
  const dias = Array.from({ length: DIAS_ORGANIZAR }, (_, i) => masDias(hoy, i)).map((f) => {
    const ms = momentosDe(f, d);
    return `${nombreDia(f, hoy)} ${f}: ${ms.length ? ms.map((b) => `${b.s}-${b.e} ${b.t} [${claveDe(b)}]`).join(" · ") : "(sin momentos)"}`;
  });
  return {
    texto: `LOS MOMENTOS DE MIS PRÓXIMOS DÍAS (salen de mi semana tipo, que es solo un modelo, y de los días que ajusté; entre corchetes, la clave de cada momento):\n${dias.join("\n")}\n\nMIS METAS Y TAREAS SIN HACER (con su código):\n${lineas.join("\n") || "(ninguna)"}`,
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
  /* Los días como quedan con los cambios de momentos ya leídos (así una tarea puede ir a un momento nuevo) */
  const datos: DatosDia = { ...o.datos, dias: { ...o.datos.dias } };
  const lista = raw.slice(0, 40) as unknown[];
  const esDia = (x: unknown) => !!x && typeof x === "object" && typeof (x as Record<string, unknown>).dia === "string";
  for (const x of [...lista.filter(esDia), ...lista.filter((y) => !esDia(y))]) {
    if (!x || typeof x !== "object") continue;
    const v = x as Record<string, unknown>;
    if (esDia(v)) {
      const c = leerCambioDia(v, datos, o.hoy, hasta);
      if (c) {
        datos.dias[c.due] = aplicarCambiosDia(momentosDe(c.due, datos), [c.dia!]).bloques;
        out.push(c);
      }
      continue;
    }
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
      const ms = momentosDe(due, datos);
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

const ok = (h: unknown): h is string => typeof h === "string" && hm.test(h);
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
/** Un cambio en los momentos de un día que escribió la IA, comprobado: el día está entre hoy y dos semanas y el momento existe ese día */
function leerCambioDia(v: Record<string, unknown>, datos: DatosDia, hoy: string, hasta: string): Cambio | null {
  const fecha = String(v.dia);
  if (!fechaOk.test(fecha) || fecha < hoy || fecha > hasta) return null;
  const ms = momentosDe(fecha, datos);
  const buscar = (k: unknown) => {
    if (typeof k !== "string" || !k.trim()) return undefined;
    const nombre = k.slice(k.indexOf("|") + 1).trim().toLowerCase();
    return ms.find((m) => claveDe(m) === k.trim()) ?? ms.find((m) => m.t.trim().toLowerCase() === nombre);
  };
  const t = typeof v.t === "string" ? v.t.trim().slice(0, 80) : undefined;
  const sub = typeof v.sub === "string" ? v.sub.trim().slice(0, 160) : undefined;
  let dia: CambioDia | null = null;
  let titulo = "";
  if (v.quitar !== undefined) {
    const b = buscar(v.quitar);
    if (!b) return null;
    dia = { accion: "quitar", clave: claveDe(b) };
    titulo = b.t;
  } else if (v.cambiar !== undefined) {
    const b = buscar(v.cambiar);
    if (!b) return null;
    const s = ok(v.s) ? v.s : b.s;
    const e = ok(v.e) ? v.e : b.e;
    if (minutos(e) <= minutos(s)) return null;
    dia = { accion: "cambiar", clave: claveDe(b), s, e, t: t || b.t, ...(sub !== undefined ? { sub } : {}) };
    if (dia.s === b.s && dia.e === b.e && dia.t === b.t && (sub === undefined || sub === (b.sub ?? ""))) return null;
    titulo = b.t;
  } else if (typeof v.anadir === "string" && v.anadir.trim()) {
    if (!ok(v.s) || !ok(v.e) || minutos(v.e) <= minutos(v.s)) return null;
    dia = { accion: "anadir", t: v.anadir.trim().slice(0, 80), s: v.s, e: v.e, ...(sub ? { sub } : {}) };
    titulo = dia.t!;
  }
  if (!dia) return null;
  const quien = nombreDia(fecha, hoy);
  const texto =
    dia.accion === "quitar"
      ? `${quien}: quitar «${titulo}»`
      : dia.accion === "anadir"
        ? `${quien}: añadir «${dia.t}», de ${dia.s} a ${dia.e}`
        : `${quien}: «${titulo}» → ${dia.t !== titulo ? `«${dia.t}», ` : ""}de ${dia.s} a ${dia.e}`;
  return { titulo, due: fecha, dia, texto };
}

/**
 * Aplica cambios de momentos a los momentos de un día (lo que se guarda como día ajustado). Lo que se cruce con un momento
 * cambiado o nuevo se recorta, como al cambiarlo a mano. Devuelve el día y las claves que cambiaron (vieja → nueva, "" = quitado),
 * para que las subtareas y las marcas de «hecho» sigan a su momento.
 */
export function aplicarCambiosDia(momentos: Bloque[], cambios: CambioDia[]): { bloques: Bloque[]; claves: [string, string][] } {
  let bs = momentos.map((b) => ({ ...b }));
  const claves: [string, string][] = [];
  for (const c of cambios) {
    const orig = c.clave ? bs.find((b) => claveDe(b) === c.clave) : undefined;
    if (c.accion === "quitar") {
      if (!orig) continue;
      bs = bs.filter((b) => b !== orig);
      claves.push([claveDe(orig), ""]);
    } else if (c.accion === "cambiar") {
      if (!orig) continue;
      /* Si cambia de nombre y no trae descripción, la vieja ya no le corresponde */
      const renombra = !!c.t && c.t !== orig.t;
      const nuevo: Bloque = { ...orig, s: c.s ?? orig.s, e: c.e ?? orig.e, t: c.t ?? orig.t, ...(c.sub !== undefined ? { sub: c.sub || undefined } : renombra ? { sub: undefined } : {}) };
      bs = encajar(bs.filter((b) => b !== orig), [nuevo]);
      claves.push([claveDe(orig), claveDe(nuevo)]);
    } else if (c.t && c.s && c.e) {
      bs = encajar(bs, [{ s: c.s, e: c.e, t: c.t, a: "casa" as Area, ...(c.sub ? { sub: c.sub } : {}) }]);
    }
  }
  return { bloques: bs, claves };
}

/** Cómo queda la tarea al aplicar el cambio (o la nueva, con su id). Si la tarea ya no existe o ya está hecha, nada */
export function aplicarCambio(c: Cambio, actual: Tarea | undefined, nuevo: () => { id: string; created: string }): Tarea | null {
  /* Los cambios de momentos de un día se aplican aparte (aplicarCambiosDia) */
  if (c.dia) return null;
  const donde = { due: c.due, ...(c.momento ? { momento: c.momento } : {}), ...(c.hora ? { hora: c.hora, ...(c.fin ? { fin: c.fin } : {}) } : {}) };
  if (c.id) {
    if (!actual || actual.done) return null;
    const { momento: _m, hora: _h, fin: _f, ...resto } = actual;
    return { ...resto, ...donde };
  }
  return { ...nuevo(), title: c.titulo, step: "", done: false, meta: !!c.meta, ...(c.lado ? { lado: c.lado } : {}), ...donde };
}
