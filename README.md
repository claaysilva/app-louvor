# App Louvor

Aplicativo web para ministerio de louvor com Supabase Auth + Postgres.

## Estrutura

- index.html: estrutura da interface
- assets/css/styles.css: estilos
- assets/js/config.js: configuracao do Supabase
- assets/js/app.js: logica de negocio

## Funcionalidades

- Login e cadastro
- Sessao persistida no navegador
- Minhas musicas: adicionar, editar, remover, buscar
- Lista geral: buscar, detalhes, salvar/editar tom
- Exportacao CSV das musicas pessoais
- Painel rapido com estatisticas
- Indicador online/offline

## Execucao local

Basta abrir `index.html` no navegador.

## Deploy

Hospedavel como arquivo estatico ou via Supabase Edge Function.

## SQL de RLS para admin

Arquivo de apoio: ADMIN_RLS.sql

Use no SQL Editor do Supabase para liberar visao total ao admin e manter os demais restritos aos proprios dados.

## Setup seguro de admin (recomendado)

Arquivo principal: SECURE_ADMIN_SETUP.sql

1. Execute SECURE_ADMIN_SETUP.sql no SQL Editor do Supabase.
2. Isso adiciona a coluna role em profiles e define o admin por e-mail.

## Edge Function para cadastro por admin

Pasta da funcao: supabase/functions/admin-create-user/index.ts

Deploy sugerido:

1. supabase functions deploy admin-create-user
2. supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SEU_SERVICE_ROLE_KEY

Observacao:

- O frontend chama essa funcao para criar usuarios de forma segura.
- Evita expor service role key no navegador.

## Escopo por fases

Veja o planejamento e status em ESCOPO_FASES.md.
