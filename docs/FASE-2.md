# FASE 2 — desempenho e capacidade em TEST

## Resumo executivo

As melhorias locais foram implementadas preservando as proteções da FASE 1. Houve redução expressiva do custo das listagens, memória e espera por bloqueios. **A capacidade para 200 usuários simultâneos não está certificada.** O Pedido Inteligente ainda recusa buscas diferentes sob carga intensa; a homologação em infraestrutura dedicada e nos provedores TEST continua necessária.

Nenhum commit, push, deploy ou acesso a dados/migrations de produção foi executado. Os ensaios usam schemas descartáveis no PostgreSQL TEST. Não foi criada migration na FASE 2.

## Método e limites

- Máquina: Celeron N4020, 2 processadores lógicos, 3,7 GB RAM, Windows e Node 24.18.0. Validar também no Node 22 previsto pelo projeto/CI.
- API Express e PostgreSQL reais; pool de 10 conexões. Gerador HTTP e API compartilham o processo de teste: CPU/RSS Node incluem ambos. IDE e serviços locais competem pelos recursos.
- Base fictícia: 100 usuários, 1.000 cotas, 1.000 cotações, 1.000 negociações e 100 pré-análises. Usuário administrativo distinto por cliente, com históricos amplos.
- A carga simplifica autenticação no harness, consultando usuário real sem verificar JWT. Nenhum bypass foi adicionado ao aplicativo. O E2E separado exercita login real.
- Cenários fechados de 20/50/100 clientes: 15 segundos gerando requisições e aguardando as pendentes; pausa de 100 ms entre ações. Também houve rodada de 60 segundos com 100 clientes. Não equivalem a um dia de uso humano.
- Mistura de estoque, cotações, negociações, Pedido Inteligente e uploads de 64 KB. Uma sincronização FB, uma importação e dez aprovações de reserva ocorrem no mesmo intervalo.
- Storage/FB simulados com atrasos de 100/150 ms. Não medem rede, limites ou disponibilidade dos provedores. E-mail também usa provedor simulado nos testes.
- A primeira referência tinha limite incorreto de corpo no harness: foi descartada. A comparação usa `baseline-corrected.json`, com importação bem-sucedida.
- Os horários e a carga do computador variaram; não houve campanha estatística em hardware controlado. O sucesso do runner indica conclusão da medição, não aprovação de um SLO.

## Antes/depois: p95 em segundos

Referência corrigida versus implementação final com compartilhamento de buscas idênticas em andamento (`final-shared.json`). Cada célula mostra **antes → depois**.

| Clientes | Estoque | Cotações | Negociações | Upload simulado | Pedido Inteligente |
|---:|---:|---:|---:|---:|---:|
| 20 | 8,49 → 0,58 | 11,85 → 0,83 | 6,40 → 0,76 | 10,50 → 1,55 | 8,03 → 1,80 |
| 50 | 13,65 → 1,34 | 22,92 → 2,71 | 13,91 → 1,24 | 15,35 → 2,27 | 16,07 → 2,39 |
| 100 | 20,87 → 3,79 | 30,01 → 3,76 | 22,29 → 4,90 | 27,17 → 6,45 | 24,67 → 4,44 |

Na referência de 100 clientes houve 9 falhas de rede/timeout em 206 requisições (limite de 30 s). Na rodada final com buscas iguais, todas as respostas foram 2xx. Esse resultado não se aplica a buscas diferentes.

| Clientes | RSS Node antes → depois (MB) | CPU Node (% de um núcleo) | Consultas SQL | Requisições | Pico de esperas por lock |
|---:|---:|---:|---:|---:|---:|
| 20 | 272 → 220 | 41,5 → 45,2 | 6333 → 2263 | 67 → 584 | 9 → 0 |
| 50 | 420 → 227 | 43,9 → 42,4 | 15598 → 3066 | 147 → 821 | 8 → 0 |
| 100 | 507 → 230 | 39,2 → 30,3 | 20827 → 2415 | 206 → 640 | 5 → 0 |

