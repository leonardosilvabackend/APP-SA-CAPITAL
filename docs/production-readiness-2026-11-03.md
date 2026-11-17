# Preparação de produção — 03/11/2026

Status: NÃO LIBERADO. Trabalho e validação exclusivos no ambiente local TEST.

## Gate de publicação — 08/11/2026

O pedido de publicação foi recebido, mas o deploy não foi iniciado. `origin/main` está três commits à frente do checkout local e já contém `drizzle/0014_expire_stock_reservations.sql`. O workspace usa o mesmo número `0014` para recursos de parceiros e repete parte da migration remota em `0017`, com definição diferente de `retired_quota_codes`. O runner ordena migrations pelo timestamp do journal e ignora entradas anteriores à última aplicada; publicar a sequência local como está pode deixar estruturas ausentes sem gerar erro. É necessário reconciliar a sequência em um release baseado no `main` remoto e provar a aplicação em uma cópia isolada representativa, sem reescrever migrations já aplicadas.

O release também não está versionado: há alterações e migrations não commitadas, além de artefatos locais não rastreados que não devem ser enviados automaticamente. Não há vínculo/CLI Railway disponível neste workspace, nem evidência verificada de backup e restauração de banco e Storage de produção. O projeto Supabase TEST continua sem credenciais; o ensaio real de Storage ainda não foi executado. Nenhuma migration ou deploy de produção foi executado nesta revisão.

## Revisão de 08/11/2026

