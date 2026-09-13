# FASE 1 — correções locais antes do próximo deploy

## Escopo e situação

Implementação em development/TEST. Nenhum deploy, alteração de dados ou migration de produção foi executado. As mudanças ainda estão no workspace, junto de alterações anteriores; não foram publicadas nem commitadas automaticamente.

## Correções implementadas

- **Autenticação:** criação pública do primeiro administrador desativada; bootstrap exclusivamente por comando com JSON pela entrada padrão. A troca obrigatória de senha agora é exigida no backend. Reset e troca revogam sessões e tokens anteriores; logout revoga todas as sessões do usuário. Limites de tentativas por IP e conta persistem no PostgreSQL, com proteção adicional limitada em memória.
- **Permissões:** escopo de assessor conferido em listas e acesso direto por ID de usuários, cotações, pré-análises e negociações. Exclusão permanente de negociação exige administrador. A senha inicial/reset administrativo continua `@SA20262026`, armazenada como hash e sujeita à troca obrigatória.
- **Pré-análises:** criação como rascunho, validação de CPF/CNPJ, submissão separada e conferência dos documentos obrigatórios antes de envio/aprovação. É possível retomar rascunhos e substituir documentos solicitados. O cliente não pode criar uma pré-análise já aprovada.
- **Uploads:** autorização antes do recebimento do corpo, limites por arquivo/pré-análise e verificação de assinatura do formato. Links privados de curta duração e bloqueio de documentos expirados. Exclusão da pré-análise e registro da limpeza de arquivos ocorrem na mesma transação; a fila permite repetir remoções que falharem.
- **Negociações:** verificação dos valores atuais antes de aprovar uma reserva, disputa por cota protegida por transação, negociação finalizada imutável e registro de auditoria para alterações financeiras/cancelamento/exclusão. Eventos de auditoria sobrevivem à exclusão e rejeitam UPDATE/DELETE no banco.
- **Estoque:** origem da reserva registrada; substituição por planilha preserva cotas comprometidas e identidade/valores de cotas integradas FB. Reservas manuais não são liberadas pelo fornecedor. Cancelamento libera cotas da negociação respeitando vínculos posteriores.
- **FB:** histórico persistente de execuções manuais/automáticas, último sucesso e alerta de atraso. O agendamento TEST mantém intervalo de 30 minutos. A fórmula da entrada aprovada anteriormente foi preservada.
- **E-mails:** timeout, repetição limitada e chave de idempotência. Notificações de status são enfileiradas na transação e repetidas após falha; recuperação de senha mantém envio imediato com repetição limitada. TEST continua sem envio real.
- **Banco/ambientes:** migrations locais transacionais por arquivo, compatíveis com PostgreSQL sem schema Storage; usuário do aplicativo TEST sem superusuário/DDL; credenciais administrativas locais separadas. Readiness em `/api/ready` consulta estruturas do banco.
- **Dependências/entrega:** SheetJS substituído pela distribuição oficial 0.20.3; build exige TypeScript válido. Workflow CI definido para Node 22, instalação pelo lockfile, PostgreSQL descartável, migrations TEST, testes e build, sem etapa de deploy.

## Operação local no Windows

```powershell
npm.cmd run db:test:start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-admin.ps1 -Action migrate
npm.cmd run dev:test
```