Consultas incluem as operações concorrentes. O número de requisições muda porque cada cliente espera a resposta anterior. Conexões observadas chegaram a 12, incluindo monitor/aplicativo local além do pool do ensaio. CPU menor não prova menor custo por operação sem considerar throughput e interferência do host.

Respostas de cotações caíram de aproximadamente 1 MB para 20 KB; negociações, de aproximadamente 1 MB para 22 KB. Paginação e eliminação de consultas por cotação explicam a maior parte do ganho.

## Buscas diferentes, carga sustentada e importação grande

**Rodada final com 100 clientes e buscas diferentes (`varied100.json`):** 728 requisições, 669 respostas 2xx e **59 respostas 429 em 70 buscas inteligentes (84,3%)**. Nenhum 5xx/erro de rede. P95: estoque 3,32 s; cotações 5,42 s; negociações 5,36 s; uploads 7,00 s; buscas concluídas 5,41 s. RSS Node 229 MB, CPU média 51,5% de um núcleo, event loop p99 367 ms, 2.726 consultas, 12 conexões observadas e zero esperas por lock amostradas. A proteção evita trabalho ilimitado, mas não atende esse volume de buscas distintas.

O coletor corrigido mediu pico PostgreSQL de 62,5% de um núcleo e working set agregado de 246,57 MB nessa rodada. São todos os processos PostgreSQL locais; páginas compartilhadas podem ser contadas mais de uma vez. Amostragem de aproximadamente um segundo pode perder picos.

A rodada sustentada de 60 s, anterior ao compartilhamento de buscas iguais, apresentou p95 de estoque 4,06 s, cotações 6,52 s e uploads 6,83 s; RSS 245 MB. Sem 5xx/rede, mas 258 respostas 429 em 300 buscas. A melhor rodada curta não garante capacidade sustentada.

Importação de **20.000 linhas em lotes de 100**, concorrendo com 20 clientes: **17,35 s, HTTP 200**, RSS Node 261 MB e estoque p95 2,03 s. Reservas concluíram. Mantida transação única para substituição segura e rollback integral; não foram introduzidos commits parciais. O working set PostgreSQL chegou a 258 MB, mas a CPU dessa rodada ficou inválida por truncamento no coletor e foi descartada. Os zeros não representam ociosidade.

## Gargalos e melhorias implementadas

1. **Históricos completos/N+1:** paginação de cotações, negociações e pré-análises, padrão 20 e teto 100, ordenação estável e próxima página sem COUNT global. Avisos de estoque são buscados em lote; pagamentos agrupados por negociação. Interface com navegação e filtros de negociações no backend, preservando escopo e busca sem acentos.
2. **Bloqueios amplos:** aprovações de reservas compartilham trava de coordenação e bloqueiam cotas em ordem determinística. Substituição e operações que exigem exclusão mantêm proteção. Teste comprova que bloquear uma cota não impede reservar outra.
3. **Chamadas externas em transações:** fetch FB e uploads de documentos/comprovantes passaram para fora das transações. A gravação revalida propriedade, estado e versão, com compensação para arquivos não utilizados. E-mails confirmam uma concessão de cinco minutos antes do envio, liberando a conexão durante a chamada e permitindo nova tentativa após interrupção.
4. **Pedido Inteligente:** limite de duas buscas diferentes por instância; excesso retorna 429 com Retry-After. Buscas iguais compartilham somente trabalho em andamento, sem cache de resultado concluído ou fila ilimitada. Reserva revalida disponibilidade. Limites existentes do algoritmo permanecem.
5. **Importação:** JSON de até 10 MB apenas na rota administrativa, autenticada antes de ler o corpo. Outras rotas mantêm limite menor; respostas 400/413 para corpo inválido/excessivo. Preservados teto de 20 mil linhas, lotes de 100 e proteção de cotas comprometidas.
6. **Dinheiro:** centavos com BigInt, meio centavo arredondado para longe de zero e faixa segura validada. Comissão/transferência arredondadas no total; seguro por cota antes da soma; parcelas somadas em centavos. Conferir política com a operação. Nenhuma alteração em massa de valores gravados.
7. **Monitoramento:** request ID, logs estruturados de lentidão/5xx sem corpos ou credenciais, métricas limitadas em memória e `/api/operations` exclusivo do administrador. Readiness com prazo e apenas uma consulta pendente; histórico operacional FB da FASE 1 preservado.

