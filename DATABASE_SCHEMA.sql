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

-- Migração para bancos que já tinham tabelas criadas sem todas as colunas.
alter table public.profiles add column if not exists nome text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists password text;
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists created_at timestamptz default now();

alter table public.musicas add column if not exists nome text;
alter table public.musicas add column if not exists link text;
alter table public.musicas add column if not exists criado_por uuid;
alter table public.musicas add column if not exists created_at timestamptz default now();
alter table public.musicas add column if not exists updated_at timestamptz;

alter table public.ministrante_musicas add column if not exists ministrante_id uuid;
alter table public.ministrante_musicas add column if not exists musica_id uuid;
alter table public.ministrante_musicas add column if not exists tom text;
alter table public.ministrante_musicas add column if not exists observacoes text;
alter table public.ministrante_musicas add column if not exists created_at timestamptz default now();
alter table public.ministrante_musicas add column if not exists updated_at timestamptz;

alter table public.cultos add column if not exists title text;
alter table public.cultos add column if not exists date date;
alter table public.cultos add column if not exists reminder_at timestamptz;
alter table public.cultos add column if not exists created_by uuid;
alter table public.cultos add column if not exists created_at timestamptz default now();
alter table public.cultos add column if not exists updated_at timestamptz;
alter table public.cultos add column if not exists items jsonb default '[]'::jsonb;

alter table public.auditoria add column if not exists action text;
alter table public.auditoria add column if not exists details text;
alter table public.auditoria add column if not exists target_type text;
alter table public.auditoria add column if not exists target_id text;
alter table public.auditoria add column if not exists user_id uuid;
alter table public.auditoria add column if not exists user_email text;
alter table public.auditoria add column if not exists created_at timestamptz default now();

-- Ajustes de compatibilidade para bancos ja existentes.
-- Esse bloco tenta alinhar defaults, constraints e FKs sem recriar tabelas.

-- Defaults e normalizacao de dados obrigatorios.
alter table public.profiles alter column created_at set default now();
update public.profiles set created_at = now() where created_at is null;

alter table public.profiles alter column role set default 'user';
update public.profiles set role = 'user' where role is null;

alter table public.musicas alter column created_at set default now();
update public.musicas set created_at = now() where created_at is null;

alter table public.ministrante_musicas alter column created_at set default now();
update public.ministrante_musicas set created_at = now() where created_at is null;

alter table public.cultos alter column created_at set default now();
update public.cultos set created_at = now() where created_at is null;

alter table public.cultos alter column items set default '[]'::jsonb;
update public.cultos set items = '[]'::jsonb where items is null;

alter table public.auditoria alter column created_at set default now();
update public.auditoria set created_at = now() where created_at is null;

-- Alinha regra de negocio usada no app: tom pode ser nulo.
alter table public.ministrante_musicas alter column tom drop not null;

-- Reforca NOT NULL quando houver dados suficientes para isso.
do $$
begin
  if not exists (select 1 from public.profiles where created_at is null) then
    alter table public.profiles alter column created_at set not null;
  else
    raise notice 'profiles.created_at ainda possui nulos; NOT NULL nao aplicado';
  end if;

  if not exists (select 1 from public.profiles where role is null) then
    alter table public.profiles alter column role set not null;
  else
    raise notice 'profiles.role ainda possui nulos; NOT NULL nao aplicado';
  end if;

  if not exists (select 1 from public.musicas where created_at is null) then
    alter table public.musicas alter column created_at set not null;
  else
    raise notice 'musicas.created_at ainda possui nulos; NOT NULL nao aplicado';
  end if;

  if not exists (select 1 from public.ministrante_musicas where created_at is null) then
    alter table public.ministrante_musicas alter column created_at set not null;
  else
    raise notice 'ministrante_musicas.created_at ainda possui nulos; NOT NULL nao aplicado';
  end if;

  if not exists (select 1 from public.cultos where created_at is null) then
    alter table public.cultos alter column created_at set not null;
  else
    raise notice 'cultos.created_at ainda possui nulos; NOT NULL nao aplicado';
  end if;

  if not exists (select 1 from public.cultos where items is null) then
    alter table public.cultos alter column items set not null;
  else
    raise notice 'cultos.items ainda possui nulos; NOT NULL nao aplicado';
  end if;

  if not exists (select 1 from public.auditoria where created_at is null) then
    alter table public.auditoria alter column created_at set not null;
  else
    raise notice 'auditoria.created_at ainda possui nulos; NOT NULL nao aplicado';
  end if;
