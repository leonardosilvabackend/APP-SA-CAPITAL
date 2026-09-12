# Release Candidate — pré-deploy Railway

Data da revisão: 12/09/2026. Estado atual: **NÃO APTO PARA DEPLOY** enquanto as ações manuais bloqueadoras ao final deste documento não forem comprovadas. Após essas comprovações e CI remoto verde, a classificação pode mudar para **APTO COM RESSALVAS** para uma janela monitorada. Nenhum push, deploy ou acesso ao banco de produção foi realizado.

## Conteúdo do commit

O commit da RC deve conter todas as alterações rastreadas e todos os arquivos novos exibidos por `git status`, incluindo aplicação, testes, documentação, assets de logos, workflow, scripts, migrations `0007`–`0012`, snapshots e `_journal.json`. Não incluir `.env*` reais, `.local/`, dumps, logs, `dist/` ou credenciais. Antes do commit, revisar especialmente os binários de logo e o lockfile. Recomenda-se um único commit de RC somente após revisão do diff; não selecionar apenas migrations ou apenas código, pois o schema e o runtime são dependentes.

## Evidência local

- Node 22.23.2 temporário: TypeScript aprovado; 180 testes aprovados, 28 opt-in ignorados; build Vite e bundle do servidor aprovados.
- `git diff --check`: aprovado, com avisos locais de conversão LF/CRLF.
- Varredura por padrões comuns de secrets: nenhum segredo real encontrado nos arquivos versionáveis.
- O workflow usa Node 22, PostgreSQL 16, lockfile congelado, migrations TEST e `RUN_NEGOTIATION_DB_TESTS=1`. A execução remota só poderá ser confirmada após push/PR autorizado.

## Migrations candidatas

O runner consulta `drizzle.__drizzle_migrations` e aplica somente arquivos posteriores ao último registro, um por transação, sob advisory lock. Confirmar no banco de produção quais já foram aplicados. Candidatas desta RC:

1. `0007_sharp_namor.sql`: adiciona `quotas.external_id`.
2. `0008_clever_moon_knight.sql`: cria auditoria imutável, histórico FB, fila de limpeza e índices; instala trigger que bloqueia UPDATE/DELETE da auditoria.
3. `0009_gigantic_moira_mactaggert.sql`: adiciona origem da reserva e classifica reservas existentes como `manual`.
4. `0010_wealthy_outlaw_kid.sql`: cria rate limit persistente de autenticação.
5. `0011_windy_doorman.sql`: cria fila persistente de e-mails e índice.
6. `0012_flawless_lester.sql`: cria notificações, oportunidade em cotações, FK e índices.

Antes da migration: backup consistente, contagem de tabelas, espaço disponível, confirmação da origem das reservas e teste de restauração. Não habilitar runtime novo antes de transferir ownership ao papel sem login e validar grants.

## Variáveis Railway

