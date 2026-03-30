# App Louvor

Aplicativo web para ministerio de louvor em modo local (autenticacao e dados no navegador).

## Estrutura

- index.html: estrutura da interface
- assets/css/styles.css: estilos
- assets/js/app.js: logica de negocio e autenticacao local

## Funcionalidades

- Login e cadastro locais
- Sessao persistida no navegador (localStorage)
- Minhas musicas: adicionar, editar, remover, buscar
- Lista geral: buscar, detalhes, salvar/editar tom
- Exportacao CSV das musicas pessoais
- Painel rapido com estatisticas
- Indicador online/offline
- Painel admin local para cadastro de usuarios e visao completa

## Execucao local

Basta abrir `index.html` no navegador.

## Deploy

Hospedavel como arquivo estatico (ex.: Vercel).

## Observacao importante

No modo atual, usuarios e senhas ficam no localStorage do navegador (apenas para uso temporario/local).

## Escopo por fases

Veja o planejamento e status em ESCOPO_FASES.md.
