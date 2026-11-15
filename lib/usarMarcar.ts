"use client";

import { useData } from "./data";
import { habitoDeTarea, marcarHabito } from "./habits";
import type { Tarea } from "./types";

/**
 * Marcar una tarea (o desmarcarla). Si cuenta para un hábito (elegido o reconocido por su nombre),
 * el hábito se marca también ese día: así los hábitos que pones en tu día se cuentan solos.
 */
export function useMarcarTarea() {
  const { habitos, save } = useData();
  return (x: Tarea, hecho = !x.done) => {
    save("tareas", { ...x, done: hecho });
    const h = x.due ? habitoDeTarea(x, habitos) : undefined;
    if (h) save("habitos", marcarHabito(h, x.due, hecho));
  };
}
