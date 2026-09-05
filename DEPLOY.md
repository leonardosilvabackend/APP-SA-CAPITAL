# Publicação no Railway

O serviço executa a interface e a API no mesmo processo Node.js 22.

## Configuração do serviço

- Instalação: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Pré-deploy: `pnpm db:migrate` (com as dependências de desenvolvimento disponíveis)
- Início: `pnpm start`
- Healthcheck: `/api/health`

Configure as variáveis no Railway antes do primeiro deploy:

- `NODE_ENV=production`
- `APP_URL`: endereço HTTPS público do serviço, sem barra final.
- `JWT_SECRET`: chave longa e exclusiva.
- `DATABASE_URL`: conexão PostgreSQL do projeto.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`: Storage privado.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: envio de e-mails.

O Railway fornece `PORT` automaticamente. Não envie o arquivo `.env` no pacote de código; configure seus valores nas variáveis do serviço.

## Publicação pelo CLI

1. Autentique: `npx --yes @railway/cli login`.
2. Vincule o projeto e serviço: `npx --yes @railway/cli link`.
3. Configure as variáveis e comandos acima no painel.
4. Publique: `npx --yes @railway/cli up`.
5. Gere o domínio: `npx --yes @railway/cli domain`.
6. Atualize `APP_URL` com o domínio gerado e aplique a alteração.
7. Confira `/api/health`, login e acesso ao banco.

O healthcheck confirma que o servidor responde; ele não testa conectividade com o banco nem Storage.

Documentação: https://docs.railway.com/cli/deploying
