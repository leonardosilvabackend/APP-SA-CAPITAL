# Ambientes seguros da SA Capital

## Dia a dia

1. Copie `.env.development.example` para `.env.development`.
2. Crie um PostgreSQL local, separado do sistema real, conforme abaixo.
3. Preencha `DATABASE_URL` e `JWT_SECRET` (chave aleatória exclusiva local).
4. Mantenha `APP_ENV=development`, `NODE_ENV=development` e `DATABASE_ENV=development`.
5. Execute `npm run db:migrate:dev` uma vez para criar as tabelas locais; depois, quando houver novas migrations.
6. Execute `npm run dev` e abra http://localhost:3000.

No PowerShell que bloqueia npm.ps1, use `npm.cmd` no lugar de `npm`. Não é necessário mudar a política do Windows.

O terminal deve mostrar Ambiente: DEVELOPMENT, Banco: DEVELOPMENT, E-mails: DESABILITADOS e Jobs automáticos: DESABILITADOS. Sem banco configurado, o comando termina antes de iniciar o servidor.

## Criar banco local

Com Docker instalado e funcionando, substitua ESCOLHA_UMA_SENHA_LOCAL por uma senha nova, usada somente neste banco:

```sh
docker run --name sa-capital-dev -e POSTGRES_USER=sa_dev -e POSTGRES_PASSWORD=ESCOLHA_UMA_SENHA_LOCAL -e POSTGRES_DB=sa_capital_development -p 127.0.0.1:5433:5432 -v sa-capital-dev-data:/var/lib/postgresql/data -d postgres:16
```

No `.env.development`, configure:

```dotenv
DATABASE_URL=postgresql://sa_dev:ESCOLHA_UMA_SENHA_LOCAL@127.0.0.1:5433/sa_capital_development
```

Use senha compatível com URL ou codifique caracteres especiais. Também é possível instalar PostgreSQL diretamente. O nome do banco deve ser `sa_capital_development` e o endereço literal `127.0.0.1` ou `::1`. Não use túnel, proxy ou encaminhamento para produção. Nunca restaure dados reais de clientes para testes; use cadastros fictícios.

Para testes com banco, crie outro contêiner com nome `sa-capital-test`, volume `sa-capital-test-data`, usuário `sa_test`, banco `sa_capital_test` e porta local `5434`. Copie `.env.test.example` para `.env.test` e preencha a URL correspondente. Testes unitários não precisam de banco. A suíte de integração exige `RUN_NEGOTIATION_DB_TESTS=1` no terminal e usa um schema temporário nesse banco de teste.

Nenhum banco foi criado automaticamente por esta alteração.

## Proteções

- O backend lê somente `.env.development`, `.env.test` ou `.env.staging`, conforme o ambiente solicitado. O `.env` antigo e `.env.production` nunca são carregados pelo backend.
- Comandos locais forçam o ambiente. Credenciais de serviços herdadas do terminal são descartadas e substituídas somente pelo arquivo específico. Não há fallback para produção.
- `APP_ENV` e `DATABASE_ENV` devem coincidir. Produção também exige `NODE_ENV=production` e identificação de ambiente, serviço e deploy Railway.
- Fora de produção, URLs de bancos remotos são recusadas, mesmo que rotuladas como desenvolvimento. O banco local precisa ter o nome específico do ambiente, sem parâmetros de URL que possam mudar o destino.
- A validação ocorre no startup, no cliente de banco, no importador, no Drizzle e antes da conexão dos testes de integração.
- Essas barreiras evitam acidentes de configuração; não são uma defesa contra alguém que altere o código, falsifique variáveis de infraestrutura ou encaminhe uma porta local para produção. Não disponibilize credenciais de produção na máquina de desenvolvimento.
- Os arquivos reais `.env*` são ignorados pelo Git. Somente exemplos sem credenciais são versionados. O arquivo `.env` existente foi preservado; transfira sua guarda para um local seguro se contiver credenciais reais.

## E-mails, arquivos e sincronização

E-mails são sempre bloqueados fora de produção, inclusive se `EMAIL_ENABLED=true`. O log não contém destinatários, links de recuperação ou tokens. Em produção continuam habilitados, salvo `EMAIL_ENABLED=false`.

