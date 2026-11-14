import type { Bloque } from "./plan";

/** Minúsculas y sin tildes, para reconocer la actividad por su nombre */
export const llano = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Los tipos de actividad que la app distingue. Cada uno tiene su ícono (components/IconoBloque.tsx)
 * y algunos abren algo al tocarlos: despertar (despertador), ejercicio (contador de series), diario y dormir.
 * El texto es la explicación que lee la IA cuando clasifica un nombre que la app no reconoce.
 */
export const TIPOS: Record<string, string> = {
  despertar: "levantarse, despertarse, empezar el día",
  pastilla: "tomar medicinas, pastillas, vitaminas o suplementos",
  dormir: "irse a dormir por la noche (la siesta es descanso)",
  ejercicio: "deporte, gimnasio, entrenar, correr, caminar, yoga o cualquier actividad física",
  comida: "desayunar, almorzar, comer, cenar, merendar o cocinar",
  aseo: "ducha, baño, aseo personal, arreglarse",
  espiritual: "oración, lectura espiritual, meditación, iglesia, gratitud",
  diario: "escribir el diario personal, repasar o reflexionar sobre cómo fue el día",
  escribir: "escribir otras cosas (textos, cartas, un libro)",
  leer: "leer",
  estudio: "estudiar, clases, cursos, idiomas, practicar algo que se está aprendiendo",
  llamada: "llamadas por teléfono",
  gente: "familia, pareja, hijos, amigos, reuniones, citas, visitas",
  casa: "limpiar, ordenar, lavar, tareas del hogar",
  compras: "compras, supermercado",
  traslado: "trayectos, viajes, transporte, ir de un sitio a otro",
  descanso: "descanso, pausa, siesta, tiempo libre, ocio, series, juegos",
  trabajo: "trabajo, oficina, proyectos, turnos, tareas administrativas",
  otro: "ninguna de las anteriores",
};

/** De más concreto a más general: gana la primera que coincide */
const REGLAS: [RegExp, string][] = [
  [/despert|levant/, "despertar"],
  [/pastilla|medicament|medicina|vitamina|remedio|tableta|suplement/, "pastilla"],
  [/dormir|acostar|a la cama|desconect/, "dormir"],
  [/ejercicio|entren|deporte|gym|gimnasio|correr|workout|caminar|caminata|paseo|pasear|yoga|estir|pesas|nadar|bici/, "ejercicio"],
  [/desayun|almuerz|comida|\bcomer\b|\bcena|merienda|cocin/, "comida"],
  [/ducha|duchar|\bbano\b|\baseo\b|higiene/, "aseo"],
  [/\borar\b|oracion|biblia|devocional|iglesia|\bculto\b|\bmisa\b|rezar|medit|gratitud/, "espiritual"],
  [/\bdiario\b/, "diario"],
  [/escribir/, "escribir"],
  [/leer|lectura|libro/, "leer"],
  [/estudi|clase|curso|aleman|ingles|idioma|aprender|practicar/, "estudio"],
  [/llamar|llamada|telefon/, "llamada"],
  [/familia|\bhij[oa]s?\b|\bbebe\b|\bninos?\b|pareja|espos|amig|reunion|visita|\bcita\b/, "gente"],
  [/limpi|\borden(ar)?\b|lavar|\bropa\b|hogar|\bcasa\b/, "casa"],
  [/compra|supermercado|mercado/, "compras"],
  [/trayecto|viaj|traslad|\bbus\b|\btren\b|\bmetro\b|conduc|camino a/, "traslado"],
  [/descans|pausa|siesta|relaj|ocio|libre|cafe|serie|pelicula|jugar/, "descanso"],
  [/trabaj|oficina|\bturno\b|labor|proyecto|contab|correo|admin|planific/, "trabajo"],
];

/** El tipo que se reconoce en un texto por sus palabras, o null si no dice nada */
export const tipoPorNombre = (t: string) => {
  const x = llano(t);
  return REGLAS.find(([re]) => re.test(x))?.[1] ?? null;
};

/**
 * El tipo de un bloque. Primero por las palabras de su nombre; si no se reconoce, lo que dijo la IA
 * (`memo`: nombre en llano → tipo, guardado en `perfil/tipos`); y si aún no hay respuesta, por su descripción.
 * Las metas y tareas con hora que no se reconocen llevan su propio ícono.
 */
export function tipoDe(b: Pick<Bloque, "t" | "tarea" | "sub">, memo?: Record<string, string>): string {
  const porNombre = tipoPorNombre(b.t);
  if (porNombre) return porNombre;
  if (b.tarea) return /meta/i.test(b.sub ?? "") ? "meta" : "tarea";
  const ia = memo?.[llano(b.t)];
  if (ia && ia in TIPOS) return ia;
  if (/tarea|pendiente/.test(llano(b.t))) return "tarea";
  return tipoPorNombre(b.sub ?? "") ?? "otro";
}
