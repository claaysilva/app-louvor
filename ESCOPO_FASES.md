# Escopo por Fases - App Louvor

## 1. Objetivo do app

Centralizar a gestao de musicas do ministerio de louvor com autenticacao, lista pessoal de tons por ministrante e consulta da lista geral.

## 2. Resumo do estado atual

## O que o app tem hoje

- Arquitetura separada por linguagem:
- HTML em index.html
- CSS em assets/css/styles.css
- JavaScript em assets/js/app.js
- Config em assets/js/config.js
- Integracao com Supabase (Auth + REST)
- Login e cadastro
- Sessao persistida em localStorage
- Minhas musicas: adicionar, editar, remover e buscar
- Lista geral: visualizar, buscar, abrir detalhe, salvar/editar tom
- Exportacao CSV de musicas pessoais
- Indicador online/offline
- Painel de estatisticas no topo
- Modais com fechamento por clique fora e tecla Esc

## O que foi feito nesta etapa

- Refatoracao de arquivo unico para estrutura modular
- Organizacao de configuracao separada para ambiente (config.js)
- Melhorias de UX (busca, feedback visual, toasts, indicadores)
- Melhorias de resiliencia (tentativa de refresh de sessao)
- Publicacao no repositorio remoto em branch main

## 3. Fases do projeto

## Fase 1 - Base funcional (Concluida)

Status: Concluida

Entregas:
- Estrutura front modular
- Login/cadastro/logout
- Navegacao Minhas/Geral
- CRUD de associacao ministrante-musica (com tom)
- Busca por nome
- Exportacao CSV

Checklist de testes da fase:
- Cadastro e login com usuario valido
- Sessao persistida apos recarregar pagina
- Adicionar/editar/remover musica em Minhas
- Salvar/editar tom pela Lista Geral
- Busca funcionando em Minhas e Geral
- Exportacao CSV gerando arquivo valido

## Fase 2 - Hardening e qualidade (Proxima)

Status: Planejada

Entregas propostas:
- Paginação na lista geral
- Skeleton/loading states mais ricos
- Confirmacao custom de exclusao (substituir confirm nativo)
- Tratamento de erros por codigo (401, 409, 500)
- Reforco de sanitizacao e seguranca de renderizacao
- Revisao de acessibilidade (foco, contraste, aria-label)

Checklist de testes da fase:
- Testar pagina com alto volume de musicas
- Simular falhas de rede e validar mensagens
- Validar navegacao por teclado
- Garantir ausencia de regressao no CRUD

## Fase 3 - Dados e regras avancadas

Status: Planejada

Entregas propostas:
- Filtro por tom
- Ordenacao configuravel (nome, data, com tom)
- Edicao de nome de musica com fluxo seguro para evitar duplicatas
- Historico basico de alteracoes por usuario

Checklist de testes da fase:
- Filtros combinados por nome e tom
- Ordenacao consistente entre recargas
- Regras de duplicidade respeitadas no banco
- Logs/historico exibindo alteracoes corretas

## Fase 4 - Operacao de culto

Status: Planejada

Entregas propostas:
- Cadastro de setlist por culto (data + dia)
- Associacao de musicas ao culto
- Historico de louvores por culto
- Alertas de repeticao recente

Checklist de testes da fase:
- Criacao/edicao/exclusao de setlist
- Associacao e remocao de musicas no culto
- Consulta historica por periodo
- Alertas coerentes com regras definidas

## Fase 5 - Admin e governanca

Status: Planejada

Entregas propostas:
- Painel admin para usuarios e musicas
- Permissoes por perfil (admin x ministrante)
- Auditoria de acoes criticas
- Ferramentas de manutencao de base (merge de duplicatas)

Checklist de testes da fase:
- Permissoes bloqueando acesso indevido
- Fluxo admin sem afetar experiencia do ministrante
- Auditoria registrando operacoes criticas

## Fase 6 - Produto expandido

Status: Planejada

Entregas propostas:
- PWA instalavel
- Cache offline de leitura
- Exportacao PDF de setlist
- Notificacoes de lembretes de culto

Checklist de testes da fase:
- Instalacao PWA em Android e iOS
- Modo offline para consultas recentes
- Exportacao PDF com layout consistente
- Notificacoes sendo disparadas no horario correto

## 4. Priorizacao sugerida (curto prazo)

1. Executar Fase 2 completa
2. Iniciar Fase 4 (setlist por culto)
3. Consolidar Fase 3 (filtros e ordenacao)

## 5. Criterio de conclusao por fase

Uma fase so e considerada concluida quando:
- Todas as entregas da fase foram implementadas
- Checklist de testes da fase foi executado
- Nao ha regressao nas funcionalidades da Fase 1