## Banco e migrations

**Nenhuma migration ou índice novo.** EXPLAIN ANALYZE/BUFFERS de cinco consultas reais mostrou, na rodada de importação, execução entre 0,27 e 4,30 ms na base de 1.000 registros; cotações usam índice existente de criação. Não houve evidência suficiente para criar índices.

Os planos precedem a importação de 20 mil linhas; não certificam históricos de centenas de milhares. Repetir com volume projetado. Migrations e integridade da FASE 1 permanecem preservadas.

## Homologação de Storage/e-mail

Preparados `.env.homologation.example` e `scripts/homologate-services.mjs`: arquivo separado, projetos TEST/produção distintos, bucket privado, destinatário permitido e confirmação explícita para chamadas externas. Sem `--execute`, apenas valida configuração. O aplicativo mantém bloqueio de provedores reais fora de produção.

O utilitário verifica upload fictício, bloqueio público, download assinado, remoção do objeto e envio à caixa TEST. **Não executado contra serviços reais:** faltam recursos/chaves exclusivos de TEST. Ainda conferir recebimento/spam, expiração das URLs e políticas reais. Nunca preencher com credenciais de produção.

## Testes e E2E

E2E real em Edge headless: login, Pedido Inteligente, salvar cotação, solicitar/aprovar reserva, abrir/cancelar negociação, verificar liberação da cota, navegação de pré-análises e logout. Oito resultados registrados, nenhuma exceção JavaScript; fixtures removidas e auditoria preservada. Artefato local: `.local/e2e/86ba4016-458a-4b20-be13-77e2d118206b/result.json`.

Integração PostgreSQL cobre disputa pela mesma cota, independência de reservas, rollback, paginação/filtros, propriedade, auditoria, idempotência, filas e compensações. Carga é opt-in e não roda no npm test normal.

Validação final em 11/09/2026:

- `npm run check`: aprovado.
- `npm test`: 179 aprovados; 26 testes PostgreSQL e 1 de carga desativados por padrão. A primeira tentativa foi impedida pelo ambiente restrito do Windows (`uv_os_get_passwd/ENOMEM`); a repetição local autorizada passou.
- `scripts/test-admin.ps1 -Action integration`: 205 aprovados, incluindo os 26 PostgreSQL; somente a carga ficou desativada. Nenhuma falha.
- `npm run build`: aprovado; frontend e backend gerados localmente. Apenas avisos do Rollup sobre comentários de anotação do Zod, sem falha. JavaScript principal: 474,79 KB (138,03 KB gzip); chunk XLSX: 499,55 KB (162,96 KB gzip).
- `git diff --check`: aprovado.
- Nove arquivos JSON de evidências validados; o resultado E2E também está em `docs/phase2/e2e.json`.

Os ensaios de carga foram executados separadamente e seus HTTP 429 são reportados acima; não são ocultados pela contagem de testes aprovados.

## Arquivos da FASE 2