- Node.js oficial 22.23.4 foi baixado somente para `.local/node22`, com SHA-256 conferido contra `SHASUMS256.txt` oficial; a instalação global não mudou. Sob Node 22, a suíte completa passou (483 testes, 29 opt-in ignorados) e `npm.cmd run build` passou, incluindo TypeScript. O aviso do bundle acima de 500 KB permanece.
- Homologação Supabase Storage real preparada em `scripts/homologate-test-storage.mjs` e `npm run storage:homologate:test`: exige projeto TEST explícito, verifica bucket privado, upload de PNG descartável, leitura por URL assinada, remoção e ausência posterior. A validação de sintaxe passou. A execução sem credenciais falhou antes de qualquer acesso remoto, como esperado. Aguarda `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` e `TEST_SUPABASE_PROJECT_REF` exclusivamente TEST em `.env.test`; ainda não é uma homologação concluída do serviço externo.
- Fluxo E2E no navegador Edge, servidor e banco TEST locais: 26 etapas aprovadas, sem exceções JavaScript. Abrange login e consentimento, check-list, administração de tipos de renda, conflito de configuração, estoque, pedido inteligente, cotação, geração de artes, reserva, negociação, liberação e logout. Evidência privada em `.local/e2e/9069be1f-566d-4719-a770-ea95d41a3899/result.json`.
- O roteiro E2E foi atualizado para a homepage pública, o consentimento obrigatório, a barra lateral retrátil, uma opção por administradora, o layout atual da cotação e as artes Caminhão/Trator. Não houve mudança de regra de negócio nessa revisão.
- Suíte principal completa com um worker: 483 testes aprovados, 29 cenários opt-in ignorados, zero falhas. Os quatro timeouts da execução concorrente anterior não se repetiram. Comando: `npm.cmd test -- --maxWorkers=1 --reporter=dot`.
- `npm.cmd run build` aprovado, incluindo `npm run check`. Vite ainda alerta sobre bundle principal acima de 500 KB; não impediu a compilação.
- Integração com PostgreSQL TEST local: 28 testes aprovados. Verificação de privilégios confirmou usuário de aplicação restrito.
- Backup do banco TEST local restaurado e conferido por contagem de linhas em todas as tabelas. Manifesto e dump privados em `.local/backups/test-5062951f7be14323a3a1f86f20fe4162.dump*`. Havia 894 cotas, mas várias tabelas estavam vazias; o ensaio não substitui restauração com dados representativos de todos os fluxos nem inclui objetos externos de Storage.
- `git diff --check` apontou dois espaços finais em arquivos de interface; corrigidos. Arquivos `.env` locais e de backup verificados como ignorados pelo Git. Nenhum arquivo sensível foi removido ou publicado.
- O ambiente local usa Node 24.18.0; o projeto declara Node 22.x. Ainda falta executar a validação final no runtime declarado.
- Não foi encontrada instalação local de Node 22. Em `.env.test`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` estão vazios; portanto, a homologação de Storage e entrega real de e-mail aguarda credenciais TEST isoladas. Nenhum segredo foi exibido nesta verificação.
- A primeira tentativa da suíte neste dia não iniciou por falta de memória do sistema (`uv_os_get_passwd`/`ENOMEM`); a repetição posterior foi concluída com sucesso. Ainda falta ensaio prolongado de memória em infraestrutura representativa.
- Permanecem pendentes a homologação externa dos serviços TEST, regressão visual e de permissões no navegador, ensaio de backup/restauração e revisão de lançamento. A API FB continua fora do critério de liberação por decisão do usuário.

## Atualização de escopo — 04/11/2026

O usuário substituiu a exigência de busca ampla sem limite: agora o processamento dispõe de no máximo 15 segundos e devolve as melhores combinações válidas encontradas, identificando resultado parcial quando não conclui a análise. Preservados ranking por proporção, faixa de crédito, orçamento e diversidade de administradoras. Finalização antecipada quando todos os grupos são resolvidos. O orçamento inclui fila e inicialização dos workers; o endpoint desconta o tempo já gasto para carregar candidatos. Tempo de transporte de rede não é controlado pelo solver.

A API FB deixou de ser requisito de homologação para este lançamento por decisão do usuário. Ele utilizará o botão de desligar e operação manual após o deploy. A proteção de sincronização permanece; nenhuma configuração de produção foi alterada. A ação de desligar deve constar do roteiro operacional do lançamento.

As observações abaixo sobre busca sem corte e homologação FB são o histórico do diagnóstico anterior, substituído por essa decisão. Resultados de carga e aprovação precisam refletir o novo comportamento antes de liberar.

### Validação do limite de busca — 04/11/2026

- Três testes novos cobrem prazo esgotado, devolução de combinações válidas parciais e recuperação dos workers, além de orçamento incompatível. Regressão direcionada: 146 testes aprovados.
- Suíte completa nesta execução: 479 aprovados, 4 falhas por timeout de 5 segundos e 29 opt-in ignorados. Falhas em dois casos de busca exata, um da rota de busca e um de administradoras. Não considerar a execução completa aprovada; repetir isoladamente para verificar instabilidade de execução.
- Repetição dos três arquivos afetados com `--maxWorkers=1`: 135 testes aprovados, sem mudar limites ou asserções. Os quatro casos falhos passaram. Evidência compatível com contenção na execução concorrente; ainda repetir a suíte completa em ambiente estável antes da liberação.
- TypeScript e build aprovados. Permanece o aviso de bundle principal acima de 500 KB.
- Carga local repetida com 20/50/100 clientes: 141 requisições de busca retornaram HTTP 200, sem timeout ou HTTP 5xx. p95 da busca: 15,17 s / 15,11 s / 15,21 s, incluindo transporte e resposta. O limite do processamento não constitui garantia de latência HTTP exata.
- Pico RSS por fase: 313 / 290 / 299 MB. Sem filas de conexão ao banco observadas. Reservas concorrentes retornaram 409, sem afirmar aprovação desse fluxo com base apenas nesse ensaio.
- Evidência privada: `.local/phase2/bounded-search-15s.json`. Executado com build simultâneo; ainda é necessário ensaio prolongado e representativo da infraestrutura final.
- O bloqueador histórico de timeout de todas as buscas foi resolvido neste ensaio. Permanecem pendentes buscas distintas/desconexão, validação de navegador, serviços externos (exceto FB), backup/restauração e revisão final de segurança. Não há autorização para produção.

## Correções desta revisão

- Dependências corrigidas no package.json e pnpm-lock.yaml: Drizzle 0.45.4, Zod 4.6.7 e overrides para body-parser, proxy-addr e qs.
- Auditoria `corepack pnpm audit --prod --json`: zero alertas conhecidos nas 102 dependências avaliadas. Isso não representa uma auditoria completa da aplicação.
- Vitest coleta apenas server, shared e client/src, excluindo a cópia .hotfix-fb; no máximo dois workers de teste.
- .hotfix-fb e arquivos privados locais excluídos do Git; .dockerignore impede inclusão de ambientes, backups locais e artefatos num eventual build Docker. Nenhum arquivo do usuário removido.
- Comparação exaustiva da busca dividida em 120 casos independentes, preservando todas as amostras e o timeout de cinco segundos por caso.
- Testes monetários ajustados aos limites aprovados: crédito 5M, entrada 3,5M, parcela 200K, saldo 8M.
- API verifica proprietário ativo, trata rejeições assíncronas e limita 60 solicitações por janela de um minuto usando incremento atômico no banco, independente dos logs.
- Rotação serializada por bloqueio transacional do usuário; prefixos test/live conforme ambiente; respostas de chave não podem ser armazenadas em cache.
- Cadastro de usuário herda organização do responsável; bootstrap resolve a organização existente. Dados de integração adequados à migration 0020.
- Headers básicos de segurança, proteção contra framing e cache de respostas privadas; readiness verifica também tabelas novas.
- Corrigido journal do migrador: faltavam registros de 0022, 0023 e 0024. O teste de integração antigo lia todos os SQL diretamente e não detectava essa ausência. Novo teste exige correspondência completa entre journal e arquivos SQL, índices únicos e ordem temporal crescente. Scripts antigos não foram reescritos.

## Evidências

- Suíte principal: 479 testes aprovados, 28 testes opt-in ignorados nessa execução. Não inclui cópia .hotfix-fb.
- Integração PostgreSQL executada separadamente em schema descartável: migrations 0000–0024 aplicadas, 28 cenários aprovados, incluindo geração concorrente, rotação, revogação, proprietário inativo e isolamento de configuração de API. Rajada de 65 consultas: exatamente 60 respostas 200 e 5 respostas 429.
- Build e TypeScript aprovados. Aviso de bundle principal acima de 500 KB permanece (aproximadamente 614 KB, 177 KB gzip); não é evidência de vazamento de memória.
- Teste de carga: 100 usuários fictícios, 1.000 cotas, 1.000 cotações, 1.000 negociações e 1.000 linhas de importação, com fases de 20, 50 e 100 clientes simultâneos.
- Medição em `.local/phase2/baseline.json` (arquivo privado local, não incluído em publicação).

## Bloqueador observado na carga

As 130 requisições de busca ampla medidas ultrapassaram o prazo de 30 segundos do cliente do ensaio. Isso não prova que o algoritmo não concluiria, mas torna a experiência inadequada para esse cenário. Não foi imposto novo corte de tempo ao algoritmo, preservando a regra do usuário.

Picos RSS por fase: aproximadamente 310 MB, 241 MB e 250 MB. Estoque p95: 2,37 s, 2,05 s e 4,29 s. Sem teste prolongado, não é possível afirmar ausência de vazamento ou dimensionar a infraestrutura final. Execução local sob outras tarefas; repetir em infraestrutura de homologação equivalente antes de dimensionar.

O harness antigo marcava sucesso mesmo com timeout de todas as buscas. Foram acrescentadas asserções que reprovam falhas de rede e HTTP 5xx, após registrar o relatório. Os resultados acima NÃO aprovam a carga. Reservas retornaram 409 sob importação concorrente; revisar o cenário para separar conflito esperado de falha.

## Pendências para liberar

1. Otimizar e repetir carga da busca ampla, incluindo buscas distintas e desconexão do cliente. Avaliar execução assíncrona persistente caso a busca exata exceda a duração de uma requisição HTTP; não apresentar resultado parcial como ótimo.
2. Executar teste prolongado de memória e carga sem build simultâneo, com limites equivalentes ao ambiente contratado. Padronizar Node 22 (package.json); validação atual executou em Node 24.18.0.
3. Homologar Storage privado, imagens dos comunicados, e-mails, jobs e FB com credenciais e dados de TEST isolados. O módulo de otimização de Storage continua pendente por solicitação anterior do usuário.
   No reinício do TEST, a proteção FB bloqueou uma resposta que reservaria 175 de 272 cotas. Nenhuma alteração de cotas foi permitida por essa sincronização. Investigar a diferença do inventário antes de homologar; não remover a proteção.
4. Completar regressão de navegador dos novos módulos, permissões e isolamento. O sistema ainda não está certificado para múltiplos contratantes: o estoque da API é compartilhado, sem filtro de organização.
5. Definir retenção de logs/sessões sem apagar auditoria indiscriminadamente; testar limpeza e recuperação de falhas de upload.
6. Fazer backup e ensaio de restauração em infraestrutura autorizada; aplicar migrations em cópia isolada representativa dos dados existentes, verificar privilégios runtime e preparar retorno. Ensaio em schema vazio não substitui ensaio com dados existentes.
7. Revisar diff completo e arquivos novos, varrer segredos antes do commit, fixar o artefato/lockfile e executar smoke test e aprovação visual.

## Procedimento de entrega futura

Congelar versão testada; obter aprovação explícita para produção; backup verificável; janela de manutenção se necessária; migrations incrementais com papel autorizado; smoke tests com credenciais restritas; monitorar erros e memória. Em falha, interromper e seguir procedimento de recuperação validado. Não desfazer migrations destrutivamente por tentativa.

Nenhum deploy, acesso ao Railway de produção ou migration em produção foi realizado nesta revisão.
