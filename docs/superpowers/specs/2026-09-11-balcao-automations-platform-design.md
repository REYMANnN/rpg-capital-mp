# Balcão — Automações, APIs e Webhooks — Design

**Data:** 2026-09-11  
**Status:** especificação de arquitetura para implementação  
**Escopo:** software puro. Nesta fase o Balcão não movimenta dinheiro, não envia Pix, não paga boletos e não expõe APIs de movimentação bancária.

## 1. Objetivo

Transformar o Balcão em uma plataforma operacional aberta, capaz de funcionar de três formas sem obrigar o cliente a abandonar sistemas existentes:

1. **Balcão completo:** o cliente usa o front e o backend do Balcão.
2. **Balcão conectado:** o cliente mantém ERP/PDV próprio e envia/recebe dados por API e webhooks.
3. **Balcão headless:** o cliente consome dados, inteligência e automações por API e pode usar outro front.

A plataforma deve funcionar para uma loja pequena e também para redes/franquias, mantendo isolamento por negócio/loja, permissões, auditoria e contratos públicos estáveis.

## 2. Princípios

- **Software first:** nenhuma API pública de pagamento, Pix Out, boleto, transferência, carteira ou movimentação de conta nesta fase.
- **API pública estável:** terceiros nunca dependem do snapshot interno do inventário.
- **Uma regra de negócio:** front Balcão e API pública chamam os mesmos serviços internos.
- **Least privilege:** cada pessoa, chave e webhook recebe somente o acesso necessário.
- **Gerente vê toda a operação da loja:** estoque, caixa, financeiro, análises e automações.
- **TI é um perfil próprio:** enxerga e administra a área de Automações/Integrações, sem ganhar automaticamente as telas de Caixa, Estoque ou Financeiro.
- **Personalizado continua existindo:** o gestor escolhe módulos e permissões.
- **Integração não significa substituir ERP:** cada domínio pode ter uma fonte de verdade definida.
- **Auditoria por padrão:** criar/revogar chaves, alterar webhook, importar dados, aplicar preço e mudar configuração geram eventos de auditoria.
- **Sem LLM para regras críticas:** automações determinísticas, especialmente pricing e sincronização.

## 3. Arquitetura macro

```text
                        USUÁRIOS / SISTEMAS
                  ┌──────────┬───────────┐
                  │          │           │
             Front Balcão   API       Importação
                  │       Pública v1   ERP/CSV
                  └──────────┼───────────┘
                             ▼
                    CAMADA DE APLICAÇÃO
             ┌──────────────────────────────┐
             │ ProductsService              │
             │ InventoryService             │
             │ SalesService                 │
             │ FinanceReadService           │
             │ PricingService               │
             │ IntegrationsService          │
             │ AutomationsService           │
             └──────────────┬───────────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          Supabase       Event Outbox     Audit
                            │
                            ▼
                      Webhook Worker
                            │
                            ▼
                     Sistemas externos

               Malvo / Open Finance
                        │
                        ▼
                  Financeiro read-only
```

O projeto continua como **monólito modular Next.js + Supabase**. Não há microserviços nesta fase. A separação é lógica e por módulos/contratos.

## 4. Superfícies de produto

### 4.1 Área operacional

A navegação operacional passa a reconhecer os módulos:

- Estoque
- Entrada
- Caixa
- Financeiro
- **Automações**
- Ajustes (somente gestão, conforme regra atual)

A aba **Automações** usa um componente único `AutomationsHub`, reutilizável no painel de gestão.

### 4.2 Painel de gestão

O painel `/manage` passa a ter:

- Início
- Vendas
- Estoque
- Análises
- **Automações**
- Equipe
- Configurações

A seção Automações é o lugar canônico para configurar:

- Preço Inteligente
- Integrações com sistemas externos
- Chaves de API
- Webhooks
- Exportações/BI
- Logs de integração

### 4.3 UX para usuário não técnico

A primeira camada nunca começa com termos técnicos como REST, HMAC ou webhook.

