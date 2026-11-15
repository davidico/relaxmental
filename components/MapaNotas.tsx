"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Carpeta, Nota } from "@/lib/types";

type Nodo = { id: string; tipo: "sec" | "eti" | "nota"; label: string; r: number; x: number; y: number; vx: number; vy: number; fijo?: boolean };
type Arista = { a: number; b: number; largo: number; mencion?: boolean };

const llano = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const LETRA = /[a-z0-9ñ]/;
/** ¿Aparece `t` en `texto` como palabras enteras (sin letras pegadas antes ni después)? */
function entera(texto: string, t: string) {
  for (let p = texto.indexOf(t); p >= 0; p = texto.indexOf(t, p + 1)) {
    const antes = p > 0 ? texto[p - 1] : " ";
    const despues = p + t.length < texto.length ? texto[p + t.length] : " ";
    if (!LETRA.test(antes) && !LETRA.test(despues)) return true;
  }
  return false;
}
const corto = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Las notas y sus uniones: cada nota con su etiqueta, cada etiqueta con su sección, y dos notas entre sí cuando una nombra el título de la otra */
function grafo(notas: Nota[], carpetas: Carpeta[]) {
  const visibles = new Set(carpetas.filter((c) => !c.privada && !(c.parent && carpetas.find((p) => p.id === c.parent)?.privada)).map((c) => c.id));
  const nodos: Nodo[] = [];
  const idx = new Map<string, number>();
  const poner = (n: Omit<Nodo, "x" | "y" | "vx" | "vy">) => {
    /* Empiezan en espiral, siempre igual, para que el mapa no salga distinto cada vez */
    const i = nodos.length;
    const ang = i * 2.39996;
    const rad = 26 * Math.sqrt(i + 1);
    idx.set(n.id, i);
    nodos.push({ ...n, x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, vx: 0, vy: 0 });
  };
  const aristas: Arista[] = [];
  const mias = notas.filter((n) => n.folder && visibles.has(n.folder) && (n.title || n.text));
  const usadas = new Set(mias.map((n) => n.folder!));
  for (const c of carpetas) {
    if (!visibles.has(c.id)) continue;
    /* Las etiquetas vacías no salen; las secciones sí, si tienen algo dentro */
    const conAlgo = usadas.has(c.id) || carpetas.some((k) => k.parent === c.id && usadas.has(k.id));
    if (!conAlgo) continue;
    poner({ id: `c:${c.id}`, tipo: c.parent ? "eti" : "sec", label: c.name, r: c.parent ? 7 : 11 });
  }
  for (const c of carpetas) {
    const a = idx.get(`c:${c.id}`);
    const b = c.parent ? idx.get(`c:${c.parent}`) : undefined;
    if (a !== undefined && b !== undefined) aristas.push({ a, b, largo: 170 });
  }
  for (const n of mias) {
    poner({ id: n.id, tipo: "nota", label: n.title?.trim() || n.text.trim().split(/\s+/).slice(0, 5).join(" ") || "Sin título", r: 4 });
    const c = idx.get(`c:${n.folder}`);
    if (c !== undefined) aristas.push({ a: idx.get(n.id)!, b: c, largo: 78 });
  }
  /* Menciones: el título de una nota (de 4 letras o más) aparece en el texto de otra */
  let menciones = 0;
  if (mias.length <= 500) {
    const textos = mias.map((n) => llano(`${n.title} ${n.text} ${(n.items ?? []).map((i) => i.t).join(" ")}`));
    mias.forEach((n, i) => {
      const t = llano(n.title?.trim() ?? "");
      if (t.length < 4) return;
      mias.forEach((m, j) => {
        if (i === j || llano(m.title?.trim() ?? "") === t) return;
        /* El título entero, no un trozo de otra palabra («Compra» no cuenta dentro de «comprar») */
        const p = textos[j].indexOf(t);
        if (p < 0 || !entera(textos[j], t)) return;
        const a = idx.get(n.id)!;
        const b = idx.get(m.id)!;
        if (aristas.some((e) => e.mencion && ((e.a === a && e.b === b) || (e.a === b && e.b === a)))) return;
        aristas.push({ a, b, largo: 150, mencion: true });
        menciones++;
      });
    });
  }
  /* Una nota crece un poco con cada mención */
  for (const e of aristas) if (e.mencion) for (const k of [e.a, e.b]) nodos[k].r = Math.min(7, nodos[k].r + 0.6);
  return { nodos, aristas, nNotas: mias.length, menciones };
}

