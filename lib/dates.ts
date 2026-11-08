export const DOW = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> "AAAA-MM-DD" en hora local */
export const ds = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "AAAA-MM-DD" -> Date a mediodía (evita saltos por cambio de hora) */
export const pd = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
export const addD = (s: string, n: number) => {
  const d = pd(s);
  d.setDate(d.getDate() + n);
  return ds(d);
};
export const today = () => ds(new Date());
export const mondayOf = (s: string) => {
  const d = pd(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ds(d);
};
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fdate = (s: string) => {
  const d = pd(s);
  return `${d.getDate()} ${MES[d.getMonth()]}`;
};
export { pad };
