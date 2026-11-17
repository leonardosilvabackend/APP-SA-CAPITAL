# Plano de otimização e migração do armazenamento

Status: auditoria local e camada `StorageProvider` concluídas em 29/10/2026. Nenhum deploy ou alteração em serviços externos foi realizado.

## Diagnóstico

O limite apresentado no painel do Supabase é de saída de dados (egress), não de espaço ocupado no bucket. O fluxo com maior potencial de repetição é o de logos de administradoras: são imagens exibidas em várias telas e anteriormente recebiam URLs assinadas curtas, o que reduzia o reaproveitamento de cache.

As imagens distribuídas em `client/public` somam aproximadamente 11,5 MB e já são servidas junto da aplicação. Elas não dependem do Supabase Storage.

## Inventário e classificação

| Domínio | Caminho atual | Classificação | Estratégia aprovada para a primeira etapa |
| --- | --- | --- | --- |
| Logos de administradoras | `administrators/{id}/{fileId}` | Público e reutilizável | Cache longo agora; depois mover para assets estáticos/CDN com URL versionada |
| Documentos de administradoras | `administrators/{id}/{fileId}` | Privado | Manter privado e gerar URL curta somente sob demanda |
| Foto de perfil | `profiles/{userId}/avatar` | Privado, acesso limitado | Manter privada; cache privado controlado |
| Comprovantes | `negotiations/{negotiationId}/receipts/{id}` | Sensível | Manter privado, sem cache e com download explícito |
| Documentos de pré-análise | caminho registrado em `pre_analysis_documents` | Sensível e temporário | Manter privado, sem cache e preservar expiração/limpeza |

## Controles já preparados localmente

- Logo novo convertido no navegador para WebP, limitado a 600 x 300 e 500 KB.
- Validação do limite de 500 KB repetida no servidor.
- URL assinada de logo válida por 24 horas e resposta intermediária com cache privado de 24 horas.
- Foto de perfil com URL e cache privado de uma hora.
- Logos exibidos com carregamento tardio quando aplicável.
- Aviso obrigatório de armazenamento essencial, sem consentimento para rastreamento ou marketing.
- Documentos e comprovantes continuam com `no-store`.
- Fila de limpeza de objetos preservada para exclusões transacionais.

## Lacunas antes da migração

1. Consultar no Logs Explorer do projeto o ranking real de objetos e acertos de cache.
2. Inventariar tamanho, quantidade e idade dos objetos existentes no bucket. **Ferramenta somente leitura preparada; aguarda credencial TEST isolada.**
3. Localizar objetos órfãos comparando o bucket com os caminhos registrados no banco. **Analisador preparado; nunca remove automaticamente.**
4. Reprocessar logos antigos acima do novo limite sem sobrescrever o original.
5. Criar uma interface de provedor de armazenamento antes de introduzir R2 ou outro CDN. **Concluído localmente.**
6. Configurar métricas e alertas de egress por ambiente.

## Migração reversível proposta

1. Validar cache e compressão no ambiente TEST.
2. Criar `StorageProvider` mantendo Supabase como implementação inicial. **Concluído localmente.**
3. Armazenar no banco somente provedor, chave do objeto, tipo, tamanho, checksum e versão.
4. Copiar logos para o destino público escolhido usando nomes versionados; não apagar originais.
5. Fazer leitura com fallback: novo destino primeiro, Supabase antigo em seguida.
6. Acompanhar erros e egress por pelo menos um ciclo de uso representativo.
7. Apagar objetos antigos apenas após relatório de integridade e aprovação explícita.

## Fora do escopo desta etapa

- Migração do PostgreSQL ou autenticação.
- Alteração de produção, Railway ou cobrança do Supabase.
- Publicação/deploy.
- Exclusão ou movimentação de qualquer arquivo existente.

## Critério para avançar

Avançar para a camada `StorageProvider` somente depois da aprovação deste inventário. A escolha entre assets estáticos e R2/CDN será tomada após os dados do Logs Explorer e do bucket TEST.