Obrigatórias no runtime: `APP_ENV=production`, `NODE_ENV=production`, `DATABASE_ENV=production`, `DATABASE_URL` do usuário restrito, `JWT_SECRET` exclusivo com 32+ caracteres, `APP_URL` HTTPS, `TRUST_PROXY_HOPS` conforme a topologia real, `EMAIL_ENABLED`, `ENABLE_SCHEDULED_JOBS`, `FB_SYNC_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. `PORT` é fornecida pelo Railway.

Somente no pre-deploy: `SA_MIGRATION_DATABASE_URL` do migrator e `CONFIRM_PRODUCTION_MIGRATIONS=apply-production-migrations`. Railway fornece `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID` e `RAILWAY_DEPLOYMENT_ID`. Não é necessário `SUPABASE_ANON_KEY` para o runtime atual. Manter `FB_SYNC_ENABLED=false` nesta RC.

## Backup e restauração

Usar snapshot/PITR do PostgreSQL antes da migration e exportação independente verificada. Registrar responsável, horário, retenção, RPO e RTO. Inventariar objetos do bucket e confirmar versionamento/backup do Storage. Testar restauração em banco e bucket isolados; comparar contagens e amostras. O backup local da FASE 1 não comprova recuperação de produção.

## Storage e e-mail

Confirmar bucket privado, policies, URL assinada, expiração, upload/download/remoção e fila de limpeza. No Resend, confirmar domínio, SPF/DKIM, remetente e caixa de teste; verificar retry e duplicidade após interrupção. Essas homologações devem usar recursos TEST separados antes da liberação das credenciais reais no runtime.

## Readiness, monitoramento e FB

Configurar healthcheck Railway em `/api/ready`; `/api/health` não valida banco. Alertar para readiness 503, 5xx, 429, p95, memória, CPU, conexões PostgreSQL, fila de e-mail e atraso/falha FB. Os logs possuem request ID e não devem registrar corpos/secrets. O histórico FB deve ser acompanhado pelo card administrativo. A última divergência TEST conhecida tentaria reservar 93 cotas; reconciliar códigos/status com o fornecedor antes de habilitar FB. O agendador automático atual só funciona em TEST.

## Ordem do futuro deploy

1. Congelar mudanças e revisar diff/RC; criar commit e PR quando autorizado.
2. Executar CI Node 22 e exigir todos os checks verdes.
3. Homologar Storage/e-mail e executar smoke em ambiente separado.
4. Confirmar backup/restauração, janela, responsáveis e rollback.
5. Criar/validar owner, migrator e runtime; manter serviço atual usando credencial antiga até a migration terminar.
6. Configurar secrets Railway, mantendo FB desligada.
7. Executar pre-deploy `pnpm db:migrate:prod` com migrator e confirmação explícita.
8. Validar schema e privilégios; trocar `DATABASE_URL` para runtime restrito.
9. Publicar a imagem/commit aprovado e aguardar `/api/ready` 200.
10. Executar smoke tests e monitorar intensivamente; liberar tráfego normal somente após aprovação.

## Rollback

Se o app falhar e o schema estiver compatível, redeploy imediato do commit anterior e restaure a `DATABASE_URL` anterior. As migrations são aditivas e não possuem down automático; não remover colunas/tabelas durante incidente. Se houver corrupção de dados, interromper jobs/e-mail/FB, colocar a aplicação indisponível, restaurar banco e Storage para recursos novos a partir do snapshot, validar isoladamente e então apontar o serviço restaurado. Preservar auditoria/logs e registrar timestamps. `0009` altera dados legados; guardar exportação de `quotas(id, code, status, reservation_origin)` antes da execução.

## Smoke pós-deploy

- `/api/ready` 200 e `/api/health` com `production` nos dois ambientes.
- login/logout, troca e reset de senha; sessão revogada após reset.
- administrador vê auditoria/operações; assessor e usuário recebem 403 por URL/ID indevido.
- estoque pagina/filtra; cotação calcula; Pedido Inteligente respeita 429 e disponibilidade.
- reservar, aprovar, criar negociação, cancelar e liberar cota; impedir repetição; excluir conforme permissão.
- substituir estoque com cota reservada sem duplicar/liberar.
- pré-análise com upload privado, URL assinada e remoção; administradoras/logos.
- notificação expira em 48 h; fila de e-mail envia e registra retry sem expor conteúdo em log.
- FB permanece desligada; card administrativo mostra estado esperado.
- observar 5xx/429, p95, memória, CPU, conexões e filas por pelo menos 30 minutos.

## Ações manuais bloqueadoras

Rotacionar credenciais expostas anteriormente; confirmar configuração Railway e topologia de proxy; criar papéis do banco e transferir ownership; executar e provar restauração; homologar Storage/e-mail; reconciliar FB; conferir reservas legadas e arredondamentos com a operação; executar CI/PR. Até essas evidências existirem, a RC não deve ser promovida automaticamente.
