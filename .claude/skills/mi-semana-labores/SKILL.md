---
name: mi-semana-labores
description: Actualizar las labores de la iglesia de David (o cualquier compromiso con fecha) a partir de una captura de "Mi mes" de la app Labores Berlín.
---

# Labores y compromisos con fecha

Ya no viven en el código. Cada persona los guarda en su perfil (D1, tabla `items`, `tabla = 'perfil'`, `id = 'eventos'`):
`{"AAAA-MM-DD": [{"t": "Culto · Alabanza", "s": "18:30", "e": "20:30", "nota": "Púlpito"}]}`.

1. Lo normal: David sube la captura él mismo en **Perfil › Mis compromisos › Subir foto**. La IA la lee, él revisa y guarda.
2. Si te la manda a ti: lee la captura, arma los compromisos (hora del culto según sus reglas) y fusiónalos en su fila `perfil/eventos` con la herramienta D1 de Cloudflare (reemplaza solo las fechas de la captura). Nunca escribas sus datos en el repositorio (es público).
3. Si una etiqueta sale cortada y podría ser predicación, pregúntale.
4. Responde corto: qué fechas quedaron y que lo revise en Semana.