- Backend: `server/pagination.ts`, `server/observability.ts`, `server/index.ts`, `server/email-queue.ts`, `server/quotes/routes.ts`, `server/negotiations/routes.ts`, `server/negotiations/service.ts`, `server/pre-analyses/routes.ts`, `server/stock/routes.ts`, `server/stock/protection.ts`, `server/stock/smart-search.ts`, `server/stock/smart-capacity.ts`, `server/stock/fb-sync.ts`.
- Interface: `client/src/components/HistoryPagination.tsx`, `client/src/pages/QuotesPage.tsx`, `client/src/pages/NegotiationsPage.tsx`, `client/src/pages/PreAnalysesPage.tsx`.
- Cálculos: `shared/money.ts`, `shared/quote.ts`, `shared/negotiations.ts`.
- Testes: `server/pagination.test.ts`, `server/observability.test.ts`, `server/stock/smart-capacity.test.ts`, `shared/money.test.ts`, `server/stock/fb-sync.test.ts`, `server/negotiations/integration.test.ts`, `server/negotiations/load.test.ts`.
- Operação: `scripts/load-test.ps1`, `scripts/measure-load-processes.ps1`, `scripts/e2e-test.mjs`, `scripts/homologate-services.mjs`, `.env.homologation.example`, `package.json`, este relatório e `docs/phase2/*.json`.

O workspace já continha alterações da FASE 1. Esta lista identifica o escopo desta fase, sem substituir revisão do diff completo. Nenhuma dependência nova foi adicionada nesta fase.

## Reprodução local

```powershell
npm.cmd run db:test:start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/load-test.ps1 -Label local
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/load-test.ps1 -Label sustained -Seconds 60 -Users 100
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/measure-load-processes.ps1 -Label varied -Users 100 -VariedSearch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/measure-load-processes.ps1 -Label large -ImportRows 20000 -Users 20
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-admin.ps1 -Action integration
npm.cmd run check
npm.cmd test
npm.cmd run build
# Com o aplicativo TEST iniciado em outra sessão:
npm.cmd run test:e2e
```

## Capacidade e riscos restantes

Para **200 usuários ativos ao longo do dia**, há base melhor para um piloto monitorado, condicionado a pico substancialmente menor e homologação. Não há evidência para aprovar 200 simultâneos. Usar 20–50 clientes no perfil misto como faixa inicial de homologação, sem garantia contratual de capacidade.

Repetir em infraestrutura dedicada equivalente à pretendida, gerador separado, Node 22, autenticação real, perfis variados e volume projetado. Definir SLOs: por exemplo listagens p95 até 1 s, nenhum 5xx/timeout e taxa aceitável de 429. Os resultados locais ainda não satisfazem essa meta sob alta concorrência.

Persistem saturação de buscas distintas, importação longa em pico, locks necessários à substituição, offset em páginas profundas, limites do algoritmo, latência dos provedores e ensaios curtos. Usuários/catálogos e painel de reservas pendentes não foram paginados nesta rodada. Métricas em memória não substituem agregação/alertas externos. Concessão e idempotência de e-mail não garantem entrega exatamente uma vez em todos os casos de falha.

## Checklist antes do próximo deploy

- [ ] Revisar diff completo preservando FASE 1; commit/push somente quando autorizado.
- [ ] Executar CI Node 22 e E2E em homologação com dependências do lockfile.
- [ ] Repetir carga sustentada com gerador separado, buscas variadas, JWT real e volume projetado; aceitar explicitamente SLO e pico suportado.
- [ ] Conferir arredondamentos com a operação.
- [ ] Homologar Storage privado, políticas, expiração/remoção/recuperação de arquivos e entrega de e-mail usando exclusivamente recursos TEST.
- [ ] Validar recuperação da fila de e-mail após interrupções e com múltiplas instâncias.
- [ ] Configurar logs/métricas externos e alertas de 429/5xx, atraso FB, memória, conexões e readiness; conferir HTTPS/proxy.
- [ ] Resolver rotação de credenciais, privilégios e backup/restauração incluindo Storage pendentes da FASE 1.
- [ ] Conferir alertas/origem das reservas FB sem elevar salvaguardas para forçar sincronização.
- [ ] Agendar importações grandes fora do pico e documentar rollback operacional.

Os JSON em `docs/phase2/` preservam medições e planos sem credenciais. Esta entrega não inclui deploy nem certificação de capacidade de produção.