A home de Automações exibe cartões:

#### Preço Inteligente
“Use custo, margem, estoque e vendas para receber sugestões ou ajustar preços automaticamente.”

#### Conectar outro sistema
“Continue usando seu sistema atual e conecte os dados ao Balcão.”

#### Usar meus dados fora do Balcão
“Leve seus dados para Excel, Power BI ou outro sistema.”

#### Integração avançada
“Chaves de acesso, webhooks e documentação para sua equipe de tecnologia.”

A terminologia técnica aparece somente após abrir “Integração avançada”.

## 5. Modelo de equipe e permissões

### 5.1 Perfis

`StaffRole` passa a aceitar:

- `cashier` — Caixa
- `stock` — Estoque
- `finance` — Financeiro
- `it` — TI
- `manager` — Gerente
- `custom` — Personalizado

### 5.2 Permissões operacionais

Permissões existentes permanecem. Acrescentar:

- `automations.view`
- `automations.manage`
- `integrations.view`
- `integrations.manage`
- `api_keys.manage`
- `webhooks.manage`

As permissões administrativas existentes (`team.manage`, `devices.manage`, `stores.manage`, `settings.manage`) continuam separadas.

### 5.3 Módulos para perfil Personalizado

`StaffModule` passa a ser:

- `stock`
- `checkout`
- `finance`
- `automations`

O módulo `automations` concede por padrão:

- `automations.view`
- `automations.manage`
- `integrations.view`
- `integrations.manage`
- `api_keys.manage`
- `webhooks.manage`

A UI personalizada começa em nível de módulo para continuar simples. Uma expansão “Permissões avançadas” permite desligar individualmente gerenciamento de chaves e webhooks.

### 5.4 Matriz padrão

| Perfil | Estoque | Caixa | Financeiro | Automações | Equipe/loja/config. |
|---|---:|---:|---:|---:|---:|
| Caixa | leitura necessária + vender | ✅ | ❌ | ❌ | ❌ |
| Estoque | ✅ | ❌ | ❌ | ❌ | ❌ |
| Financeiro | ❌ | ❌ | ✅ | ❌ | ❌ |
| TI | ❌ | ❌ | ❌ | ✅ | ❌ |
| Gerente | ✅ | ✅ | ✅ | ✅ | ✅ no escopo da loja |
| Personalizado | escolhível | escolhível | escolhível | escolhível | somente permissões explicitamente concedidas |

**Gerente:** tem acesso a todos os dados e módulos da operação da loja. Operações de propriedade da empresa, cobrança da assinatura e transferência de titularidade permanecem exclusivas de owner/admin quando existirem.

### 5.5 Equipe — UX

Na página Equipe, “Função” passa a mostrar:

- Caixa
- Estoque
- Financeiro
- **TI**
- Gerente
- Personalizado

Ao escolher TI:

> “Acesso a Automações, integrações, chaves de API e webhooks. Não libera Caixa, Estoque ou Financeiro.”

Ao escolher Gerente:

> “Acesso completo à operação, dados, equipe, automações e configurações desta loja.”

Ao escolher Personalizado, aparecem quatro cartões de módulos e um bloco opcional “Permissões avançadas”.

## 6. Automações — UX detalhada

### 6.1 Home

Cabeçalho:

> **Automações**  
> Faça o Balcão trabalhar junto com sua operação e com os sistemas que você já usa.

Seções:

1. **Ativas**
2. **Disponíveis**
3. **Conexões de dados**
4. **Avançado**

Cada cartão mostra status, última execução e ação principal.

### 6.2 Preço Inteligente

Estados:

- Desligado
- Apenas recomendar
- Automático

Configuração global da loja + override por produto.

A política de pricing é um módulo separado, mas esta área é o ponto de entrada e controle.

### 6.3 Conectar outro sistema

Wizard de 5 passos:

