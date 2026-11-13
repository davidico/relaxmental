/** Achica una foto en el teléfono (máx. 1400 px) y la devuelve como data URL JPEG */
export async function achicar(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

/** Pide a la IA la semana tipo (un día típico por cada día de la semana) */
export async function armarPlantilla(reglas: string) {
  const r = await fetch("/api/ai/plantilla", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reglas }) });
  if (!r.ok) throw new Error(String(r.status));
  return ((await r.json()) as { plantilla: Record<string, unknown[]> }).plantilla;
}
