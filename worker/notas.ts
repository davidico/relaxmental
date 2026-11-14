/**
 * Buscar en las notas de una persona las que hablan de lo que pregunta. Es una búsqueda por palabras (sin IA):
 * cada palabra se reduce a su raíz («piedritas» y «piedra» → «piedr») y pesan más las palabras raras.
 * Con lo encontrado, la IA responde (`responderNotas` en ai.ts).
 */
export interface NotaTexto {
  id: string;
  titulo: string;
  carpeta: string;
  fecha: string;
  texto: string;
}

const llano = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const VACIAS = new Set(
  "que cual cuales como cuando donde quien por para con sin sobre entre desde hasta hacia los las del una unos unas esto esta este estos estas eso esa ese aqui alli muy mas menos pero porque pues tambien solo algo todo toda todos todas otro otra mis tus sus nos les han hay fue era eran ser estar estaba estaban tengo tiene tenia decia dice dijo dije acerca nota notas escribi apunte anote cosa cosas".split(" "),
);
/** Las raíces de las palabras que importan en un texto */
export const raices = (texto: string) => [
  ...new Set(
    llano(texto)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !VACIAS.has(w))
      .map((w) => (w.length > 5 ? w.slice(0, 5) : w)),
  ),
];

const veces = (texto: string, raiz: string) => {
  let n = 0;
  for (let i = texto.indexOf(raiz); i >= 0; i = texto.indexOf(raiz, i + raiz.length)) if (i === 0 || !/[a-z0-9]/.test(texto[i - 1])) n++;
  return n;
};

/** El trozo de una nota larga que rodea a lo que se busca (hasta `max` caracteres) */
function trozos(texto: string, plano: string, rs: string[], max: number) {
  if (texto.length <= max) return texto;
  const puntos: number[] = [];
  for (const r of rs) for (let i = plano.indexOf(r); i >= 0 && puntos.length < 12; i = plano.indexOf(r, i + r.length)) puntos.push(i);
  if (!puntos.length) return texto.slice(0, max) + " […]";
  puntos.sort((a, b) => a - b);
  const tramos: [number, number][] = [];
  for (const p of puntos) {
    const a = Math.max(0, p - 350);
    const b = Math.min(texto.length, p + 450);
    const ult = tramos[tramos.length - 1];
    if (ult && a <= ult[1]) ult[1] = b;
    else tramos.push([a, b]);
  }
  let out = "";
  for (const [a, b] of tramos) {
    if (out.length + (b - a) > max) break;
    out += (out || a > 0 ? "[…] " : "") + texto.slice(a, b).trim() + " ";
  }
  /* El comienzo de la nota da contexto (de qué va) aunque lo buscado esté más abajo */
  const inicio = tramos[0][0] > 200 ? texto.slice(0, 200).trim() + " " : "";
  return inicio + (out || texto.slice(tramos[0][0], tramos[0][0] + max)).trim() + " […]";
}

/**
 * Las notas que mejor responden a esas palabras (como mucho `cuantas`), con el trozo que importa de cada una.
 * Si casi nada coincide, se completa con las notas más recientes, para preguntas generales («¿qué he escrito últimamente?»).
 */
export function buscarNotas(notas: NotaTexto[], palabras: string, cuantas = 8, maxPorNota = 1600): NotaTexto[] {
  const rs = raices(palabras);
  const docs = notas.map((n) => ({ n, titulo: llano(n.titulo), carpeta: llano(n.carpeta), texto: llano(n.texto) }));
  const peso = new Map(rs.map((r) => [r, Math.log(1 + docs.length / (1 + docs.filter((d) => veces(d.texto, r) || veces(d.titulo, r)).length))]));
  const puntuadas = docs
    .map((d) => ({ d, p: rs.reduce((s, r) => s + peso.get(r)! * (Math.min(veces(d.texto, r), 6) + 4 * Math.min(veces(d.titulo, r), 1)) + (veces(d.carpeta, r) ? 0.75 : 0), 0) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || b.d.n.fecha.localeCompare(a.d.n.fecha))
    .slice(0, cuantas)
    .map((x) => x.d);
  if (puntuadas.length < 3) {
    const ya = new Set(puntuadas.map((d) => d.n.id));
    puntuadas.push(...docs.filter((d) => !ya.has(d.n.id)).sort((a, b) => b.n.fecha.localeCompare(a.n.fecha)).slice(0, 5 - puntuadas.length));
  }
  return puntuadas.map((d) => ({ ...d.n, texto: trozos(d.n.texto, d.texto, rs, maxPorNota) }));
}

/** Lo que cabe con holgura en una sola pregunta a la IA (el modelo admite unas 24 000 fichas; esto son unas 12 000) */
export const PRESUPUESTO = 40000;

/**
 * Las notas que se le pasan a la IA para responder, ya ordenadas para leerlas: por sección y, dentro, de la más antigua a la más nueva.
 * - Si todas las notas caben (lo normal en un Cerebro personal), van TODAS enteras: así la respuesta no depende de acertar con la palabra.
 * - Si no caben, van las que mejor responden a las palabras, enteras mientras quepan (las muy largas, recortadas alrededor de lo buscado).
 */
export function elegirNotas(notas: NotaTexto[], palabras: string, presupuesto = PRESUPUESTO): { notas: NotaTexto[]; todas: boolean } {
  const peso = (n: NotaTexto) => n.texto.length + n.titulo.length + 60;
  const orden = (xs: NotaTexto[]) => [...xs].sort((a, b) => a.carpeta.localeCompare(b.carpeta) || a.fecha.localeCompare(b.fecha));
  if (notas.reduce((s, n) => s + peso(n), 0) <= presupuesto) return { notas: orden(notas), todas: true };
  const elegidas: NotaTexto[] = [];
  let usado = 0;
  for (const n of buscarNotas(notas, palabras, 60, 3000)) {
    if (usado + peso(n) > presupuesto) continue;
    elegidas.push(n);
    usado += peso(n);
  }
  return { notas: orden(elegidas), todas: false };
}
