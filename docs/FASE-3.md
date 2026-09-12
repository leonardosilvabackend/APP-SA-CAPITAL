# FASE 3 — evolução operacional

Status: **concluída em development/TEST**. Nenhum deploy ou acesso a produção fez parte desta fase local.

## Objetivo

Organizar os componentes extensos da interface, disponibilizar a auditoria para a administração e evoluir relatórios e automações conforme evidências do uso real.

## Marcos

### 1. Consulta administrativa da auditoria — validado

- rota paginada e somente leitura em `/api/audit`;
- autorização exclusiva de administrador validada no backend;
- busca limitada por ação, responsável ou ID da entidade;
- tela administrativa com histórico e detalhes de cada evento;
- nenhum dado de auditoria pode ser alterado pela interface.

Validação informada em 12/09/2026: 33 arquivos e 180 testes aprovados, 28 ignorados e nenhuma falha.

### 2. Organização da interface — concluído

- medir tamanho, acoplamento e frequência de mudança dos componentes atuais;
- separar primeiro os módulos com maior custo de manutenção, preservando comportamento e permissões;
- manter os componentes compartilhados de paginação, modais e seleção consistentes.

Medição inicial: `StockPage.tsx` concentra o maior volume em bytes e responsabilidades; `AdministradorasPage.tsx` tinha o maior número de linhas; `App.tsx` e `NegotiationsPage.tsx` aparecem na sequência. O primeiro corte separou o formulário, validação de arquivos e envio de administradoras em `pages/administrators/AdministratorFormModal.tsx`, removendo estado e efeitos próprios do componente de listagem sem alterar endpoints, permissões ou apresentação.

No segundo corte, o card de oportunidades saiu da coordenação do estoque e passou para `pages/stock/StockOpportunitiesModal.tsx`. Os contratos do módulo e o cliente da API foram centralizados em `pages/stock/contracts.ts`, preparando a extração independente do formulário, importação e Pedido Inteligente sem espalhar tipos ou chamadas HTTP. A seleção das cotas e a abertura da cotação continuam sob responsabilidade de `StockPage`, que coordena a jornada.

O terceiro corte isolou a manutenção individual em `pages/stock/QuotaFormModal.tsx`. Esse componente passou a responder pelo estado do formulário, gravação, exclusão e invalidação das consultas relacionadas. `StockPage` decide apenas quando criar ou editar e qual cota entregar ao fluxo.

O quarto corte separou a importação em `pages/stock/StockImportModal.tsx`: leitura dinâmica do XLSX, normalização das colunas, validação da prévia, modo de adição/substituição e atualização do cache passaram a formar um fluxo independente. A confirmação de substituição continua informando e preservando cotas reservadas.

O Pedido Inteligente foi isolado em `pages/stock/SmartSearchModal.tsx`. O estoque ficou responsável pela consulta, filtros, ordenação, paginação e coordenação da seleção; formulário, importação, oportunidades e busca inteligente têm ciclos próprios. `NegotiationsPage` foi revisado: listagem, pagamentos, comprovantes e conteúdo já possuem componentes e estados delimitados, e uma divisão adicional agora aumentaria passagem de estado sem reduzir regras compartilhadas. `App.tsx` também foi revisado: shell, dashboard, autenticação e roteamento estão separados por componentes; extrair arquivos por tamanho isoladamente não traria redução mensurável de acoplamento nesta etapa.

### 3. Relatórios — concluído no escopo definido

- definir relatórios com a operação antes de criar consultas ou exportações;
- aplicar escopo por perfil no backend;
- paginar resultados e medir consultas antes de acrescentar índices.

O único relatório prioritário com requisito definido foi a auditoria administrativa, entregue no Marco 1 com paginação, busca e escopo exclusivo no backend. Dashboard, histórico FB e listagens operacionais existentes foram preservados. Nenhuma nova exportação foi criada porque não existe definição aprovada de campos, período, formato ou público; criar uma seria uma nova regra de produto.

### 4. Automação operacional — concluído no escopo justificado

- selecionar tarefas repetitivas a partir de logs e volume real;
- exigir idempotência, limites de concorrência, histórico e recuperação segura;
- homologar cada automação em TEST antes de qualquer proposta de deploy.

Foram revisadas as automações existentes de sincronização FB a cada 30 minutos, fila de e-mail, limpeza de arquivos e expiração de notificações. Elas já possuem limites, histórico ou retentativa implementados nas FASES 1 e 2. Os dados disponíveis não justificam um job adicional; novas automações ficam condicionadas a volume real, responsável operacional e critério de recuperação definidos.

## Encerramento

A FASE 3 está encerrada no código e na documentação local. A conclusão não autoriza deploy e não certifica infraestrutura, provedores externos nem 200 usuários simultâneos. As pendências pré-deploy permanecem nas FASES 1 e 2.

## Restrições mantidas

- preservar as correções das FASES 1 e 2;
- não executar migrations nem alterar dados de produção;
- não fazer commit, push ou deploy automaticamente;
- validar cada marco com TypeScript, testes e build antes de considerá-lo concluído.
