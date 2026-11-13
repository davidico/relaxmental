export type Area = "trabajo" | "tukuna" | "aleman" | "iglesia" | "familia" | "salud" | "casa" | "rutina";
export type Kind = "idea" | "profecia" | "predicacion" | "nota";

export interface Tarea {
  id: string;
  title: string;
  step: string;
  area?: Area | ""; // tareas antiguas; las nuevas no llevan categoría
  due: string; // AAAA-MM-DD o ""
  /** Hora del aviso (HH:MM), opcional */
  hora?: string;
  done: boolean;
  created: string;
  /** Lado de la vida en el planner semanal (sin lado = personal) */
  lado?: "personal" | "trabajo";
  /** Meta del weekly planner (en lo que quieres avanzar ese día); si no, es una tarea puntual */
  meta?: boolean;
  /** Fin del bloque (HH:MM) cuando tiene hora; si no, dura 30 min */
  fin?: string;
}

/** Lo escrito en el planner antes de separar metas y tareas también cuenta como meta */
export const esMeta = (x: Pick<Tarea, "meta" | "lado">) => x.meta ?? !!x.lado;

export interface Carpeta {
  id: string;
  name: string;
  parent: string | null; // null = sección (carpeta principal)
  area: Area; // color
  /** Sección privada: no sale en Cerebro, solo desde «Secciones» */
  privada?: boolean;
  /** Marca de la reorganización en secciones (en la sección Notas) */
  v?: number;
  orden: number;
  created: string;
}

export interface Nota {
  id: string;
  /** Carpeta donde está (id de Carpeta) */
  folder?: string;
  /** Contenido con formato (HTML del editor); "text" guarda la versión sin formato para buscar */
  html?: string;
  /** Tipo antiguo, solo para notas anteriores a las carpetas */
  kind: Kind;
  title: string;
  text: string;
  ref: string;
  created: string;
  /** "lista": casillas en vez de texto (como Google Keep) */
  tipo?: "texto" | "lista";
  items?: ItemLista[];
  updated?: string;
}

export interface ItemLista {
  id: string;
  t: string;
  ok: boolean;
}

export interface Habito {
  id: string;
  name: string;
  area: Area;
  orden: number;
  hechos: Record<string, boolean>; // fecha -> hecho
  created: string;
}


export const AREAS: Record<Exclude<Area, "rutina">, string> = {
  trabajo: "Buscar trabajo",
  tukuna: "Tukuna",
  aleman: "Alemán",
  iglesia: "Iglesia",
  familia: "Familia",
  salud: "Salud",
  casa: "Casa",
};

export const KINDS: Record<Kind, { label: string; area: Area }> = {
  idea: { label: "Idea", area: "tukuna" },
  profecia: { label: "Profecía", area: "iglesia" },
  predicacion: { label: "Predicación", area: "trabajo" },
  nota: { label: "Nota", area: "casa" },
};

export const areaColor = (a: Area) => `var(--a-${a})`;
