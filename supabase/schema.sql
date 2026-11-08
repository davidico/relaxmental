-- Mi Semana · esquema de base de datos para Supabase
-- Pégalo en Supabase → SQL Editor → New query → Run.
-- Cada tabla tiene user_id y "Row Level Security": cada persona solo ve y cambia sus propias filas.
-- Así Gaby y Josué pueden tener su cuenta en la misma app sin ver tus datos.

create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  step text not null default '',
  area text not null default 'casa',
  due date,
  done boolean not null default false,
  created timestamptz not null default now()
);

create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'nota' check (kind in ('idea','profecia','predicacion','nota')),
  title text not null default '',
  text text not null,
  ref text not null default '',
  created timestamptz not null default now()
);

create table if not exists public.habitos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  area text not null default 'salud',
  orden int not null default 0,
  hechos jsonb not null default '{}'::jsonb,  -- {"2026-11-09": true, ...}
  created timestamptz not null default now()
);

-- Labores de la iglesia por fecha (se completan con data/labores.json del código)
create table if not exists public.labores (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  fecha date not null,
  roles text[] not null default '{}',
  primary key (user_id, fecha)
);

alter table public.tareas  enable row level security;
alter table public.notas   enable row level security;
alter table public.habitos enable row level security;
alter table public.labores enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tareas','notas','habitos','labores'] loop
    execute format('drop policy if exists "solo_mis_filas" on public.%I', t);
    execute format(
      'create policy "solo_mis_filas" on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
