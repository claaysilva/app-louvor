# App Louvor

Aplicativo web para ministerio de louvor em modo local (autenticacao e dados no navegador).

## Estrutura

- index.html: estrutura da interface
- assets/css/styles.css: estilos
- assets/js/app.js: logica de negocio e autenticacao local
- manifest.webmanifest: metadados PWA
- service-worker.js: cache offline

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

## Execucao local

Basta abrir `index.html` no navegador.

## Deploy

Hospedavel como arquivo estatico (ex.: Vercel).

## Recursos de operacao

- Confirmacao customizada para exclusoes
- Suporte de teclado com foco visivel
- Tratamento padronizado de erros locais
- Ferramenta admin para mesclar musicas duplicadas

## Observacao importante

No modo atual, usuarios e senhas ficam no localStorage do navegador (apenas para uso temporario/local).

## Escopo por fases

Veja o planejamento e status em ESCOPO_FASES.md.
