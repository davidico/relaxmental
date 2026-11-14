import type { Tarea } from "./types";

/** Algo que se acaba de borrar y cómo recuperarlo */
export type Borrado = { texto: string; deshacer: () => void };

/** Avisa de un borrado: durante unos segundos sale abajo «Borraste … · Deshacer» */
export const avisarBorrado = (b: Borrado) => dispatchEvent(new CustomEvent<Borrado>("mi-semana:borrado", { detail: b }));

/** Borra una tarea o meta dejando la opción de deshacerlo */
export function borrarTarea(x: Tarea, save: (t: "tareas", x: Tarea) => void, remove: (t: "tareas", id: string) => void) {
  remove("tareas", x.id);
  avisarBorrado({ texto: x.title, deshacer: () => save("tareas", x) });
}
