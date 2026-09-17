# Atualização comercial — homologação TEST

Escopo: development/TEST. Sem commit, push, deploy ou acesso a dados de produção. Migrations executadas somente no banco TEST.

## Funcionalidades

- Visão geral não exibe a quantidade de cotas disponíveis ao perfil `user`; a resposta de métricas também omite esse campo. Os demais indicadores foram preservados.
- Estoque mostra nome, telefone e foto do assessor ativo vinculado. Sem assessor ativo, o contato efetivo é o administrador ativo cujo nome começa com Leonardo. Isso não altera `managerId`, o escopo das consultas ou as permissões.
- Perfil permite editar o próprio telefone e enviar foto PNG/JPG de até 2 MB. TEST armazena em `.local/profile-photos/`. O caminho é determinado pelo usuário autenticado, sem ID enviado pelo cliente. Downloads exigem ser o próprio usuário ou seu contato efetivo. O código de produção está preparado para o bucket privado existente, com URLs assinadas de 60 segundos; nenhum serviço de produção foi utilizado na homologação.
- Pedido Inteligente mantém a comparação por percentual do crédito, faixa de crédito ±2%, categoria e administradora únicas. Entrada → parcela máxima; parcela ou saldo devedor → entrada sugerida ±5%. No pedido por entrada, entre as entradas até 0,10 ponto percentual acima da menor entrada viável, vence a melhor relação parcela/crédito. As três comparações são calculadas em uma única exploração limitada, mantendo a capacidade máxima de duas buscas distintas. Seleções iguais são agrupadas visualmente. As alternativas fora do orçamento são identificadas; ausência de resultado parcial não é tratada como prova de inexistência.
- Cotação aberta mostra saldo devedor total abaixo das parcelas. Texto comercial segue o formato ADMINISTRADORA — CATEGORIA, crédito, entrada, cascata, saldo, transferência, seguro e cartas selecionadas, com percentual da entrada sobre o crédito final; sem detalhar comissão.
- Administradoras permite copiar características, site e nomes dos documentos. Links privados temporários não são copiados.
- Check-list usa os mesmos documentos configuráveis da Pré-análise. Os oito modos de renda PF/PJ aparecem em cards responsivos, cada um com marcações temporárias independentes e botão de copiar para WhatsApp. Não cria cadastro de cliente nem armazena as marcações.
- Gerar card fica disponível na cotação calculada. PNG 1080×1920 sem logo SA; logo da administradora sem moldura adicionada. Sequência financeira: crédito, entrada `POR R$`, prazo médio = saldo total / primeira parcela, primeira parcela, saldo total e quantidade de cotas/consulta à cotação completa. Prazo com até duas casas decimais, omitindo zeros desnecessários (`40`, `40,1`, `40,16`). Removidos os rodapés ilustrativo e de fórmula; parcelas em cascata preservadas na cotação completa. Parcela zero não causa divisão por zero. A geração é local no navegador; a IA não gera valores nem é chamada a cada card.
- Baixar estoque inclui o estoque consolidado SA e FB, com códigos originais e SA e valores persistidos pelas importações. Não consulta, reimporta ou recalcula a API durante o download. Cotas protegidas continuam no arquivo conforme seu status atual.

## Imagens do card

Assets: `client/public/promo/property.png` e `client/public/promo/vehicle.png`. Gerados com a ferramenta integrada da skill imagegen. Logo da administradora e dados financeiros são sobrepostos pelo Canvas; os fundos foram preservados na revisão de layout.

Prompt imóvel:

> Photorealistic luxury modern Brazilian two-story house, glass facade, warm interior lights at sunset, tasteful landscaping. Landscape 1536x1024. Intended as photographic background for SA Capital promotional consortia cards matching premium dark navy financial marketing. No text, no logos, no numbers, no watermark, no badges, no graphic frames. House centered, dusk sky and dark foreground provide space for later code-rendered overlays.

Prompt veículo:

> Photorealistic premium dark gray SUV, generic unbranded design, three-quarter front view, parked outside a modern glass building at sunset with warm lighting. Landscape 1536x1024. Intended as photographic background for SA Capital promotional consortia cards matching premium dark navy financial marketing. No text, no logos, no license plate text, no numbers, no watermark, no badges, no graphic frames. SUV centered with dark foreground and sky for later code-rendered overlays.

## Homologação

Validação em 15/09/2026, Node 24.18.0, PostgreSQL TEST local:

