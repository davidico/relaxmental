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
7. Sube la versión en `lib/version.ts` y añade la novedad.
8. Commit (autor David Cueva) y push a `main`.
9. Si cambian los íconos: commit, actualiza el sha de jsDelivr en `public/manifest.webmanifest`, otro commit.
10. Responde a David en español, corto: qué cambió, cómo probarlo en el celular y qué no se pudo probar.
