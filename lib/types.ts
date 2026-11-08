export type Area = "trabajo" | "tukuna" | "aleman" | "iglesia" | "familia" | "salud" | "casa" | "rutina";
export type Kind = "idea" | "profecia" | "predicacion" | "nota";

export interface Tarea {
  id: string;
  title: string;
  step: string;
  area: Area;
  due: string; // AAAA-MM-DD o ""
  done: boolean;
  created: string;
}

export interface Carpeta {
  id: string;
  name: string;
  parent: string | null; // null = carpeta principal
  area: Area; // color
  orden: number;
  created: string;
}

export interface Nota {
  id: string;
  /** Carpeta donde está (id de Carpeta) */
  folder?: string;
  /** Tipo antiguo, solo para notas anteriores a las carpetas */
  kind: Kind;
  title: string;
  text: string;
  ref: string;
  created: string;
}

export interface Habito {
  id: string;
  name: string;
  area: Area;
  orden: number;
  hechos: Record<string, boolean>; // fecha -> hecho
  created: string;
}

/** Fecha (AAAA-MM-DD) -> labores en la iglesia ese día */
export type Labores = Record<string, string[]>;

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
