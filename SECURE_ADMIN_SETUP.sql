-- Configuracao segura de admin + RLS
-- Execute no SQL Editor do Supabase

alter table public.profiles
add column if not exists role text not null default 'user'
check (role in ('admin','user'));

create index if not exists idx_profiles_role on public.profiles(role);

-- Define seu usuario como admin
update public.profiles
set role = 'admin'
where lower(email) = 'claytonpetry1@gmail.com';

alter table public.profiles enable row level security;
alter table public.musicas enable row level security;
alter table public.ministrante_musicas enable row level security;

-- Limpeza opcional de policies antigas com os mesmos nomes

drop policy if exists profiles_read_self_or_admin on public.profiles;
drop policy if exists profiles_update_self_or_admin on public.profiles;
drop policy if exists musicas_read_all_auth on public.musicas;
drop policy if exists musicas_insert_all_auth on public.musicas;
drop policy if exists ministrante_read_self_or_admin on public.ministrante_musicas;
drop policy if exists ministrante_manage_self on public.ministrante_musicas;

-- IMPORTANTE:
-- Para evitar recursao infinita em RLS de profiles, NAO consultar public.profiles
-- dentro das policies da propria tabela.
-- Aqui, admin e identificado pelo e-mail do token JWT.

-- Profiles: cada um ve/edita o proprio; admin ve/edita todos
create policy profiles_read_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'claytonpetry1@gmail.com'
);

create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'claytonpetry1@gmail.com'
)
with check (
  id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'claytonpetry1@gmail.com'
);

-- Musicas: autenticados podem ler e inserir
create policy musicas_read_all_auth
on public.musicas
for select
to authenticated
using (true);

create policy musicas_insert_all_auth
on public.musicas
for insert
to authenticated
with check (true);

-- Ministrante_musicas: usuario ve o proprio, admin ve tudo
create policy ministrante_read_self_or_admin
on public.ministrante_musicas
for select
to authenticated
using (
  ministrante_id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'claytonpetry1@gmail.com'
);

-- Usuario comum gerencia apenas o proprio
create policy ministrante_manage_self
on public.ministrante_musicas
for all
to authenticated
using (ministrante_id = auth.uid())
with check (ministrante_id = auth.uid());