O aplicativo usa a conexão restrita de `.env.test`. Neste computador, migrations, testes de integração e backup usam a credencial administrativa TEST cifrada com DPAPI no perfil Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-admin.ps1 -Action integration
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-admin.ps1 -Action backup
npm.cmd run build
```

O arquivo protegido fica em `%LOCALAPPDATA%\SA-Capital\secrets\test-admin-env.protected` e depende do usuário Windows atual. Não deve ser copiado como solução de recuperação entre máquinas. A credencial antiga de `.env` também foi arquivada cifrada nesse diretório e retirada do arquivo local; isso **não equivale a revogar a credencial no provedor**.

Para um banco novo, `db:bootstrap:test` ou `db:bootstrap:dev` recebe JSON com nome, e-mail e senha pela entrada padrão, valida o conteúdo e só cria administrador se a tabela de usuários estiver vazia. Não colocar credenciais em argumentos, scripts versionados ou histórico do terminal.

## Estruturas novas

- `0008`: auditoria imutável, histórico FB e fila de limpeza de arquivos.
- `0009`: origem da reserva. Reservas preexistentes são conservadoramente classificadas como manuais; revisar sua origem antes de permitir liberação automática.
- `0010`: limites persistentes de autenticação.
- `0011`: fila persistente de notificações por e-mail.

Estas migrations foram aplicadas somente em TEST. O runner mantém o registro original das migrations e executa cada arquivo em sua própria transação. Provisionamento de bucket privado continua sendo uma etapa específica do provedor quando Storage não existe no banco.

## Evidências e limites da validação

Verificação em 11/09/2026: suíte completa com 195 testes aprovados em 30 arquivos; após acrescentar o cenário do alerta FB, os 23 testes de integração passaram novamente (196 cenários distintos no conjunto). TypeScript e build local aprovados. Login e logout também conferidos em Edge headless, com chegada ao painel e zero exceções JavaScript nessa navegação. `/api/ready` respondeu 200 em TEST.

Backup final desta rodada: `.local/backups/test-e3e616af8adb4378913bf6140738c65a.dump` e manifesto JSON correspondente, restaurado e conferido com sucesso.

**Alerta operacional TEST:** na retomada de 11/09, a API FB implicaria mudança de 93 das 310 cotas não reservadas para `reserved`. A proteção de variação existente bloqueou a gravação e registrou a falha no histórico persistente. O agendamento continua habilitado a cada 30 minutos, mas essa resposta não foi aplicada. Conferir o fornecedor e a origem das diferenças antes de qualquer ajuste do limite; não considerar o estoque atualizado enquanto persistir o alerta.

A suíte inclui testes reais em schema PostgreSQL descartável para isolamento de assessor, concorrência de reserva, rollback, substituição de estoque, auditoria, limites de autenticação, fila de e-mails e limpeza transacional. Integrações de envio e Storage são simuladas: não constituem homologação do serviço externo.

O backup local cria dump customizado, restaura em um banco TEST temporário e compara contagens de todas as tabelas públicas sob o mesmo snapshot. Dump e manifesto com SHA-256 ficam em `.local/backups`. O banco temporário é removido após a conferência. Essa verificação não inclui objetos Storage nem comprova recuperação de produção ou equivalência de todos os valores de cada linha.

Não foi executado teste de carga com 200 usuários simultâneos. Os testes de busca limitada e concorrência de reserva são evidência funcional, não dimensionamento de capacidade.

## Pendências obrigatórias antes de autorizar deploy

1. Revisar o diff completo, incluir arquivos novos/migrations/lockfile no controle de versão e executar o CI em Node 22. O build local utiliza o Node instalado nesta máquina; o workflow remoto ainda não foi executado.
2. Revogar/rotacionar no provedor as credenciais antigas que estiveram no `.env`, quando houver autorização operacional. Não reutilizar o arquivo cifrado como credencial permanente.
3. Separar usuário de migrations e usuário de execução em produção; conceder somente privilégios necessários, incluindo auditoria apenas INSERT/SELECT. O helper de privilégios entregue atua exclusivamente no banco local TEST.
4. Confirmar backup externo, retenção, responsáveis, objetivo de recuperação e restauração completa incluindo Storage em ambiente isolado. O dump local não substitui backup de produção.
5. Homologar bucket privado e políticas reais de Storage, envio de e-mails e domínio remetente em ambiente específico autorizado. Validar remoção física/retentativa e assinatura dos links no provedor.
6. Configurar `TRUST_PROXY_HOPS` conforme a topologia efetiva (0 local; não escolher 1/2 sem conferir os proxies), HTTPS, secrets exclusivos, readiness e alertas externos. Logs locais e aviso na interface não substituem alerta operacional.
7. Conferir origem das reservas legadas e política de cancelamento/exclusão com a operação. A auditoria técnica registra ator e valores; justificativa textual obrigatória e interface de consulta ficam como evolução pendente.

## Próximas fases

FASE 2: carga representativa para 200 usuários, paginação e índices guiados por consultas medidas, observabilidade externa, teste de recuperação com objetos, testes E2E dos provedores e revisão de retenção de dados.

FASE 3: organização dos componentes extensos da interface, consulta da auditoria pela administração, melhorias de relatórios e automação de operação conforme volume real.
