import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/** Permite instalar la app en Android ("Añadir a pantalla de inicio") */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Semana",
    short_name: "Mi Semana",
    description: "Tu día hora por hora, hábitos, segundo cerebro y tareas.",
    start_url: "/hoy",
    display: "standalone",
    background_color: "#eef2ee",
    theme_color: "#2c6a4c",
    lang: "es",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
