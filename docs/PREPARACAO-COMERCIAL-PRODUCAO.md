# Preparação da atualização comercial para produção

Data: 16/09/2026. Implementação e validação exclusivamente em TEST. Sem commit, push, deploy ou alteração de produção.

## Correções

- Pedido Inteligente minimiza o saldo devedor total em centavos, preservando os critérios percentuais de entrada e parcela. O critério em reais vale também para a alternativa de saldo nas buscas sem segundo fator, os desempates e a poda. Ordenação por densidade permanece uma heurística de exploração, não a regra de escolha final. Faixa de crédito ±2%, entrada sugerida ±5%, separação por administradora, limites e avisos de resultado parcial preservados.
- Flags repetidas removidas. Quando uma combinação atende a vários critérios, os títulos são unidos no próprio cabeçalho para não ocultar a identificação das alternativas agrupadas.
- Máscara monetária restaura o cursor imediatamente e após o commit do React, sem depender de um próximo frame. Isso corrige a digitação rápida que podia mover o cursor para os centavos.
- Backend exige ao menos um documento por tipo de renda, assim como o editor.
- Atualização de configurações exige o `updatedAt` recebido no GET. Uma transação curta bloqueia somente a linha de configurações, confere a versão e grava uma versão estritamente mais nova. Duas sessões com a mesma versão produzem um sucesso e um HTTP 409, sem sobrescrita silenciosa. Nenhuma chamada externa dentro da transação. Sessões antigas devem recarregar antes de editar.
- Primeiro GET de configurações tolera criação concorrente da linha padrão.

## Migração e registros históricos

A única migration desta atualização continua sendo `drizzle/0013_bored_blink.sql`, já aplicada somente em TEST. Adiciona `app_settings.income_types` e `pre_analyses.required_documents_snapshot`, com preenchimento dos requisitos históricos conhecidos. Não foi reescrita após sua aplicação.

Antes de executar em produção, rodar `scripts/production-income-preflight.sql` em sessão autorizada somente leitura. Os dois contadores precisam ser zero. Se houver tipos históricos desconhecidos ou definições vazias/inválidas, interromper a liberação e homologar os requisitos corretos; não inventar documentos nem modificar dados reais sem autorização. A verificação TEST passou com os dois contadores em zero. Isso não comprova os valores de produção.

## Ordem da futura liberação

1. Aprovar o comportamento e o visual em TEST, incluindo menor saldo com/sem entrada sugerida, artes e celular.
2. Revisar o diff final e a lista de arquivos novos; excluir credenciais, `.local/`, backups e resultados temporários. Confirmar CI do commit final em Node 22.
3. Fazer backup atualizado de produção e testar restauração em banco isolado; registrar release anterior e configuração necessária para rollback.
4. Executar o pré-flight somente leitura de produção e confirmar os dois contadores zerados. Confirmar grants do runtime e credencial separada de migrations.
5. Aplicar migration 0013 pelo fluxo autorizado de migrations; atualizar a aplicação somente após sucesso. Não aplicar migration automaticamente por uma sessão local de TEST.
6. Conferir readiness e logs; smoke de autenticação/permissões, estoque, três critérios do Pedido Inteligente, cotação/cópia/card, cadastro e edição de renda, reserva/cancelamento/liberação, exportação e contato/foto do assessor.
7. Conferir operação FB, e-mail e Storage privado no ambiente correspondente. Esses serviços externos não foram homologados por esta sessão local.

## Rollback

Reverter o artefato da aplicação para a release anterior, mantendo inicialmente as novas colunas aditivas. Não remover colunas nem snapshots para reverter somente a aplicação. Se houver necessidade de restaurar o banco, usar o backup previamente validado em ambiente isolado e obter autorização para a janela de recuperação, considerando dados criados após o backup. A versão anterior pode editar configurações sem o novo controle de conflito e não cria snapshots em novos rascunhos: suspender essas edições durante o rollback até a correção ser reaplicada.

## Limites da validação

Resultados parciais de busca são alternativas encontradas dentro dos limites, não mínimos globais comprovados. A suite local e o banco TEST não comprovam capacidade para 200 usuários nem a restauração do banco real. Aprovação TEST, CI remoto do commit, backup/restauração e pré-flight de produção são gates de liberação; não são dispensados pelo build local.

## Resultado final da validação

- Node 22.23.2: suíte completa com integração PostgreSQL, 47 arquivos e 308 testes aprovados, zero falhas; um teste opcional de carga não executado. Executado pelo fluxo `scripts/test-admin.ps1 -Action integration`, com credencial TEST protegida e schemas descartáveis.
- `npm run check` aprovado, também executado pelo build em Node 22.
- `npm run build` aprovado em Node 22. Bundle principal 516,18 kB / 150,25 kB gzip. Avisos não impeditivos de tamanho e comentários Zod.
- E2E: 25 etapas aprovadas, sem exceções JavaScript; artefatos em `.local/e2e/23b43bd2-124d-4241-88ca-7d664520a5dd/`. A digitação de um milhão de reais foi exercitada caractere por caractere. HTTP 200/409 verificados em edições simultâneas reais e HTTP 400 para configuração sem documentos.
- Minimização do saldo comparada com enumeração exaustiva em estoques pequenos para todos os critérios, com/sem orçamento e saldos negativos. Caso de regressão confirma escolha de saldo R$ 79.000 em vez de R$ 81.000 mesmo quando a proporção saldo/crédito favorecia o segundo.
- Pré-flight somente leitura aprovado em TEST, dois contadores zerados. Nenhum pré-flight ou migration executado em produção.
- `git diff --check` aprovado; somente avisos LF/CRLF. Arquivos locais de credenciais/backup não identificados entre os arquivos novos elegíveis pelo Git.
- Health local: status ok, ambiente TEST, banco TEST, e-mails desabilitados.

Arquivos desta rodada: `server/stock/smart-options.ts`, `server/stock/smart-options.test.ts`, `client/src/pages/stock/SmartSearchModal.tsx`, `client/src/components/CurrencyInput.tsx`, `server/settings/routes.ts`, `shared/settings.ts`, `shared/income-catalog.ts`, `shared/income-catalog.test.ts`, `client/src/pages/SettingsPage.tsx`, `scripts/e2e-test.mjs`, `scripts/production-income-preflight.sql` e documentação comercial. A lista completa das alterações comerciais anteriores permanece no workspace e deve integrar a revisão final da RC.

Situação: código validado para Release Candidate; publicação condicionada à aprovação TEST, CI remoto do commit final, backup/restauração, pré-flight dos dados reais e confirmação dos serviços externos. Sem nova garantia de capacidade sob carga. Sem commit, push ou deploy automático.