# Mi Semana

App personal de David: el día hora por hora según las labores de la iglesia, hábitos con rachas, segundo cerebro (ideas, profecías, predicaciones, notas) y tareas con "primer paso".

Hecha con **Next.js (App Router) + TypeScript**, publicada en **Cloudflare Workers**, datos en **Cloudflare D1** e inicio de sesión con **Cloudflare Access**. Si no has iniciado sesión (o en `npm run dev`), guarda en el navegador.

## Estructura

```
app/
  layout.tsx        Marco común: fuentes, menú, proveedor de datos
  hoy/ semana/ habitos/ cerebro/ tareas/   Una carpeta = una página (ruta)
  manifest.ts       Para instalarla en Android como app
  globals.css       Diseño (modo claro/oscuro, móvil y escritorio)
components/         Piezas reutilizables (menú, línea de tiempo, tareas…)
lib/
  schedule.ts       Las reglas que arman tu día hora por hora  ← el corazón
  data.tsx          Carga y guarda datos (API de D1 o navegador)
  habits.ts         Rachas y estadísticas
data/labores.json   Tus labores de la iglesia por fecha
worker/index.ts     API (/api) que guarda en D1 y verifica el login de Access
migrations/        Tablas de la base de datos D1
wrangler.jsonc      Configuración de Cloudflare (web + API + D1 + Access)
```

## Probarla en tu ordenador

```bash
npm install
npm run dev
# abre http://localhost:3000
```

## Cómo se publica

Cloudflare Workers está conectado a este repo: cada `git push` a `main` ejecuta
`npm run build` (genera `out/`) y `npx wrangler deploy` (sube la web y la API).

- **Base de datos:** D1 `relaxmental-db` (tabla `items`, ver `migrations/0001_init.sql`).
- **Inicio de sesión:** Cloudflare Access delante del Worker. La API comprueba el token
  de Access (`ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` en `wrangler.jsonc`) y usa tu correo
  para separar los datos de cada persona.

### Activar Access (una vez)

1. Cloudflare → Workers & Pages → `relaxmental` → Settings → Domains & Routes →
   en `workers.dev` activa **Cloudflare Access**.
2. Copia el **AUD** y el dominio del equipo (`<algo>.cloudflareaccess.com`) a `vars` en `wrangler.jsonc`.
3. En Zero Trust → Access → Applications → la app → Policies, añade los correos que pueden entrar.

La primera vez que entras con Access, lo que tenías guardado en ese navegador se sube a D1.

## Instalar en Android

Abre la web en Chrome → menú ⋮ → **Añadir a pantalla de inicio**.

## Próximos pasos

- Notificaciones push en cada bloque del horario (service worker + Web Push + cron de Vercel).
- Editar el horario base desde la app.
- Importar las labores directamente desde Labores Berlín.
- Labores por persona (ahora `data/labores.json` es común).
