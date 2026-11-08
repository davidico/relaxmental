# Mi Semana

App personal de David: el día hora por hora según las labores de la iglesia, hábitos con rachas, segundo cerebro (ideas, profecías, predicaciones, notas) y tareas con "primer paso".

Hecha con **Next.js (App Router) + TypeScript**. Datos en **Supabase**; si Supabase no está configurado, guarda en el navegador.

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
  data.tsx          Carga y guarda datos (Supabase o navegador)
  habits.ts         Rachas y estadísticas
data/labores.json   Tus labores de la iglesia por fecha
supabase/schema.sql Tablas y seguridad de la base de datos
```

## Probarla en tu ordenador

```bash
npm install
npm run dev
# abre http://localhost:3000
```

## Publicarla (Vercel + Supabase)

1. **Supabase**: crea un proyecto en supabase.com → SQL Editor → pega `supabase/schema.sql` → Run.
   En *Authentication → URL Configuration* pon la dirección de tu web como *Site URL*.
2. **Vercel**: entra con tu cuenta de GitHub → *Add New Project* → elige este repo.
   En *Environment Variables* añade `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Supabase → Project Settings → API) → *Deploy*.
3. Cada `git push` a `main` publica la nueva versión sola.

## Instalar en Android

Abre la web en Chrome → menú ⋮ → **Añadir a pantalla de inicio**.

## Próximos pasos

- Notificaciones push en cada bloque del horario (service worker + Web Push + cron de Vercel).
- Editar el horario base desde la app.
- Importar las labores directamente desde Labores Berlín.