/** Un paso de la simulación: los puntos se repelen, las uniones tiran y todo tiende al centro */
function paso(nodos: Nodo[], aristas: Arista[], alfa: number) {
  for (let i = 0; i < nodos.length; i++) {
    const a = nodos[i];
    for (let j = i + 1; j < nodos.length; j++) {
      const b = nodos[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        dx = (i % 2 ? 1 : -1) * 0.5;
        dy = 0.5;
        d2 = 1;
      }
      const f = ((2600 + (a.r + b.r) * 140) / d2) * alfa;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
  }
  for (const e of aristas) {
    const a = nodos[e.a];
    const b = nodos[e.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    /* Las menciones tiran flojo: acercan dos notas sin deshacer los grupos de cada etiqueta */
    const f = (d - e.largo) * (e.mencion ? 0.008 : 0.06) * alfa;
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }
  for (const n of nodos) {
    n.vx -= n.x * 0.006 * alfa;
    n.vy -= n.y * 0.006 * alfa;
    n.vx *= 0.8;
    n.vy *= 0.8;
    if (!n.fijo) {
      n.x += n.vx;
      n.y += n.vy;
    }
  }
}

/**
 * El mapa de tus notas (solo en pantallas anchas; es para verlo, por gusto): cada nota es un punto unido a su etiqueta y a su
 * sección, y dos notas se unen cuando una nombra el título de la otra. Se arrastra, se acerca con la rueda, y al tocar una nota
 * se abre; al tocar una etiqueta o sección, se va a ella. Las secciones privadas no salen.
 */
export default function MapaNotas({ notas, carpetas, onNota, onCarpeta, onClose }: { notas: Nota[]; carpetas: Carpeta[]; onNota: (id: string) => void; onCarpeta: (id: string) => void; onClose: () => void }) {
  const g = useMemo(() => grafo(notas, carpetas), [notas, carpetas]);
  const [, pintar] = useState(0);
  const alfa = useRef(1);
  const svg = useRef<SVGSVGElement>(null);
  const [vista, setVista] = useState({ x: 0, y: 0, k: 1 });
  const vistaRef = useRef(vista);
  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);
  /* El tamaño del lienzo, para dejar el mapa centrado */
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /* Mientras la persona no lo mueva ni lo acerque, el mapa se encuadra solo para caber entero */
  const tocado = useRef(false);
  const encuadrar = (w: number, h: number) => {
    if (tocado.current || !w || !h || !g.nodos.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of g.nodos) {
      x0 = Math.min(x0, n.x - n.r - 60);
      x1 = Math.max(x1, n.x + n.r + 60);
      y0 = Math.min(y0, n.y - n.r - 20);
      y1 = Math.max(y1, n.y + n.r + 30);
    }
    const k = Math.min(1.6, Math.max(0.3, Math.min(w / (x1 - x0), h / (y1 - y0))));
    setVista({ k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k });
  };
  const [sobre, setSobre] = useState<number | null>(null);
  const arrastre = useRef<{ nodo?: number; x: number; y: number; movido: number; vx: number; vy: number } | null>(null);

  /* La simulación corre hasta que se calma; con «menos movimiento» se calcula de golpe y se pinta quieta */
  useEffect(() => {
    alfa.current = 1;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 320; i++) paso(g.nodos, g.aristas, Math.max(0.05, 1 - i / 320));
      alfa.current = 0;
      const el = svg.current;
      if (el) encuadrar(el.clientWidth, el.clientHeight);
      pintar((n) => n + 1);
      return;
    }
    let id = 0;
    const bucle = () => {
      if (alfa.current > 0.02) {
        paso(g.nodos, g.aristas, alfa.current);
        alfa.current *= 0.985;
        const el = svg.current;
        if (el) encuadrar(el.clientWidth, el.clientHeight);
        pintar((n) => n + 1);
      }
      id = requestAnimationFrame(bucle);
    };
    id = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(id);
  }, [g]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".nv") && onClose();
    addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  /* La rueda acerca o aleja hacia donde está el cursor */
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      tocado.current = true;
      const r = el.getBoundingClientRect();
      const v = vistaRef.current;
      const k = Math.min(4, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      setVista({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k });
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, []);

  const vecinos = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const e of g.aristas) {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a)!.add(e.b);
      m.get(e.b)!.add(e.a);
    }
    return m;
  }, [g]);
  const cerca = (i: number) => sobre === null || i === sobre || !!vecinos.get(sobre)?.has(i);

  const abajo = (e: React.PointerEvent, nodo?: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arrastre.current = { nodo, x: e.clientX, y: e.clientY, movido: 0, vx: vista.x, vy: vista.y };
    if (nodo !== undefined) g.nodos[nodo].fijo = true;
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    a.movido = Math.max(a.movido, Math.abs(dx) + Math.abs(dy));
    if (a.nodo !== undefined) {
      const n = g.nodos[a.nodo];
      n.x += (e.clientX - a.x) / vista.k;
      n.y += (e.clientY - a.y) / vista.k;
      a.x = e.clientX;
      a.y = e.clientY;
      alfa.current = Math.max(alfa.current, 0.25);
      pintar((x) => x + 1);
    } else {
      if (a.movido > 4) tocado.current = true;
      setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
    }
  };
  const arriba = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || a.nodo === undefined) return;
    const n = g.nodos[a.nodo];
    n.fijo = false;
    /* Sin arrastrar es un toque: abre la nota, o va a esa etiqueta o sección */
    if (a.movido < 5) (n.tipo === "nota" ? onNota(n.id) : onCarpeta(n.id.slice(2)));
  };

  return createPortal(
    <div className="mp" role="dialog" aria-modal="true" aria-labelledby="mp-h">
      <div className="mp-bar">
        <button className="nv-ib" aria-label="Cerrar el mapa" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h2 id="mp-h" className="mp-h">Mapa de tus notas</h2>
        <span className="mp-n">{g.nNotas} {g.nNotas === 1 ? "nota" : "notas"} · {g.menciones} {g.menciones === 1 ? "mención" : "menciones"} entre ellas</span>
      </div>
      <svg
        ref={svg}
        className="mp-svg"
        role="img"
        aria-label={`Mapa con ${g.nNotas} notas unidas a sus etiquetas y secciones`}
        onPointerDown={(e) => abajo(e)}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={arriba}
      >
        <g transform={`translate(${tam.w / 2 + vista.x},${tam.h / 2 + vista.y}) scale(${vista.k})`}>
          {g.aristas.map((e, i) => (
            <line key={i} className={`mp-l${e.mencion ? " men" : ""}${sobre !== null && (e.a === sobre || e.b === sobre) ? " on" : sobre !== null ? " off" : ""}`} x1={g.nodos[e.a].x} y1={g.nodos[e.a].y} x2={g.nodos[e.b].x} y2={g.nodos[e.b].y} />
          ))}
          {g.nodos.map((n, i) => (
            <g key={n.id} className={`mp-nodo ${n.tipo}${cerca(i) ? "" : " off"}${i === sobre ? " on" : ""}`} transform={`translate(${n.x},${n.y})`} onPointerDown={(e) => abajo(e, i)} onPointerEnter={() => setSobre(i)} onPointerLeave={() => setSobre((s) => (s === i ? null : s))}>
              <circle r={n.r + 8} className="mp-toque" />
              <circle r={n.r} />
              {(n.tipo !== "nota" || vista.k > 1.5 || (sobre !== null && cerca(i))) && (
                <text y={n.r + 13} textAnchor="middle">{corto(n.label, n.tipo === "nota" ? 26 : 32)}</text>
              )}
            </g>
          ))}
        </g>
      </svg>
      <p className="mp-ayuda">Arrastra para mover · rueda del ratón para acercar · toca una nota para abrirla</p>
    </div>,
    document.body,
  );
}