1. **O que você quer conectar?** ERP/PDV, e-commerce, BI/planilha ou outro.
2. **Qual direção dos dados?** trazer dados para o Balcão; usar dados do Balcão; ambos.
3. **Quais dados?** produtos, estoque, vendas, financeiro somente leitura, preços.
4. **Quem é a fonte principal?** por domínio.
5. **Testar conexão e ativar.**

O wizard cria a `integration_connection`, API key e/ou webhook conforme a necessidade.

### 6.4 Chaves de API

Lista exibe:

- nome
- prefixo da chave
- loja/negócio
- permissões
- criada por
- criada em
- último uso
- expiração
- status

Ações:

- Criar
- Revogar
- Rotacionar

A chave completa é exibida **uma única vez** na criação/rotação.

### 6.5 Webhooks

Lista exibe:

- nome
- URL
- eventos assinados
- status
- última entrega
- taxa de sucesso recente

Ações:

- Criar endpoint
- Pausar/reativar
- Alterar eventos
- Rotacionar segredo
- Enviar evento de teste
- Ver entregas

### 6.6 Logs

Exibir metadados seguros, nunca segredo ou corpo sensível integral:

- timestamp
- integração/chave
- rota/evento
- status
- duração
- request id / event id
- mensagem de erro sanitizada

## 7. API pública v1

Base interna do app:

`/api/public/v1`

Documentação externa pode apresentar a base URL sem o prefixo interno do framework.

### 7.1 Convenções