- `npm run check`: aprovado, também executado pelo build.
- `npm test`: 44 arquivos aprovados, 270 testes aprovados, 28 opcionais não executados (integração/carga), nenhuma falha. Relatório da revisão visual: `.local/test-commercial-layout.json`.
- `npm run build`: aprovado. Avisos não impeditivos de comentários na dependência Zod e bundle principal de 502,31 kB (146,21 kB gzip). A primeira tentativa da revisão visual foi bloqueada por leitura do sandbox; a repetição autorizada passou. As imagens promocionais são carregadas somente na geração do card, somando aproximadamente 4,34 MB em disco.
- `git diff --check`: aprovado; avisos de conversão LF/CRLF não representam erros de whitespace.
- E2E em Edge headless: 16 etapas aprovadas, sem exceções JavaScript — login, check-list/cópia, administradora/cópia, exportação, Pedido Inteligente, saldo e cópia da cotação, PNG, salvar, solicitar/aprovar reserva, cancelar/liberar, paginação de pré-análises e logout; inclui oito cards do Check-list e três alternativas distintas do Pedido Inteligente, lado a lado no desktop (1440 px) e empilhados sem overflow horizontal no celular (390 px). Resultado e PNG: `.local/e2e/fef23efd-7ad8-4aef-b810-9be8b4b7240c/`. O teste registra o texto após resolução da chamada real à API Clipboard, evitando depender da leitura do clipboard do sistema no headless.
- Smoke adicional com contas temporárias de TEST: upload e leitura real da foto local, telefone do assessor, contato vinculado, acesso de terceiros bloqueado, fallback Leonardo, quantidade omitida no backend e exportação negada ao usuário comum. Contas/fotos temporárias removidas ao final. Resultado: `.local/profile-smoke-result.json`.
- Buscas comparadas com enumeração exaustiva em estoques pequenos para os três critérios; orçamento inviável, resultados parciais, saldos negativos e faixa inclusiva de 0,10 ponto percentual cobertos. Exportação XLSX lida nos testes para confirmar dados SA e FB e suas permissões.

PNG de veículo com logo CNP sem moldura conferido visualmente; ausência do logo SA/rodapés e prazo inteiro sem decimais confirmados. Prazo fracionário/arredondamento/indisponível cobertos pelos testes. Antes de autorizar produção, homologar o visual com suas cotações reais (inclusive imóvel e junção), menor saldo/entrada sugerida, contato do assessor e colagem no WhatsApp em navegador normal e celular. Os testes opcionais de carga/banco não foram repetidos nesta atualização; a suíte não comprova capacidade em produção.

Nesta revisão foi criada e aplicada somente em TEST a migration `0013_bored_blink.sql`: classificação PF/PJ dos tipos de renda e snapshot dos documentos exigidos nas pré-análises. O backfill usa a configuração existente e os padrões conhecidos; tipos históricos sem configuração correspondente permanecem com snapshot nulo. Não foi executada migration de produção. Antes de produção, cadastrar foto/telefone reais do assessor e garantir cadastro ativo de Leonardo; validar upload/leitura no Storage privado de homologação. A configuração TEST não utiliza credenciais externas de Storage.

## Operação e pontos de atenção

- Revisão visual: contato do assessor com foto circular, fundo discreto, hierarquia de nome/telefone e ícone de telefone; Pedido Inteligente com até três cards lado a lado no desktop, empilhados no celular, e rolagem individual das cotas. Textos de fórmula/faixas/percentuais removidos da interface; avisos de resultado parcial e alternativa fora do orçamento preservados. Nesta revisão, os limites, cálculos monetários e permissões foram preservados; a seleção das alternativas foi ampliada para permitir o segundo fator vazio. A remoção dos textos não constitui garantia de sigilo do algoritmo.

- TEST disponível em `http://localhost:3000`. Foto e telefone são cadastrados em **Perfil → Foto e contato**. Sem foto, o círculo exibe iniciais; sem telefone, informa que não foi cadastrado. Se TEST não tiver administrador ativo chamado Leonardo, informa contato não configurado. Não são inventados contatos nem alterados vínculos/permissões.
- O fallback identifica Leonardo por nome e ordenação estável. Se houver mais de um administrador com esse nome, revisar o cadastro antes de produção; futura configuração por ID evita ambiguidade.
- Fotos de perfil usam o bucket privado já configurado; uploads e URLs assinadas em Supabase precisam de homologação separada. A exclusão de conta ainda não remove automaticamente a foto armazenada; prever limpeza controlada de objetos órfãos conforme a política de retenção.
- A planilha é o estoque persistido consolidado, incluindo FB e cotas reservadas preservadas que tenham saído do fornecedor. Não é uma fotografia separada exclusiva do último lote FB. Essa escolha preserva a informação e o status atual, sem liberar ou excluir cotas.
- A busca permanece limitada a 1,5 segundo/250 mil estados e duas tarefas distintas concorrentes. Estoques grandes podem produzir resultados parciais explicitamente sinalizados; não são apresentados como mínimos absolutos.
- `.local/`, credenciais locais e resultados não entram no Git. Nenhum commit, push, deploy, migration ou alteração de produção foi executado.

