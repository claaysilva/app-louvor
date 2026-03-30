# App Louvor

Aplicativo web para ministerio de louvor em modo local (autenticacao e dados no navegador).

## Estrutura

- index.html: estrutura da interface
- assets/css/styles.css: estilos
- assets/js/config.js: configuracao de conexao com banco (Supabase)
- assets/js/app.js: logica de negocio e sincronizacao de dados
- manifest.webmanifest: metadados PWA
- service-worker.js: cache offline
- DATABASE_SCHEMA.sql: tabelas e colunas necessarias no banco

## Funcionalidades

- Login e cadastro locais
- Sessao persistida no navegador (localStorage)
- Minhas musicas: adicionar, editar, remover, buscar
- Lista geral: buscar, detalhes, salvar/editar tom
- Lista geral com filtro por tom, ordenacao e paginacao
- Exportacao CSV das musicas pessoais
- Painel rapido com estatisticas
- Indicador online/offline
- Painel admin local para cadastro de usuarios e visao completa
- Setlists por culto (cadastro, edicao, associacao de musicas)
- Alerta de repeticao recente de musica em culto
- Exportacao de setlist para impressao/PDF
- Historico de acoes (auditoria local)
- PWA com cache offline e botao de instalacao
- Backup local em JSON (exportar/importar)
- Reset completo dos dados locais (com confirmacao)

## Execucao local

Basta abrir `index.html` no navegador.

## Deploy

Hospedavel como arquivo estatico (ex.: Vercel).

## Recursos de operacao

- Confirmacao customizada para exclusoes
- Suporte de teclado com foco visivel
- Tratamento padronizado de erros locais
- Ferramenta admin para mesclar musicas duplicadas

## Banco de dados (obrigatorio para persistencia central)

1. Execute o arquivo DATABASE_SCHEMA.sql no SQL Editor do Supabase.
2. Preencha assets/js/config.js com:
	- SUPA_URL
	- SUPA_KEY
3. Sem essa configuracao, o app cai para cache local temporario no navegador.

Tabelas/colunas criadas:
- profiles (id, nome, email, password, role, created_at)
- musicas (id, nome, link, criado_por, created_at, updated_at)
- ministrante_musicas (id, ministrante_id, musica_id, tom, observacoes, created_at, updated_at)
- cultos (id, title, date, reminder_at, created_by, created_at, updated_at, items jsonb)
- auditoria (id, action, details, target_type, target_id, user_id, user_email, created_at)

## Observacao importante

Com banco configurado, os dados sao sincronizados no Supabase e mantidos no localStorage apenas como cache.

## Escopo por fases

Veja o planejamento e status em ESCOPO_FASES.md.