Resposta de sucesso:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_...",
    "nextCursor": null
  }
}
```

Erro:

```json
{
  "error": {
    "code": "forbidden",
    "message": "Esta chave não tem permissão para acessar este recurso.",
    "requestId": "req_..."
  }
}
```

- Datas: ISO 8601 UTC.
- Valores monetários: centavos inteiros.
- Quantidades fracionárias: `quantityMilli` para manter compatibilidade com o inventário atual.
- Paginação: cursor opaco.
- `limit`: padrão 100, máximo 250.
- Filtros temporais: `from`, `to`.
- API versionada em `/v1`.

### 7.2 Endpoints read-only

#### Produtos

- `GET /products`
- `GET /products/{id}`

Campos públicos: id, external references permitidas, barcode, nome, unidade, preço, custo médio, estoque, estoque mínimo, marca, imagem, status, timestamps.

#### Estoque

- `GET /inventory`
- `GET /inventory/movements`

#### Vendas

- `GET /sales`
- `GET /sales/{id}`

Incluir itens, total, custo histórico, CMV, lucro bruto, forma de pagamento e timestamps quando disponíveis.

#### Financeiro — somente leitura

- `GET /finance/summary`
- `GET /finance/transactions`
- `GET /finance/card-settlements`

Não existe endpoint de pagamento ou alteração de conta.

#### Pricing

- `GET /pricing/recommendations`
- `GET /pricing/history`

### 7.3 Endpoints de ingestão/alteração

- `POST /imports/products`
- `POST /imports/sales`
- `POST /imports/inventory-movements`
- `PATCH /products/{id}`
- `POST /pricing/recommendations/{id}/apply`

Limites de lote:

- até 500 registros por importação.
- corpo máximo de 5 MB por chamada.

Toda rota mutável exige `Idempotency-Key` quando a operação puder ser repetida por rede/retry.

### 7.4 Exportações simples

- `GET /exports/products.csv`
- `GET /exports/inventory.csv`
- `GET /exports/sales.csv`
- `GET /exports/transactions.csv`

A UI usa linguagem “Excel/CSV”, não exige conhecimento de API.

## 8. Scopes de API

Scopes v1:

- `products:read`
- `products:write`
- `inventory:read`
- `inventory:write`
- `sales:read`
- `sales:ingest`
- `finance:read`
- `pricing:read`
- `pricing:write`
- `webhooks:manage`

Não criar nesta fase:

- `payments:*`
- `pix:*`
- `bank:write`
- `transfers:*`

### 8.1 Regras de aprovação

`finance:read` e qualquer scope de escrita/ingestão são considerados sensíveis.

- owner/admin/manager podem aprovar diretamente.
- perfil TI pode montar a integração e gerar uma solicitação de aprovação para scopes sensíveis.
- uma chave de leitura não sensível pode ser criada por TI sem aprovação adicional.

Isso mantém TI focado em integração sem transformar esse perfil em acesso automático ao dashboard financeiro.

## 9. Autenticação da API

Formato da chave:

`rpg_live_<prefixo>_<segredo>`

Banco armazena somente:

- `key_prefix`
- `secret_hash`
- metadados

Nunca armazenar o segredo completo em texto puro.

Header:

`Authorization: Bearer rpg_live_...`

Validação:

1. extrair prefixo;
2. localizar chave ativa;
3. comparar hash em tempo constante;
4. validar expiração/revogação;
5. validar business/store;
6. validar scope;
7. aplicar rate limit;
8. registrar request id/auditoria.

## 10. Rate limits

Valores iniciais v1:

- leitura: 120 requests/minuto/chave;
- escrita/importação: 30 requests/minuto/chave;
- export CSV: 12 requests/minuto/chave;
- importação em lote: 20 requests/minuto/chave.

Resposta `429` inclui `Retry-After`.

Os limites são configuração interna, não contrato eterno; podem ser elevados por cliente sem alterar a API.

## 11. Webhooks v1

### 11.1 Eventos

Eventos suportados:

- `product.created`
- `product.updated`
- `product.archived`
- `inventory.movement.created`
- `inventory.low_stock`
- `sale.created`
- `pricing.recommendation.created`
- `pricing.price.changed`
- `finance.transaction.created`
- `finance.card_settlement.detected`
- `integration.sync.completed`
- `integration.sync.failed`
- `webhook.test`

### 11.2 Envelope

```json
{
  "id": "evt_01...",
  "type": "sale.created",
  "apiVersion": "2026-09-11",
  "occurredAt": "2026-09-11T13:00:00.000Z",
  "businessId": "...",
  "storeId": "...",
  "data": {}
}
```

### 11.3 Assinatura

Headers:

- `X-RPG-Event-Id`
- `X-RPG-Timestamp`
- `X-RPG-Signature`

Assinatura:

`HMAC-SHA256(secret, timestamp + "." + rawBody)`

O segredo do webhook é exibido uma vez e armazenado cifrado no servidor, porque o Balcão precisa dele para assinar futuras entregas.

### 11.4 Entrega e retry

Sucesso: qualquer HTTP `2xx`.

Retry automático após:

1. 30 segundos
2. 2 minutos
3. 10 minutos
4. 1 hora
5. 6 horas

Após a quinta falha, a entrega fica `failed`. O endpoint não é desativado por uma entrega isolada. Depois de 20 falhas consecutivas o endpoint é pausado automaticamente e aparece alerta na UI.

### 11.5 Outbox Pattern

Uma transação de negócio nunca espera o webhook externo.

Fluxo:

```text
regra de negócio
  -> persistência
  -> grava event_outbox
  -> responde ao usuário
  -> worker envia webhook
  -> grava delivery/result