## Revisão de 16/09/2026 — seleção de artes e configurações

- Campo monetário do Pedido Inteligente com máscara BRL durante a digitação, mantendo reais inteiros: digitar 1000000 representa R$ 1.000.000,00. Segundo fator explicitamente opcional; zero preenchido continua sendo um limite válido.
- Sem segundo fator: alternativas de menor entrada, menor parcela e menor saldo devedor, com o critério principal primeiro. Seleções iguais são agrupadas com flags, podendo haver menos de três cards distintos. Com segundo fator: Pedido do cliente, menor critério principal e menor critério secundário para o crédito desejado. Avisos de busca parcial e orçamento preservados.
- Texto copiado da cotação inclui novamente o percentual entrada/crédito, calculado com a entrada final.
- Administrador pode criar, renomear e excluir tipos de renda PF/PJ, além de editar os documentos no Check-list. Pré-análise e Check-list compartilham configuração; rascunhos novos guardam os requisitos no momento da criação. Renomear/excluir configuração não reescreve a renda nem os requisitos históricos salvos.
- Pesquisa de usuários por nome, e-mail ou telefone, limitada aos registros já autorizados pelo backend.
- Seletor de arte com Moderno veículo, Destaque veículo e Moderno caminhão. Imóvel oferece Moderno e Destaque. Formatos retrato 1080×1920 e quadrado 1080×1080, com prévia e download local em PNG. Logos sem moldura adicionada; sem logo SA. Valores renderizados pelo Canvas, sem chamadas de IA por download.
- Fundo adicional: `client/public/promo/truck.png`, gerado com imagegen. Os três fundos somam aproximadamente 6,43 MB, carregados apenas ao gerar cards.

Prompt caminhão:

> Photorealistic modern generic unbranded silver heavy highway tractor truck with trailer, three-quarter front view, parked at modern logistics warehouse at sunset, warm dusk lights, Brazilian commercial consortia premium advertising background. Landscape 1536x1024, clean photo only. No text, no logos, no watermark, no badges, no frames, no finance figures, no vehicle brands or license plate lettering. Truck centered and fully recognizable, matching dark navy premium marketing photo palette with room around subject for later code overlays.

Validação desta revisão: `npm run check` aprovado; `npm test` com 46 arquivos e 279 testes aprovados, 28 opcionais skipped e zero falhas (`.local/test-update-artwork.json`); `npm run build` aprovado. Bundle principal 516,04 kB / 150,21 kB gzip; avisos de tamanho e comentários Zod continuam não impeditivos. Os resultados de 15/09 acima são a referência da revisão anterior.

Pendências de homologação: conferir artes com cotações reais nos dois formatos e em celular/WhatsApp; validar Storage privado de homologação para fotos; repetir carga se necessário antes de liberar produção. Configuração de renda usa a atualização completa de settings já existente: administradores devem evitar edições simultâneas para não sobrescrever mudanças uns dos outros. Nenhum serviço ou dado de produção foi utilizado.

E2E final desta revisão: 23 etapas aprovadas, nenhuma exceção JavaScript. Inclui digitação real de um milhão de reais, segundo fator vazio, três critérios distintos, edição de renda e preservação histórica, seleção de arte e formato, imagens de imóvel, reserva/cancelamento/liberação. Resultado e PNGs em `.local/e2e/14f63a96-fdb3-468f-b6d7-80a9fca16c01/`. Cards de caminhão e Destaque imóvel conferidos visualmente. `git diff --check` aprovado.


## Preparação final para produção

A revisão seguinte corrige menor saldo em reais, elimina flags repetidas e adiciona controle de conflito de configurações e validação de documentos no backend. O cursor da máscara passou a ser restaurado de forma síncrona, corrigindo uma falha encontrada durante a digitação real sob carga. Consulte `docs/PREPARACAO-COMERCIAL-PRODUCAO.md` para as mudanças, pré-flight da migration, ordem de liberação e rollback. Os contadores do pré-flight de TEST foram zero. E2E: 25 etapas aprovadas, sem exceções JavaScript, em `.local/e2e/23b43bd2-124d-4241-88ca-7d664520a5dd/`. Suíte padrão: 281 testes aprovados e 28 opcionais skipped em `.local/test-production-preparation.json`. A ressalva anterior de sobrescrita de configurações foi corrigida: atualizações com versão desatualizada são rejeitadas com HTTP 409.

Validação final em Node 22.23.2: 308 testes aprovados (incluindo 27 de PostgreSQL), um teste opcional de carga skipped, zero falhas. Check, build e `git diff --check` aprovados. Documento final: `docs/PREPARACAO-COMERCIAL-PRODUCAO.md`. Produção inalterada.
