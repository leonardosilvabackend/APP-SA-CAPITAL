# SA-CAPITAL-APP

Nova plataforma independente da SA Capital. O projeto antigo desenvolvido no Manus é apenas uma referência funcional e visual; credenciais, banco, histórico Git e publicação não são compartilhados.

## Estrutura

- `client/`: interface React e Vite
- `server/`: API Express e serviços do backend
- `server/db/`: conexão e modelos PostgreSQL/Drizzle
- `shared/`: contratos compartilhados entre frontend e backend
- `drizzle/`: migrações geradas do banco

## Rodar no Windows

1. Instale Node.js 22 LTS ou superior.
2. Ative o pnpm com `corepack enable`.
3. Execute `pnpm install`.
4. Copie `.env.example` para `.env` e use credenciais exclusivas deste projeto.
5. Execute `pnpm dev`.
6. Abra `http://localhost:3000`.

A interface inicial funciona sem banco. Operações persistentes só serão habilitadas depois da configuração do PostgreSQL.

## Autenticação

- O primeiro acesso cria um único administrador quando o banco ainda não possui usuários.
- Administradores criam parceiros e outros administradores pela página `Usuários`.
- Novos usuários devem trocar a senha inicial antes de acessar o painel.
- `Esqueci minha senha` envia pelo Resend um link de uso único válido por uma hora.
- Alterações e redefinições de senha invalidam as sessões anteriores do usuário.
- Para testar links localmente, mantenha `APP_URL=http://localhost:3000` e o servidor em execução.

## Estoque

- Administradores cadastram e editam cotas, situação e destaque.
- A consulta aceita busca, categoria, administradora e situação, com paginação no servidor.
- Parceiros visualizam apenas cotas disponíveis; essa regra é aplicada pela API, não apenas pela interface.
- Planilhas `.xlsx`, `.xls` e `.csv` passam por uma prévia obrigatória antes da importação.
- A importação reconhece as colunas `Cód. Cota`, `Categoria`, `Crédito`, `Entrada`, `Nº Parcelas`, `Vlr Parcela`, `Saldo Devedor`, `Administradora` e `Fornecedor`.
- Uma cota com código já existente é atualizada; códigos duplicados na mesma planilha são recusados.
- `examples/estoque-exemplo.csv` contém duas cotas fictícias para validar o importador.

## Verificações

- `pnpm check`: valida o TypeScript
- `pnpm test`: executa os testes
- `pnpm build`: gera o pacote de produção
- `pnpm db:generate`: gera migrações após alterações no schema
- `pnpm db:migrate`: aplica migrações no banco configurado

## Fluxo Git recomendado

Trabalhe em branches, teste localmente e abra uma revisão antes de unir alterações à `main`. A hospedagem será configurada futuramente para publicar a `main` e gerar previews das demais branches.

## Próximas etapas

1. Criar o projeto Supabase exclusivo e configurar PostgreSQL/Storage.
2. Implementar autenticação e perfis administrador/parceiro.
3. Implementar estoque e importação de planilhas.
4. Implementar simulador, cotações e propostas.
5. Implementar pré-análises e documentos.
6. Configurar testes de integração, preview e produção.
