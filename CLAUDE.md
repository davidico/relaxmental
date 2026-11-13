# Mi Semana (relaxmental)

App personal de David para organizar su vida: plan del día hora por hora según sus labores en la iglesia, tareas con "primer paso", hábitos con rachas, segundo cerebro (notas con carpetas, editor rico y dictado por voz), avisos push y un perfil con reglas para que la IA arme la semana. David vive en Berlín, habla español y no es programador: respóndele en español, corto y sin jerga.

El repositorio es **público**: no subas datos personales de David (salud, familia, correos, rutina detallada) a archivos nuevos.

- Web: https://relaxmental.davidcueva-dico.workers.dev (detrás de Cloudflare Access: código por correo o cuenta de Cloudflare; sesión de 1 mes)
- Cada push a `main` lo publica solo Cloudflare Workers Builds (`npm run build` + `npx wrangler deploy`, 1–2 min). David quiere que sus cambios se publiquen: termina con commit y push a `main` salvo que pida otra cosa.
- Versión actual en `lib/version.ts` (sube 2.0 → 2.1… hasta 2.10; después de la .10 pasa a 3.0. Añade novedades en cada entrega). Se ve en Perfil › Acerca de.

## Stack
- Next.js 16 App Router + TypeScript, exportación estática (`output: "export"` → `out/`). Sin servidor de Next.
- `worker/index.ts`: Cloudflare Worker con la API `/api/*` (verifica el JWT de Access: no debilites esa verificación) y `scheduled()` cada minuto para los avisos. `worker/push.ts` (Web Push sin librerías), `worker/ai.ts` (Workers AI: Whisper para voz, Llama 3.3 para títulos y horario).
- D1 `relaxmental-db` (id 4641ebda-b1ae-450b-8ad4-d8bd42083550): tabla genérica `items(user_email, tabla, id, data, updated_at)` + `push_subs`, `push_config`, `push_sent`. Workers Builds NO aplica migraciones: si creas una en `migrations/`, hay que aplicarla aparte.
- Sin sesión la app guarda en localStorage (`mi-semana-v1`); así se prueba en local.

## Piezas clave
- `lib/plan.ts`: el horario de cada persona, sin nada fijo en el código: `perfil/plantilla` (semana tipo, la arma la IA con sus reglas en `/api/ai/plantilla`), `perfil/eventos` (compromisos con fecha: iglesia, turnos…; se suben con foto en Perfil › Mis compromisos vía `/api/ai/compromisos`) y `dias` (días ajustados a mano). `planDe()` lo junta; lo usan la app y los avisos del Worker.
- Perfil (D1 `items`, tabla `perfil`): `reglas`, `revision` (mes revisado), `plantilla`, `eventos`, `reglasRespaldo`. La app sirve para cualquiera: no escribas rutinas ni datos de nadie en el código.
- `app/hoy/page.tsx` (pantalla principal, diseñada en Claude Design), `app/cerebro`, `app/tareas`, `app/habitos`, `app/semana`, `app/perfil`.
- `components/QuickTask.tsx` (botón +), `VoiceButton.tsx`, `PushBanner.tsx`, `DayEditor.tsx`, `RichEditor.tsx`.
- Íconos: `public/icon.svg` y PNGs. El manifest apunta a los íconos en jsDelivr con un sha fijo (la app está detrás de Access y Android necesita íconos públicos): si cambian, commit, luego actualizar el sha en `public/manifest.webmanifest` y otro commit.

## Diseño
- Verde oliva oscuro `--primary #4a5524`, dorado `--gold #c9a548` (texto dorado `--gold-ink #84661a`), fondo marfil `#f5f4ee`, Plus Jakarta Sans. Tokens claro/oscuro en `app/globals.css` (al final está lo más nuevo).
- Buenas prácticas siempre: texto e inputs de 16px, objetivos de 44px, foco visible, errores con ícono + texto, contraste AA. David no quiere tener que señalar errores de UI: revísalos tú antes de publicar.
- Usa la skill `impeccable` (en `.claude/skills/`) para trabajo de diseño. Para pantallas nuevas, David puede pedir primero un diseño en Claude Design.

## Comprobar antes de publicar
- `npx tsc --noEmit -p .` y `npx next build`; Worker: `npx wrangler deploy --dry-run`.
- Capturas con Playwright sirviendo `out/` (URLs con `.html`) a 390×844 y 1280×900, también en modo oscuro.
- Commits con autor `David Cueva <davidcueva.dico@gmail.com>`.