```

Isso elimina dependência de disponibilidade do sistema do cliente.

## 12. Integrações e fonte de verdade

Cada integração define autoridade por domínio:

- `products`: `balcao | external | merge`
- `inventory`: `balcao | external`
- `sales`: `balcao | external` (append-only; evitar edição destrutiva)
- `pricing`: `balcao | external`
- `finance`: `balcao` nesta fase, pois deriva das fontes financeiras conectadas/read-only

Exemplo de franquia:

```text
products = external
inventory = external
sales = external
pricing = balcao
finance = balcao
```

O Balcão recebe produtos/estoque/vendas, calcula inteligência e pode publicar recomendações de preço sem disputar a autoridade do ERP.

## 13. Mapeamento de entidades externas

Tabela de mapeamento relaciona identificador externo e UUID interno:

- integration_id
- entity_type
- external_id
- internal_id

Exemplo:

```text
integration = erp-franquia
entity_type = product
external_id = SKU-87923
internal_id = 4c43c7f0-...
```

EAN não é usado como única identidade.

## 14. Idempotência

Toda ingestão externa recebe `Idempotency-Key`.

Registro armazena:

- api_key_id/integration_id
- idempotency_key_hash
- request_hash
- status da resposta
- resposta serializada segura
- created_at
- expires_at

Mesma chave + mesmo request retorna o mesmo resultado. Mesma chave + request diferente retorna `409 idempotency_conflict`.

Retenção inicial: 7 dias.

## 15. Banco de dados

Novas tabelas propostas:

### `balcao_api_keys`
- id
- business_id
- store_id nullable
- label
- key_prefix
- secret_hash
- scopes jsonb
- status
- created_by_user_id
- created_by_staff_id
- approved_by_user_id/staff_id nullable
- last_used_at
- expires_at nullable
- revoked_at nullable
- created_at

### `balcao_integration_connections`
- id
- business_id
- store_id
- name
- kind (`erp`, `pos`, `ecommerce`, `bi`, `custom`)
- status
- authority jsonb
- created_by
- created_at/updated_at

### `balcao_integration_entity_mappings`
- integration_id
- entity_type
- external_id
- internal_id
- timestamps
- unique `(integration_id, entity_type, external_id)`

### `balcao_webhook_endpoints`
- id
- business_id
- store_id nullable
- name
- url
- secret_ciphertext
- subscribed_events jsonb
- status
- consecutive_failures
- last_delivery_at
- created_by
- timestamps

### `balcao_event_outbox`
- id
- business_id
- store_id
- event_type
- aggregate_type
- aggregate_id
- payload jsonb
- occurred_at
- published_at nullable

### `balcao_webhook_deliveries`
- id
- event_id
- endpoint_id
- attempt
- status
- http_status nullable
- response_excerpt nullable
- next_retry_at nullable
- delivered_at nullable
- created_at

### `balcao_idempotency_records`
- id
- api_key_id
- key_hash
- request_hash
- response_status
- response_body jsonb
- expires_at
- created_at

Índices devem cobrir business/store, status, created_at e filas por `next_retry_at`/`published_at`.

## 16. Compatibilidade com inventário atual

O estado atual do inventário continua funcionando. Não realizar migração grande antes da API.

Criar `InventoryAdapter`:

```text
Public API / Services
       ↓
InventoryAdapter
       ↓
Snapshot atual
```

Terceiros nunca recebem o snapshot bruto. Quando futuramente produtos, vendas e movimentos forem normalizados em tabelas, somente o adapter muda e `/v1` permanece estável.

## 17. Serviços internos

Arquivos propostos:

```text
lib/platform/
  auth/
    apiKeys.ts
    apiScopes.ts
  contracts/
    products.ts
    inventory.ts
    sales.ts
    finance.ts
    pricing.ts
  services/
    productsService.ts
    inventoryService.ts
    salesService.ts
    financeReadService.ts
    pricingService.ts
  integrations/
    authority.ts
    entityMappings.ts
    ingestion.ts
  events/
    eventTypes.ts
    outbox.ts
  webhooks/
    signing.ts
    delivery.ts
  idempotency.ts
