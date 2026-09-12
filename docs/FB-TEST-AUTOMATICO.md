# Atualização automática do estoque em TEST

O servidor TEST pode consultar a API Fraga & Bitello na inicialização e repetir a sincronização 30 minutos após cada execução. Habilitação local em `.env.test`:

```dotenv
FB_SYNC_ENABLED=true
FB_SYNC_SCHEDULE_ENABLED=true
FB_SYNC_INTERVAL_MINUTES=30
ENABLE_SCHEDULED_JOBS=false
EMAIL_ENABLED=false
```

O agendador é limitado a APP_ENV=test. A validação do ambiente permite somente o banco local sa_capital_test. A integração faz GET na API do fornecedor e grava apenas no banco TEST. Reinicie o servidor após alterar essas variáveis. Os exemplos permanecem desativados.

Na tela Estoque, a equipe administrativa vê a próxima execução, o andamento e os cinco resultados mais recentes. O painel consulta o servidor a cada 15 segundos e a listagem se atualiza a cada 30 segundos. O endpoint autenticado `GET /api/stock/sync-fb/status` mantém as últimas 48 execuções desde a inicialização. Resultados também saem no log do servidor com prefixo `[FB TEST]`.

Cotas vinculadas a negociações não canceladas e cotas vendidas são preservadas. IDs existentes mantêm seus códigos SA; outros fornecedores permanecem intactos. Cotas FB ausentes da resposta são reservadas, nunca excluídas. Respostas vazias, inválidas, duplicadas ou com redução suspeita bloqueiam a transação inteira. Falhas aparecem no painel e são repetidas no próximo intervalo; execuções não se sobrepõem.

As regras comerciais existentes permanecem: crédito multiplicado por 0,9999; entrada acrescida de 2% do crédito ajustado; parcela acrescida de R$ 1,70; saldo calculado pela parcela ajustada vezes o prazo. Valores são arredondados em centavos.

Para monitorar durante o dia, mantenha o computador acordado, o PostgreSQL TEST e o servidor local em execução. O histórico do painel reinicia com o servidor. Desative `FB_SYNC_SCHEDULE_ENABLED` e reinicie para interromper o agendamento.

A base da entrada agora vem obrigatoriamente de `entrada_sem_comissao`, acrescida dos 2% SA sobre o credito ajustado. Campo ausente ou invalido bloqueia a carga; nao ha desconto percentual estimado nem retorno automatico ao campo `entrada` com comissao do fornecedor.
