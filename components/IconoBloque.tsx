import type { ReactNode } from "react";
import type { Bloque } from "@/lib/plan";

/** Minúsculas y sin tildes, para reconocer la actividad por su nombre */
const llano = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const esEjercicio = (t: string) => /ejercicio|entren|deporte|gym|gimnasio|correr|workout/i.test(t);
export const esDespertar = (t: string) => /despert|levant/.test(llano(t));
export const esDiario = (t: string) => /\bdiario\b/.test(llano(t));
export const esDormir = (t: string) => /dormir|acostar|a la cama/.test(llano(t));

const ICONOS: Record<string, ReactNode> = {
  despertar: <><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 1.5M5 4L3 6M19 4l2 2" /></>,
  pastilla: <><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M9.5 9.5l5 5" /></>,
  dormir: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  ejercicio: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />,
  comida: <path d="M7 3v6a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.7 1.5-2.5 4-2.5 7H17v11" />,
  taza: <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3" />,
  gota: <path d="M12 3.5c3 3.6 5.5 6.5 5.5 9.8a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6.2 5.5-9.8z" />,
  corazon: <path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5c0 5.1-7 9.5-7 9.5z" />,
  lapiz: <path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4" />,
  libro: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19" />,
  estudio: <path d="M3 9.5L12 5l9 4.5-9 4.5zM7 12v4.5c1.5 1.3 3.2 2 5 2s3.5-.7 5-2V12M21 9.5V15" />,
  telefono: <path d="M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2z" />,
  gente: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14a5.5 5.5 0 0 1 3 5" /></>,
  casa: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6" />,
  bolsa: <path d="M6 8h12l1 12H5zM9 8V7a3 3 0 0 1 6 0v1" />,
  lugar: <><path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0c0 5-6 10.5-6 10.5z" /><circle cx="12" cy="10.5" r="2.2" /></>,
  trabajo: <><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  meta: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></>,
  tarea: <><rect x="4.5" y="4.5" width="15" height="15" rx="3" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></>,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};

/** De más concreto a más general: gana la primera que coincide */
const REGLAS: [RegExp, string][] = [
  [/despert|levant/, "despertar"],
  [/pastilla|medicament|medicina|vitamina|remedio|tableta|suplement/, "pastilla"],
  [/dormir|acostar|a la cama|siesta|desconect/, "dormir"],
  [/ejercicio|entren|deporte|gym|gimnasio|correr|workout|caminar|caminata|paseo|pasear|yoga|estir|pesas|nadar|bici/, "ejercicio"],
  [/desayun|almuerz|comida|\bcomer\b|\bcena|merienda|cocin/, "comida"],
  [/ducha|duchar|\bbano\b|\baseo\b|higiene/, "gota"],
  [/\borar\b|oracion|biblia|devocional|iglesia|\bculto\b|\bmisa\b|rezar|medit|gratitud/, "corazon"],
  [/diario|escribir/, "lapiz"],
  [/leer|lectura|libro/, "libro"],
  [/estudi|clase|curso|aleman|ingles|idioma|aprender|practicar/, "estudio"],
  [/llamar|llamada|telefon/, "telefono"],
  [/familia|\bhij[oa]s?\b|\bbebe\b|\bninos?\b|pareja|espos|amig|reunion|visita|\bcita\b/, "gente"],
  [/limpi|\borden(ar)?\b|lavar|\bropa\b|hogar|\bcasa\b/, "casa"],
  [/compra|supermercado|mercado/, "bolsa"],
  [/trayecto|viaj|traslad|\bbus\b|\btren\b|\bmetro\b|conduc|camino a/, "lugar"],
  [/descans|pausa|relaj|ocio|libre|cafe|serie|pelicula|jugar/, "taza"],
  [/trabaj|oficina|\bturno\b|labor|proyecto|contab|correo|admin|planific/, "trabajo"],
];

/** El ícono que le toca a un bloque: por su nombre y, si no se reconoce, por si es meta o tarea */
export function iconoDe(b: Pick<Bloque, "t" | "tarea" | "sub">) {
  const t = llano(b.t);
  const regla = REGLAS.find(([re]) => re.test(t));
  if (regla) return regla[1];
  if (b.tarea) return /meta/i.test(b.sub ?? "") ? "meta" : "tarea";
  if (/tarea|pendiente/.test(t)) return "tarea";
  /* Si el nombre no dice nada (el de un proyecto, por ejemplo), se mira la descripción */
  const sub = llano(b.sub ?? "");
  return REGLAS.find(([re]) => re.test(sub))?.[1] ?? "reloj";
}

export default function IconoBloque({ nombre }: { nombre: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre] ?? ICONOS.reloj}
    </svg>
  );
}
