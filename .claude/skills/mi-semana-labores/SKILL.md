---
name: mi-semana-labores
description: Actualizar las labores de la iglesia de David a partir de una captura de "Mi mes" de la app Labores Berlín.
---

# Labores desde captura

Las labores viven en `data/labores.json`: `{"dias": {"AAAA-MM-DD": ["Púlpito", "Puerta"]}, "actualizado": "AAAA-MM-DD", "fuente": "Labores Berlín (captura de Mi mes)"}`.

1. `git pull`.
2. Lee la captura día por día. Púlpi… = Púlpito, Micr… = Micrófonos, Puerta. Si el detalle dice "inicia", escribe "Púlpito (inicia)".
3. Si una etiqueta cortada puede ser predicación ("Predi…"), pregunta a David: la predicación cambia el horario.
4. Escribe el mes completo (reemplaza ese mes, conserva los demás) y actualiza `actualizado`.
5. Revisa con `scheduleFor` de `lib/schedule.ts` qué días quedan de ejercicio, púlpito y predicación.
6. `npx next build`, commit y push a `main`.
7. Dile a David cuántos días con labor quedaron y qué cambia en su semana.
