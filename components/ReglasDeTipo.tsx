"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import type { Plantilla } from "@/lib/plan";
import ReglasEditor from "./ReglasEditor";

/**
 * Poner las reglas al día con la semana tipo: la IA las reescribe (`/api/ai/reglas-tipo`) y la persona las revisa a pantalla
 * completa antes de guardarlas; al guardar queda una copia de las de antes en `perfil/reglasRespaldo`.
 * Se usa en «Mi semana tipo» y en «Lo que la IA sabe de mí». Devuelve el estado, `pedir()` y el editor para pintarlo.
 */
export function useReglasDeTipo() {
  const { perfil, savePerfil } = useData();
  const [estado, setEstado] = useState<"" | "armando" | "error">("");
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  /** Con `plantilla` la IA lee justo esa (recién guardada); sin ella, la que hay guardada */
  const pedir = async (plantilla?: Plantilla) => {
    setEstado("armando");
    setOk(false);
    try {
      const r = await fetch("/api/ai/reglas-tipo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plantilla ? { plantilla } : {}) });
      if (!r.ok) throw new Error();
      const { reglas } = (await r.json()) as { reglas?: string };
      if (!reglas?.trim()) throw new Error();
      setPropuesta(reglas.trim());
      setEstado("");
    } catch {
      setEstado("error");
    }
  };
  const guardar = (texto: string) => {
    const antes = perfil.reglas?.text ?? "";
    if (antes.trim()) savePerfil("reglasRespaldo", { text: antes, updated: new Date().toISOString() });
    savePerfil("reglas", { text: texto, updated: new Date().toISOString() });
    savePerfil("revision", { mes: new Date().toISOString().slice(0, 7) });
    /* Ya están al día con la semana tipo: se deja de ofrecer hasta que la semana vuelva a cambiar */
    savePerfil("tipoCambiada", null);
    setOk(true);
  };
  const editor = propuesta !== null ? <ReglasEditor texto={perfil.reglas?.text ?? ""} propuesta={propuesta} onGuardar={guardar} onClose={() => setPropuesta(null)} /> : null;
  return { estado, ok, pedir, editor };
}
