---
name: mi-semana-cambio
description: Hacer y publicar un cambio en la app Mi Semana: buenas prácticas UX/UI, revisión con capturas, versión y despliegue.
---

# Cambio en Mi Semana

Lee CLAUDE.md primero.

1. `git pull`.
2. Antes de construir, revisa las buenas prácticas UX/UI de lo que vas a hacer; para diseño usa la skill `impeccable`.
3. Respeta los tokens de `app/globals.css` (oliva + dorado, claro y oscuro).
4. Construye. Si tocas la base de datos, migración en `migrations/` y aplícala a D1 aparte.
5. `npx tsc --noEmit -p .`, `npx next build`, y `npx wrangler deploy --dry-run` si tocaste el Worker.
6. Capturas con Playwright a 390×844 y 1280×900 y en modo oscuro; arregla lo que se vea mal antes de publicar.
   - Prueba con datos reales: títulos largos (3–4 líneas), muchas tareas, listas vacías, y la app con sesión (modo nube), no solo el modo navegador.
   - Mira cada captura con lupa, elemento por elemento, con esta lista:
     - Círculos y casillas redondos/cuadrados de verdad (mide ancho = alto) y el texto centrado dentro (mide el centro del texto contra el del círculo, también en el elemento de hoy o el elegido).
     - Nombres de clase CSS nuevos con prefijo propio: hay clases viejas genéricas (p. ej. `.hoy`) que rompen el diseño si se reutilizan.
     - Botones con aire: nunca pegados al texto de arriba o de abajo (≥ 12 px).
     - Íconos centrados; flechas de los desplegables con margen del borde.
     - Nada tapado por el botón + ni por la barra de abajo.
     - Textos que se cortan o se salen; colores que no son de la paleta.
     - Mensajes neutros en gris, éxito en verde, error en rojo con ícono.
7. Sube la versión en `lib/version.ts` y añade la novedad.
8. Commit (autor David Cueva) y push a `main`.
9. Si cambian los íconos: commit, actualiza el sha de jsDelivr en `public/manifest.webmanifest`, otro commit.
10. Responde a David en español, corto: qué cambió, cómo probarlo en el celular y qué no se pudo probar.
