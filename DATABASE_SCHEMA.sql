-- App Louvor - Schema para persistencia completa em banco (Supabase/Postgres)
-- Execute este arquivo no SQL Editor.

create table if not exists public.profiles (
  id uuid primary key,
  nome text not null,
  email text not null unique,
  password text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.musicas (
  id uuid primary key,
  nome text not null,
  link text null,
  criado_por uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table if not exists public.ministrante_musicas (
  id uuid primary key,
  ministrante_id uuid not null references public.profiles(id) on delete cascade,
  musica_id uuid not null references public.musicas(id) on delete cascade,
  tom text null,
  observacoes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  unique (ministrante_id, musica_id)
);

create table if not exists public.cultos (
  id uuid primary key,
  title text not null,
  date date not null,
  reminder_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null,
  items jsonb not null default '[]'::jsonb
);

create table if not exists public.auditoria (
  id uuid primary key,
  action text not null,
  details text null,
  target_type text null,
  target_id text null,
  user_id uuid null references public.profiles(id) on delete set null,
  user_email text null,
  created_at timestamptz not null default now()
);

-- Para facilitar desenvolvimento sem Auth Supabase ativo:
-- Desative RLS (ou crie policies permissivas) nessas tabelas.
alter table public.profiles disable row level security;
alter table public.musicas disable row level security;
alter table public.ministrante_musicas disable row level security;
alter table public.cultos disable row level security;
alter table public.auditoria disable row level security;
