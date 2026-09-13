# Prévia do estoque Fraga & Bitello

## Iniciar localmente

Na pasta do projeto, com o `.env` existente configurado:

```powershell
npm.cmd run dev
```

Abra `http://localhost:3000` (ou a porta definida em `PORT`) e entre com um perfil **Administrador** ou **Administrativo**.

O servidor já possui rotinas de manutenção na inicialização; elas não foram alteradas por esta implementação. O endpoint de preview abaixo executa somente leitura no banco.

## Executar somente a prévia

No console do navegador, na aba do sistema já autenticada:

```javascript
const response = await fetch('/api/stock/sync-fb/preview', {
  method: 'POST',
  credentials: 'same-origin',
});
const preview = await response.json();
if (!response.ok) throw new Error(preview.error);
console.log(preview);
console.table(preview.samples.new);
console.table(preview.samples.existing);
console.table(preview.samples.missing);
```

Essa chamada consulta a API FB real e lê o estoque atual. **Não chama `syncFbStock()`, não insere, não atualiza e não muda status.** Não há job automático novo.

Prévia real executada em 09/09/2026, somente leitura (amostras abreviadas). Contagens e códigos podem mudar nas próximas consultas:

```json
{
  "received": 415,
  "wouldCreate": 415,
  "wouldUpdate": 0,
  "wouldReserve": 0,
  "wouldReactivate": 0,
  "wouldReserveMissing": 0,
  "canSync": true,
  "blockingReasons": [],
  "samples": {
    "new": [{
      "externalId": "11843",
      "code": "101752",
      "localId": null,
      "administrator": "Volkswagen",
      "category": "Veículo",
      "originalCredit": 41616,
      "credit": 41611.84,
      "originalEntry": 19700,
      "entry": 20532.24,
      "originalInstallmentValue": 723,
      "installmentValue": 724.70,
      "installments": 63,
      "outstandingBalance": 45656.10,
      "status": "reserved",
      "fund": 0,
      "nextAdjustment": null
    }],
    "existing": [],
    "missing": []
  },
  "sampleLimit": 20,
  "note": "Prévia somente leitura. Códigos previstos serão recalculados sob bloqueio na sincronização real."
}
```

Cada lista de amostras contém até 20 registros. `wouldUpdate` conta todas as cotas recebidas que já estão integradas, incluindo aquelas cujos dados comerciais permanecem iguais. `wouldReserve` conta as transições de cotas existentes para reservado, por status da API ou desaparecimento; `wouldReserveMissing` é apenas o subconjunto desaparecido. Cotas novas que já chegam reservadas contam em `wouldCreate`.

Os códigos de novas cotas são provisórios: uma futura sincronização relê a sequência sob bloqueio. Cotas existentes conservam seu código. Sem códigos numéricos de seis dígitos, a sequência começa em `100000`; com códigos existentes, usa o maior de exatamente seis dígitos, inclusive zeros à esquerda.

## Proteções e revisão

- A API usa **Reservar = available** e **Reservado = reserved**. Status desconhecido cancela a operação.
- Crédito usa `valor_credito × 0,9999`; entrada usa `entrada + crédito ajustado × 0,02`; parcela recebe R$ 1,70; saldo é a parcela ajustada multiplicada pelo prazo. Os arredondamentos usam centavos inteiros, com meio centavo arredondado para cima.
- HTTP com erro, timeout de 60 segundos, JSON inválido, lista vazia, mais de 20.000 registros, valores essenciais inválidos ou IDs duplicados cancelam a operação.
- Somente registros com `supplier = "Fraga & Bitello"` e `externalId` preenchido participam da integração. IDs iguais de outros fornecedores não são associados; cotas FB manuais sem ID não são reservadas por desaparecimento.
- A prévia retorna `canSync: false` e explica o bloqueio se mais de 20% de uma base com pelo menos cinco cotas FB não reservadas passariam a reservado, ou se toda uma base com pelo menos duas cotas passaria a reservado. Também bloqueia quando nenhum ID recebido corresponde a uma base de pelo menos dez cotas FB integradas. Reservadas históricas não entram no primeiro cálculo.
- Essas proteções detectam respostas suspeitas, mas não comprovam a completude da API. Uma alteração comercial legítima grande também pode ser bloqueada e requer revisão. Não existe confirmação automática nem parâmetro para ignorar os bloqueios.
- A função de sincronização existente agora usa transação, trava consultiva do PostgreSQL entre processos e trava temporária de escrita da tabela para proteger a geração de códigos contra importações/cadastros simultâneos. Falha em qualquer gravação reverte toda a transação. Uma segunda sincronização é rejeitada.

A migration `0007_sharp_namor` de `external_id` foi preservada. Nenhuma nova migration é necessária para a prévia. A rota de gravação existente continua separada em `POST /api/stock/sync-fb`; **não é necessária para validar a prévia**.

Os testes usam API e banco simulados. Não é necessário iniciar o aplicativo nem conectar ao banco para rodar:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```
