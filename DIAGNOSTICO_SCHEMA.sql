-- App Louvor - Diagnostico de schema (somente leitura)
-- Execute no SQL Editor do Supabase para validar divergencias.

-- 1) Colunas esperadas ausentes
with expected_columns as (
  select * from (values
    ('profiles','id','uuid',false),
    ('profiles','nome','text',false),
    ('profiles','email','text',false),
    ('profiles','password','text',true),
    ('profiles','role','text',false),
    ('profiles','created_at','timestamp with time zone',false),

    ('musicas','id','uuid',false),
    ('musicas','nome','text',false),
    ('musicas','link','text',true),
    ('musicas','criado_por','uuid',true),
    ('musicas','created_at','timestamp with time zone',false),
    ('musicas','updated_at','timestamp with time zone',true),

    ('ministrante_musicas','id','uuid',false),
    ('ministrante_musicas','ministrante_id','uuid',false),
    ('ministrante_musicas','musica_id','uuid',false),
    ('ministrante_musicas','tom','text',true),
    ('ministrante_musicas','observacoes','text',true),
    ('ministrante_musicas','created_at','timestamp with time zone',false),
    ('ministrante_musicas','updated_at','timestamp with time zone',true),

    ('cultos','id','uuid',false),
    ('cultos','title','text',false),
    ('cultos','date','date',false),
    ('cultos','reminder_at','timestamp with time zone',true),
    ('cultos','created_by','uuid',true),
    ('cultos','created_at','timestamp with time zone',false),
    ('cultos','updated_at','timestamp with time zone',true),
    ('cultos','items','jsonb',false),

    ('auditoria','id','uuid',false),
    ('auditoria','action','text',false),
    ('auditoria','details','text',true),
    ('auditoria','target_type','text',true),
    ('auditoria','target_id','text',true),
    ('auditoria','user_id','uuid',true),
    ('auditoria','user_email','text',true),
    ('auditoria','created_at','timestamp with time zone',false)
  ) as t(table_name, column_name, expected_type, expected_nullable)
),
actual_columns as (
  select
    c.table_name,
    c.column_name,
    c.data_type,
    (c.is_nullable = 'YES') as is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
)
select
  e.table_name,
  e.column_name,
  e.expected_type,
  e.expected_nullable,
  a.data_type as actual_type,
  a.is_nullable as actual_nullable,
  case
    when a.column_name is null then 'MISSING_COLUMN'
    when lower(a.data_type) <> lower(e.expected_type) then 'TYPE_MISMATCH'
    when a.is_nullable <> e.expected_nullable then 'NULLABILITY_MISMATCH'
    else 'OK'
  end as status
from expected_columns e
left join actual_columns a
  on a.table_name = e.table_name
 and a.column_name = e.column_name
where a.column_name is null
   or lower(a.data_type) <> lower(e.expected_type)
   or a.is_nullable <> e.expected_nullable
order by e.table_name, e.column_name;

-- 2) Constraints esperadas ausentes
with expected_constraints as (
  select * from (values
    ('profiles','profiles_pkey','PRIMARY KEY'),
    ('profiles','profiles_email_key','UNIQUE'),
    ('profiles','profiles_role_check','CHECK'),

    ('musicas','musicas_pkey','PRIMARY KEY'),
    ('musicas','musicas_criado_por_fkey','FOREIGN KEY'),

    ('ministrante_musicas','ministrante_musicas_pkey','PRIMARY KEY'),
    ('ministrante_musicas','ministrante_musicas_ministrante_id_musica_id_key','UNIQUE'),
    ('ministrante_musicas','ministrante_musicas_ministrante_id_fkey','FOREIGN KEY'),
    ('ministrante_musicas','ministrante_musicas_musica_id_fkey','FOREIGN KEY'),

    ('cultos','cultos_pkey','PRIMARY KEY'),
    ('cultos','cultos_created_by_fkey','FOREIGN KEY'),

    ('auditoria','auditoria_pkey','PRIMARY KEY'),
    ('auditoria','auditoria_user_id_fkey','FOREIGN KEY')
  ) as t(table_name, constraint_name, constraint_type)
)
select
  e.table_name,
  e.constraint_name,
  e.constraint_type,
  case when tc.constraint_name is null then 'MISSING_CONSTRAINT' else 'OK' end as status
from expected_constraints e
left join information_schema.table_constraints tc
  on tc.table_schema = 'public'
 and tc.table_name = e.table_name
 and tc.constraint_name = e.constraint_name
 and tc.constraint_type = e.constraint_type
where tc.constraint_name is null
order by e.table_name, e.constraint_name;

-- 3) Defaults esperados ausentes (created_at e items)
with expected_defaults as (
  select * from (values
    ('profiles','created_at','now()'),
    ('profiles','role','''user''::text'),
    ('musicas','created_at','now()'),
    ('ministrante_musicas','created_at','now()'),
    ('cultos','created_at','now()'),
    ('cultos','items','''[]''::jsonb'),
    ('auditoria','created_at','now()')
  ) as t(table_name, column_name, expected_default_fragment)
)
select
  e.table_name,
  e.column_name,
  e.expected_default_fragment,
  c.column_default,
  case
    when c.column_default is null then 'MISSING_DEFAULT'
    when position(lower(e.expected_default_fragment) in lower(c.column_default)) = 0 then 'DEFAULT_MISMATCH'
    else 'OK'
  end as status
from expected_defaults e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
where c.column_default is null
   or position(lower(e.expected_default_fragment) in lower(c.column_default)) = 0
order by e.table_name, e.column_name;

-- 4) Duplicidade de email que impediria UNIQUE em profiles.email
select email, count(*) as total
from public.profiles
where email is not null
group by email
having count(*) > 1
order by total desc, email;

-- 5) Orfaos que impedem criacao de FKs
select 'musicas.criado_por -> profiles.id' as regra, count(*) as orfaos
from public.musicas m
where m.criado_por is not null
  and not exists (
    select 1 from public.profiles p where p.id = m.criado_por
  )
union all
select 'ministrante_musicas.ministrante_id -> profiles.id' as regra, count(*) as orfaos
from public.ministrante_musicas mm
where not exists (
  select 1 from public.profiles p where p.id = mm.ministrante_id
)
union all
select 'ministrante_musicas.musica_id -> musicas.id' as regra, count(*) as orfaos
from public.ministrante_musicas mm
where not exists (
  select 1 from public.musicas m where m.id = mm.musica_id
)
union all
select 'cultos.created_by -> profiles.id' as regra, count(*) as orfaos
from public.cultos c
where c.created_by is not null
  and not exists (
    select 1 from public.profiles p where p.id = c.created_by
  )
union all
select 'auditoria.user_id -> profiles.id' as regra, count(*) as orfaos
from public.auditoria a
where a.user_id is not null
  and not exists (
    select 1 from public.profiles p where p.id = a.user_id
  );

-- 6) Status de RLS nas tabelas
select schemaname, tablename, rowsecurity as rls_ativo
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','musicas','ministrante_musicas','cultos','auditoria')
order by tablename;

-- 7) Indice recomendado em profiles(role)
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'profiles'
  and indexname = 'idx_profiles_role';
