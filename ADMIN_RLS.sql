-- Execute este script no SQL Editor do Supabase
-- Objetivo: permitir que o admin (email fixo) visualize tudo
-- mantendo os demais usuarios restritos aos proprios dados.

-- 1) Garantir RLS ativo
alter table public.profiles enable row level security;
alter table public.musicas enable row level security;
alter table public.ministrante_musicas enable row level security;

-- 2) Policies de leitura admin em ministrante_musicas
-- Ajuste: email do admin fixo

drop policy if exists "admin_read_all_ministrante_musicas" on public.ministrante_musicas;
create policy "admin_read_all_ministrante_musicas"
on public.ministrante_musicas
for select
to authenticated
using ((auth.jwt() ->> 'email') = 'claytonpetry1@gmail.com');

-- 3) Policies recomendadas para usuarios comuns (se ainda nao existirem)
-- Leia e adapte ao seu banco antes de executar se ja tiver politicas com outros nomes.

drop policy if exists "user_read_own_ministrante_musicas" on public.ministrante_musicas;
create policy "user_read_own_ministrante_musicas"
on public.ministrante_musicas
for select
to authenticated
using (ministrante_id = auth.uid());

drop policy if exists "user_manage_own_ministrante_musicas" on public.ministrante_musicas;
create policy "user_manage_own_ministrante_musicas"
on public.ministrante_musicas
for all
to authenticated
using (ministrante_id = auth.uid())
with check (ministrante_id = auth.uid());

-- 4) Leitura global de musicas para autenticados

drop policy if exists "all_auth_read_musicas" on public.musicas;
create policy "all_auth_read_musicas"
on public.musicas
for select
to authenticated
using (true);

-- 5) Insercao de musicas por autenticados

drop policy if exists "all_auth_insert_musicas" on public.musicas;
create policy "all_auth_insert_musicas"
on public.musicas
for insert
to authenticated
with check (true);
