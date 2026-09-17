# Revisão do Pedido Inteligente — menor saldo devedor

Data: 16/09/2026. Escopo: TEST, dados fictícios em memória. Nenhum dado de produção acessado; nenhuma regra alterada.

## Situações reproduzidas

1. Critério atual minimiza saldo/crédito, não saldo absoluto em reais. Para crédito desejado de R$ 100.000: uma cota de crédito R$ 98.000 com saldo R$ 79.000 perde para outra de crédito R$ 102.000 com saldo R$ 81.000. Proporções: 80,61% contra 79,41%. A busca completou em 17 ms.
2. Entrada sugerida de R$ 20.000 restringe o Pedido do cliente à faixa de R$ 19.000 a R$ 21.000. Uma condição com saldo R$ 60.000 e entrada R$ 23.000 aparece como alternativa principal fora do orçamento; a primeira condição tem saldo R$ 80.000 e entrada R$ 20.000. Busca completa em 1 ms.
3. Estoque fictício de 160 cotas e duas administradoras: busca completa em 79 ms, com condições distintas por entrada/saldo. Medição isolada, sem evidência de capacidade sob carga nem equivalência com estoque real.

## Avaliação

Os exemplos mostram diferenças entre o critério implementado e a interpretação possível de “menor saldo”. Não demonstram ainda que o resultado relatado pelo usuário tenha a mesma causa. Solicitar crédito, categoria, administradora, entrada sugerida e códigos retornados para reproduzir o caso em TEST.

Antes de alterar: alinhar se o objetivo deve ser menor saldo em reais ou menor proporção saldo/crédito; confirmar se entrada sugerida deve manter a faixa atual, funcionar como teto ou apenas como preferência. Alterar essas decisões muda regra de negócio e exige testes de regressão com comparação exaustiva.

Arquivo principal: `server/stock/smart-options.ts`. Interface: `client/src/pages/stock/SmartSearchModal.tsx`.
