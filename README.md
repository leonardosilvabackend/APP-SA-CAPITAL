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

## Simulador de cotação

- Até 12 cotas disponíveis podem ser selecionadas diretamente no estoque.
- Crédito, entrada original, comissão de 0% a 8%, entrada final, saldo, transferência e seguro são recalculados no servidor.
- Parcelas com prazos diferentes são apresentadas em cascata por intervalo.
- O resumo privado mostra a comissão; o texto comercial copiado omite taxa, valor de comissão, fornecedor e outros dados administrativos.
- Cotas reservadas ou vendidas são recusadas pelo servidor, mesmo que alguém tente enviar seus identificadores manualmente.
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
4. Implementar simulador e histórico de cotações.

## Regras implementadas

- Perfis: Administrador, Administrativo, Assessor e Usuário, com vínculo entre Assessor e seus usuários.
- Estoque com paginação 20/50/100, busca por múltiplos códigos, importação por adição ou substituição e busca inteligente local.
- Junções sem limite funcional, sempre com a mesma categoria e administradora.
- Cotações expiram após cinco dias e podem gerar pedidos de reserva; somente a aprovação administrativa reserva as cotas.
- Pré-análises usam documentos dinâmicos, consentimento obrigatório e armazenamento privado no Supabase.
- Documentos expiram dez dias após o retorno final da equipe administrativa.
- Configurações comerciais ficam disponíveis ao administrador; segredos continuam somente nas variáveis de ambiente.
5. Implementar pré-análises e documentos.
6. Configurar testes de integração, preview e produção.

## Administradoras

- Cadastros persistidos no PostgreSQL; execute `pnpm db:migrate` antes de usar o modulo.
- Somente administradores cadastram; usuarios autenticados consultam os registros e arquivos.
- Logos e documentos usam o bucket privado `SUPABASE_STORAGE_BUCKET`, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` configurados no servidor.
- Sem Storage configurado, o cadastro continua disponivel sem anexos.
- Ate 10 documentos por cadastro; soma dos arquivos, incluindo a logo, limitada a 10 MB.
- Os arquivos sao acessados por links temporarios apos verificacao da sessao. Se a gravacao falhar, os arquivos enviados sao removidos.
- Os exemplos fixos da interface foram removidos. Cadastros antigos mantidos apenas na memoria do navegador nao podem ser recuperados apos recarregar.

## Negociações

- A aprovação de uma reserva cria a negociação e reserva as cotas na mesma transação. A aprovação repetida não duplica a negociação; cotas indisponíveis impedem a aprovação.
- Códigos sequenciais a partir de `SA05092026`. Cada negociação reúne as cotas da cotação aprovada, preservando valores, parcelas e seguro mesmo após a cotação expirar.
- Usuários consultam as próprias negociações; assessores consultam e alteram as próprias e as de sua equipe; administrador e administrativo consultam e alteram todas.
- Etapas: aguardando dados, pendente contrato, aguardando pré-análise, finalizada e cancelada. A mudança de etapa não altera automaticamente o estoque nem cria uma pré-análise.
- Entrada inicial e taxa de transferência vêm da cotação; taxa de cadastro inicia em zero. Comissão é editada em reais e não altera automaticamente a entrada.
- Sinais e demais pagamentos têm valor, data e horário, autor do registro e comprovantes privados em PDF, JPEG ou PNG de até 10 MB cada. Não há limite de quantidade de pagamentos.
- Valor a pagar = entrada menos todos os pagamentos. Pagamentos não podem superar a entrada; a finalização exige entrada quitada. Reabra a etapa para corrigir pagamentos de negociações encerradas.
- A API detecta alterações simultâneas e evita duplicação ao reenviar um pagamento. Comprovantes podem ser anexados também depois do registro do pagamento.
- Execute `pnpm db:migrate` e reinicie o servidor. Reservas anteriormente aprovadas que ainda possuem a cotação são importadas antes da limpeza inicial.
- Testes com PostgreSQL: defina `RUN_NEGOTIATION_DB_TESTS=1` e execute `pnpm test`. Usam um schema temporário, removido ao final, e simulam o Storage, sem alterar registros da aplicação.