Supabase Storage é bloqueado fora de produção: URL e chave não são disponibilizadas aos clientes de Storage. Telas que precisam de anexos exigirão Storage e ficarão indisponíveis para essas operações localmente; cadastros sem anexos continuam conforme as regras existentes. Não há projeto Supabase de desenvolvimento provisionado. Esta implementação não habilita Storage remoto local, mesmo que se preencham suas variáveis. Em produção, `SUPABASE_BUCKET` é aceito e o nome existente `SUPABASE_STORAGE_BUCKET` continua válido. A aplicação não utiliza `SUPABASE_ANON_KEY` atualmente.

A API Fraga & Bitello continua compartilhada somente para consulta por GET, inclusive no preview. Para gravar a sincronização, configure `FB_SYNC_ENABLED=true` no ambiente desejado; em desenvolvimento a gravação só alcança o banco local validado. Nenhum agendador FB foi adicionado.

`ENABLE_SCHEDULED_JOBS` exige `true` explícito para executar limpeza de cotações/documentos e importação inicial de reservas para negociações. Isso também vale para produção.

## Comandos

- `npm run dev`: desenvolvimento seguro.
- `npm run check`: TypeScript.
- `npm test`: testes com configuração isolada de teste.
- `npm run build`: compila arquivos; não inicia servidor nem migrations.
- `npm run db:generate`: gera arquivos de migrations com configuração de desenvolvimento validada.
- `npm run db:migrate` ou `npm run db:migrate:dev`: somente desenvolvimento.
- `npm run db:migrate:test`: somente banco de teste.
- `npm run db:studio` e `npm run db:import-administrators`: somente desenvolvimento.
- `npm run db:migrate:prod`: somente deploy Railway e com confirmação configurada.

## Ajustes obrigatórios no Railway antes do próximo deploy

Mantenha credenciais reais somente nas variáveis do serviço Railway:

- `APP_ENV=production`, `NODE_ENV=production`, `DATABASE_ENV=production`.
- Preserve `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, variáveis Supabase e Resend atuais.
- `EMAIL_ENABLED=true` para manter e-mails reais.
- `ENABLE_SCHEDULED_JOBS=true` para manter limpezas e importação inicial de reservas que antes eram automáticas.
- `FB_SYNC_ENABLED=false` até a aprovação da funcionalidade; depois `true` permite a sincronização manual.
- `FB_SYNC_SCHEDULE_ENABLED=true` habilita explicitamente a sincronização automática no ambiente atual. O intervalo é definido por `FB_SYNC_INTERVAL_MINUTES` (30 por padrão). Mantenha a flag ausente ou `false` quando o agendador não deve executar.
- Troque o pré-deploy antigo `pnpm db:migrate` por `pnpm db:migrate:prod`.
- Configure `SA_MIGRATION_ROLE=sa_capital_owner` e `CONFIRM_PRODUCTION_MIGRATIONS=apply-production-migrations` na etapa de migrations. Se o Railway só disponibilizar variáveis no serviço inteiro, essa confirmação ficará válida para todo o serviço; restrinja quem pode executar comandos nele.
- Confirme que `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID` e `RAILWAY_DEPLOYMENT_ID` estão disponíveis na etapa de migration e no runtime. São exigidos sem fallback. Não invente valores localmente.
- Build continua `pnpm build`; início continua `pnpm start`; healthcheck continua `/api/health`.

Não foi feito deploy, alteração de variáveis remotas nem migration nesta tarefa. Um preview Railway precisa de uma política e banco separados; a configuração atual de staging aceita apenas banco local, deliberadamente. Bancos remotos de desenvolvimento precisam de uma extensão revisada da política de destinos, não de reaproveitamento da URL real.

A única integração externa compartilhada identificada no código é a consulta pública da Fraga & Bitello. A configuração efetiva do Railway não foi acessada e precisa ser conferida manualmente.

## Arquivos desta implementação

- `server/environment.ts`: carregamento isolado e validações de ambiente/destino.
- `server/config.ts`, `server/db/client.ts`, `server/index.ts`: configuração, proteção da conexão, identificação no terminal e controle de jobs.
- `scripts/run.mjs`, `package.json`, `drizzle.config.ts`, `server/administrators/import-catalog.ts`: comandos locais e migrations protegidos.
- `server/email.ts`, `server/stock/fb-sync.ts`: bloqueios de envio e sincronização.
- `vitest.config.ts`, `server/test-setup.ts`, `server/negotiations/integration.test.ts`: isolamento dos testes.
- `server/environment.test.ts`, `server/email.test.ts`, `server/stock/fb-disabled.test.ts`, `server/stock/fb-sync.test.ts`: validação das proteções e ativação simulada nos testes existentes da sincronização.
- `.gitignore`, `.env.example`, `.env.development.example`, `.env.test.example`, `.env.production.example`: arquivos seguros de configuração.
- `README.md`, `DEPLOY.md`, `docs/AMBIENTES.md`: instruções de operação.

Alterações de schema, migrations e rotas de estoque que já estavam presentes no workspace foram preservadas.

## Validação realizada

TypeScript e build aprovados. A suíte passou com 118 testes aprovados e 10 testes de integração opt-in desativados, usando `npm.cmd test -- --testTimeout=20000`. As execuções com limite padrão de 5 segundos tiveram timeouts intermitentes em testes HTTP existentes. Não foi alterado o timeout padrão do projeto.

`npm.cmd run dev` foi executado sem arquivo de desenvolvimento e encerrou corretamente por falta de banco, sem aproveitar o `.env` antigo. A função de proteção de migrations também foi verificada sem executar nenhuma migration. Os arquivos reais `.env*` permanecem ignorados pelo Git.

## Ambiente TEST preparado nesta máquina

O PostgreSQL portátil foi baixado da [página oficial da EDB](https://www.enterprisedb.com/download-postgresql-binaries), indicada pelo projeto PostgreSQL para binários Windows. Binários, dados e logs estão em `.local/`, ignorado pelo Git. O banco aceita conexões somente em `127.0.0.1:5434`; a aplicação local atende em `127.0.0.1:3000`.

O arquivo `.env.test` contém credenciais novas e exclusivas deste banco. E-mails, Storage, jobs e sincronização FB permanecem bloqueados/desativados. O endpoint `/api/health` informa `environment: test` e `databaseEnvironment: test`.

Para iniciar novamente após reiniciar o computador:

```sh
npm.cmd run db:test:start
npm.cmd run dev:test
```

Abra http://localhost:3000. Contas fictícias disponíveis:

- `admin@sa-capital.test` — administrador;
- `assessor@sa-capital.test` — assessor;
- `usuario@sa-capital.test` — usuário vinculado ao assessor de teste.

Senha inicial destas contas demonstrativas: `@SA20262026`. Foram criadas seis cotas fictícias, identificadas por `TESTE-001` até `TESTE-006`. As contas demonstrativas dispensam a troca inicial para facilitar os testes; usuários criados pelo formulário continuam com troca obrigatória.

`npm.cmd run db:seed:test` cria os exemplos faltantes sem sobrescrever registros existentes. `npm.cmd run db:test:stop` para o banco local. Se a aplicação já estiver rodando em segundo plano, não abra uma segunda instância na mesma porta.

O comando de migrations locais prepara cópias dos SQLs em `.local/migrations`, omite somente a operação específica de bucket Supabase e aplica cada migration em sua própria transação, permitindo que novos valores de enum sejam usados pela migration seguinte. As migrations versionadas e o comando de produção continuam intactos.

Os 16 testes de integração PostgreSQL foram executados neste banco, em um schema temporário separado dos exemplos, e passaram. O schema temporário foi removido ao final.

## Atualizacao FASE 1

Neste computador, o aplicativo TEST passou a usar usuario restrito. Para migrations e testes com schema descartavel, use `scripts/test-admin.ps1` conforme [FASE-1](FASE-1.md). O agendador FB TEST tem habilitacao propria e pode executar a cada 30 minutos mesmo com os jobs gerais desligados. Email e Storage reais continuam bloqueados no ambiente local.