end $$;

-- Unique de email em profiles (somente se nao houver duplicados).
do $$
begin
  if exists (
    select email
    from public.profiles
    where email is not null
    group by email
    having count(*) > 1
  ) then
    raise notice 'profiles.email possui duplicados; UNIQUE nao aplicado';
  elsif not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_key'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_email_key unique (email);
  end if;
end $$;

-- Check de role em profiles.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role = any (array['admin'::text, 'user'::text]));
  end if;
end $$;

-- Remover UNIQUE(nome) se existir, para permitir nomes repetidos de musicas.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'musicas_nome_key'
      and conrelid = 'public.musicas'::regclass
  ) then
    alter table public.musicas drop constraint musicas_nome_key;
  end if;
end $$;

-- REMOVER FK profiles -> auth.users (criada por Supabase Auth, bloqueia sync local).
do $$
begin
  if exists (
    select 1
    from information_schema.referential_constraints
    where constraint_name = 'profiles_id_fkey'
      and constraint_schema = 'public'
  ) then
    alter table public.profiles drop constraint profiles_id_fkey cascade;
  end if;
end $$;

-- Constraints de relacionamento/unicidade para garantir integridade.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_id_fkey cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'musicas_criado_por_fkey'
      and conrelid = 'public.musicas'::regclass
  ) then
    alter table public.musicas
      add constraint musicas_criado_por_fkey
      foreign key (criado_por) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ministrante_musicas_ministrante_id_fkey'
      and conrelid = 'public.ministrante_musicas'::regclass
  ) then
    alter table public.ministrante_musicas
      add constraint ministrante_musicas_ministrante_id_fkey
      foreign key (ministrante_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ministrante_musicas_musica_id_fkey'
      and conrelid = 'public.ministrante_musicas'::regclass
  ) then
    alter table public.ministrante_musicas
      add constraint ministrante_musicas_musica_id_fkey
      foreign key (musica_id) references public.musicas(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ministrante_musicas_ministrante_id_musica_id_key'
      and conrelid = 'public.ministrante_musicas'::regclass
  ) then
    alter table public.ministrante_musicas
      add constraint ministrante_musicas_ministrante_id_musica_id_key
      unique (ministrante_id, musica_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'cultos_created_by_fkey'
      and conrelid = 'public.cultos'::regclass
  ) then
    alter table public.cultos
      add constraint cultos_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'auditoria_user_id_fkey'
      and conrelid = 'public.auditoria'::regclass
  ) then
    alter table public.auditoria
      add constraint auditoria_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists idx_profiles_role on public.profiles using btree (role);

-- Para facilitar desenvolvimento sem Auth Supabase ativo:
-- Desative RLS (ou crie policies permissivas) nessas tabelas.
alter table public.profiles disable row level security;
alter table public.musicas disable row level security;
alter table public.ministrante_musicas disable row level security;
alter table public.cultos disable row level security;
alter table public.auditoria disable row level security;

-- Permissoes para uso com anon key no frontend.
grant usage on schema public to anon, authenticated;
grant all privileges on table public.profiles to anon, authenticated;
grant all privileges on table public.musicas to anon, authenticated;
grant all privileges on table public.ministrante_musicas to anon, authenticated;
grant all privileges on table public.cultos to anon, authenticated;
grant all privileges on table public.auditoria to anon, authenticated;

-- NUNCA use service_role key no frontend.
-- service_role deve ficar apenas no backend (Edge Function / API).