```

Rotas públicas devem ser adaptadores finos e não conter regra comercial complexa.

## 18. Auditoria

Aproveitar `balcao_audit_events` para registrar:

- `api_key.created`
- `api_key.revoked`
- `api_key.rotated`
- `webhook.created`
- `webhook.updated`
- `webhook.paused`
- `webhook.secret_rotated`
- `integration.created`
- `integration.updated`
- `integration.sync_started`
- `integration.sync_completed`
- `integration.sync_failed`
- `external.products_imported`
- `external.sales_imported`
- `external.inventory_imported`
- `pricing.policy_changed`

Não guardar segredos, tokens ou payloads financeiros completos na metadata de auditoria.

## 19. Segurança

- RLS e autorização por business/store continuam obrigatórias.
- API pública usa autenticação server-side; cliente nunca acessa tabelas sensíveis diretamente.
- Chaves guardadas com hash forte.
- Segredo de webhook cifrado em repouso.
- Comparação de segredo em tempo constante.
- URLs de webhook aceitam somente HTTPS em produção.
- Bloquear localhost, loopback e ranges privados para prevenir SSRF, exceto ambiente de desenvolvimento/teste explicitamente controlado.
- Timeouts curtos nas entregas de webhook.
- Limite de tamanho de resposta armazenada nos logs.
- Rate limit por chave.
- Request id e event id únicos.
- Revogação de chave efetiva imediatamente.
- Nunca incluir segredo em logs.

## 20. Testes obrigatórios

### Unitários

- matriz de permissões de cada role;
- TI enxerga somente Automações por padrão;
- Gerente recebe todos os módulos da loja;
- custom compõe módulos corretamente;
- criação/hash/verificação/revogação de API key;
- scope enforcement;
- assinatura/verificação HMAC de webhook;
- filtragem de eventos;
- retry schedule;
- idempotência;
- authority/source-of-truth;
- cursor pagination;
- adapters do inventário.

### Rotas/API

- chave válida + scope correto -> 200;
- sem scope -> 403;
- chave revogada -> 401;
- chave expirada -> 401;
- loja A nunca lê loja B;
- `finance:read` exigido para Financeiro;
- endpoints de pagamento inexistentes -> 404;
- import duplicado com mesma idempotency key não duplica venda;
- import com mesma key e payload divergente -> 409.

### Webhooks

- evento persiste antes da tentativa externa;
- 2xx conclui delivery;
- 500 agenda retry;
- assinatura muda quando body muda;
- segredo rotacionado invalida assinatura anterior;
- 20 falhas consecutivas pausam endpoint;
- evento não assinado pelo endpoint não é enviado.

### UI

- TI vê Automações e não vê Estoque/Caixa/Financeiro;
- Gerente vê tudo;
- Personalizado com somente Automações vê somente esse módulo;
- criação de chave mostra segredo uma única vez;
- revogação remove acesso imediatamente;
- configuração de webhook permite teste e exibe resultado;
- linguagem básica aparece antes da linguagem técnica.

### Regressão

Executar Accounts CI, testes existentes de inventário e `npm run build` em Node 24, preservando o pipeline atual.

## 21. Documentação a entregar junto da implementação

Criar:

```text
docs/api/README.md
docs/api/authentication.md
docs/api/scopes.md
docs/api/endpoints.md
docs/api/webhooks.md
docs/api/integrations.md
docs/api/openapi.yaml
docs/automations.md
```

A documentação deve conter exemplos de curl, respostas, erros, paginação, idempotência, assinatura de webhook, retries e exemplos de integração ERP/Excel/BI.

## 22. Fases de entrega

### Fase A — acesso e UX

- perfil TI;
- módulo Automações;
- Gerente com acesso completo da loja;
- Personalizado incluindo Automações;
- `AutomationsHub`.

### Fase B — API read-only

- API keys;
- scopes;
- produtos, estoque, vendas, financeiro e pricing read-only;
- CSV/export;
- documentação inicial.

### Fase C — webhooks

- outbox;
- endpoints;
- assinatura;
- retry;
- logs e tela de entregas.

### Fase D — ingestão externa

- integrações;
- authority/source-of-truth;
- mappings;
- idempotência;
- imports de produtos/vendas/movimentos.

### Fase E — automações de negócio

- Preço Inteligente como primeira automação real;
- futuras automações podem reutilizar a mesma infraestrutura de permissões/eventos.

## 23. Fora de escopo desta versão

- Pix Out;
- pagamento de boleto;
- transferência bancária;
- iniciação de pagamento Open Finance;
- carteira própria;
- saldo custodiado;
- emissão/gestão de cartão;
- BaaS;
- crédito;
- OAuth público para marketplace de terceiros;
- marketplace público de apps.

Esses módulos podem ser adicionados futuramente sem quebrar a plataforma de dados criada aqui.
