# Balcão — cobrança Asaas e onboarding

**Data:** 2026-09-06  
**Escopo:** arquitetura de cobrança SaaS + integração com onboarding existente  
**Status:** design para revisão antes da implementação

## 1. Objetivo

Adicionar cobrança recorrente do Balcão via Asaas sem quebrar o onboarding e o Open Finance já existentes.

Regras de negócio aprovadas:

- preço do Balcão: **R$ 5,99/mês**;
- âncora de cobrança: **dia 1 de cada mês**;
- não existe pró-rata;
- cliente que entra **no dia 1** paga R$ 5,99 no próprio dia 1;
- cliente que entra **depois do dia 1** não paga imediatamente;
- no próximo dia 1, esse cliente paga **R$ 11,98**, referentes ao mês em que entrou + ao mês corrente;
- depois do primeiro ciclo, paga **R$ 5,99 todo dia 1**;
- o banco via Malvo pode ser conectado imediatamente após a configuração de pagamento;
- o objetivo financeiro é receber dos clientes antes da cobrança mensal da Malvo, planejada para o dia 8;
- a chave de produção do Asaas é lida **exatamente** de `ASAAS_API_KEY_balcao`.

## 2. Estado atual relevante

O onboarding atual já é funcional e deve ser preservado:

1. `OnboardingWizard` coleta dados da loja em 4 etapas.
2. `POST /api/balcao/onboarding` cria empresa, loja e instalação.
3. Para novos cadastros, o sistema marca Open Finance como pendente.
4. `/onboarding` detecta empresa criada + onboarding incompleto e mostra `OnboardingBankStep`.
5. A etapa bancária exige pelo menos uma conexão Malvo ativa antes de concluir.

A nova cobrança será inserida **entre a criação da loja e a conexão bancária**, sem reescrever o fluxo existente.

## 3. Fluxo final do onboarding

```text
Google Login
   ↓
Dados do negócio — 4 etapas atuais
   ↓
Empresa + loja criadas
   ↓
Pagamento Balcão — NOVO
   ↓
Cartão validado e recorrência Asaas preparada
   ↓
Conectar banco — Malvo existente
   ↓
Conta bancária ativa
   ↓
Concluir onboarding
   ↓
/manage
```

A tela de pagamento deve ser simples:

- título: `Balcão — R$ 5,99/mês`;
- texto: `Cobrança mensal todo dia 1.`;
- se a data atual for posterior ao dia 1, informar claramente que o primeiro vencimento será de R$ 11,98 e os seguintes de R$ 5,99;
- cartão é informado uma única vez;
- dados completos do cartão **nunca** são persistidos no Supabase, logs ou analytics.

## 4. Estratégia de cobrança

### 4.1 Cliente criado no dia 1

Criar somente a assinatura recorrente principal:

```text
valor: R$ 5,99
cycle: MONTHLY
nextDueDate: hoje (dia 1)
```

A primeira cobrança ocorre no próprio dia 1 e as seguintes mensalmente.

### 4.2 Cliente criado depois do dia 1

Não cobrar no cadastro.

Criar duas assinaturas Asaas usando os dados do cartão recebidos na mesma requisição, sem armazená-los:

**Assinatura inicial**

```text
valor: R$ 11,98
cycle: MONTHLY
nextDueDate: próximo dia 1
maxPayments: 1
```

Ela produz exatamente uma cobrança de R$ 11,98.

**Assinatura recorrente principal**

```text
valor: R$ 5,99
cycle: MONTHLY
nextDueDate: dia 1 do mês seguinte ao primeiro vencimento
```

Exemplo:

```text
17/09  cadastro
01/10  cobrança única de R$ 11,98
01/11  primeira cobrança recorrente de R$ 5,99
01/12  R$ 5,99
...
```

Essa abordagem foi escolhida para não depender de alteração posterior do valor da assinatura nem da habilitação de tokenização avulsa em produção.

## 5. Alternativas consideradas

### A. Uma assinatura de R$ 11,98 e alterar para R$ 5,99 depois

Rejeitada como padrão porque a documentação do Asaas condiciona determinadas alterações de assinatura com cartão à disponibilidade de tokenização em produção. Criaria dependência operacional desnecessária.

### B. Cobrar R$ 11,98 manualmente e criar assinatura depois

Rejeitada porque exigiria uma segunda ação do cliente ou uma dependência de tokenização para reutilizar o cartão.

### C. Duas assinaturas preparadas no onboarding — **escolhida**

- uma assinatura de uma única cobrança (`maxPayments: 1`) para o primeiro ciclo;
- uma assinatura recorrente de R$ 5,99 começando no mês seguinte;
- cartão informado uma vez no Balcão e enviado ao Asaas nas duas criações;
- nenhuma alteração futura de valor é necessária.

## 6. Integração Asaas

Criar módulo server-only:

```text
lib/asaas/client.ts
```

Responsabilidades:

- ler somente `process.env.ASAAS_API_KEY_balcao`;
- chamar `https://api.asaas.com/v3` em produção;
- criar/localizar cliente Asaas;
- criar assinatura com cartão;
- cancelar assinatura quando necessário;
- nunca expor API key ao cliente;
- nunca registrar chave, cartão ou CVV em logs.

O `externalReference` deve carregar IDs internos estáveis do Balcão para conciliação e idempotência.

## 7. Persistência no Supabase

### 7.1 `balcao_billing_accounts`

Uma linha por empresa.

Campos principais:

- `business_id` — PK/FK;
- `provider` — `asaas`;
- `plan_code` — `balcao_599`;
- `monthly_amount` — 5.99;
- `billing_anchor_day` — 1;
- `status` — `pending_payment_method | configured | active | past_due | cancelled`;
- `asaas_customer_id`;
- `asaas_initial_subscription_id` — nulo para cadastros no dia 1;
- `asaas_recurring_subscription_id`;
- `first_due_date`;
- `next_due_date`;
- `started_at`;
- `created_at` / `updated_at`.

Não armazenar PAN do cartão, CVV ou dados sensíveis equivalentes.

### 7.2 `balcao_billing_payments`

Ledger local das cobranças recebidas por webhook.

Campos principais:

- `asaas_payment_id` — único;
- `business_id`;
- `asaas_subscription_id`;
- `amount`;
- `due_date`;
- `status`;
- `billing_kind` — `initial | recurring`;
- `created_at` / `updated_at`.

### 7.3 `balcao_billing_webhook_events`

Idempotência de Webhooks.

Campos mínimos:

- `asaas_event_id` — PK;
- `event_type`;
- `resource_id`;
- `processed_at`.

Não é necessário persistir o payload completo.

## 8. APIs novas

### `POST /api/balcao/billing/asaas/setup`

Usada apenas durante o onboarding pela conta principal.

Entrada:

- `storeId`;
- dados de cartão;
- dados mínimos do titular exigidos pelo Asaas.

Responsabilidades:

1. autenticar usuário Google;
2. verificar que ele administra a empresa/loja;
3. localizar ou criar `balcao_billing_accounts`;
4. localizar ou criar customer no Asaas;
5. calcular datas e valores pela regra do dia 1;
6. criar a(s) assinatura(s) necessárias;
7. persistir somente IDs/status/datas;
8. devolver `ok: true`.

A rota deve ser idempotente: repetir a mesma chamada não pode criar novas assinaturas quando o billing já estiver configurado.

### `POST /api/balcao/billing/asaas/webhook`

Responsabilidades:

1. validar o header `asaas-access-token` contra um segredo próprio de Webhook;
2. rejeitar origem não autenticada;
3. usar o ID do evento como chave de idempotência;
4. atualizar cobrança e estado local;
5. responder rapidamente com HTTP 2xx após persistência válida.

Criar segredo separado:

```text
ASAAS_WEBHOOK_TOKEN_balcao
```

Ele **não** é a API key.

Eventos mínimos:

- `PAYMENT_CREATED`;
- `PAYMENT_CONFIRMED`;
- `PAYMENT_RECEIVED`;
- `PAYMENT_OVERDUE`;
- `PAYMENT_DELETED`/cancelamento quando aplicável;
- eventos de assinatura necessários para sincronizar cancelamento/inativação.

## 9. Roteamento do onboarding

`app/onboarding/page.tsx` passa a decidir entre três estados:

```text
sem empresa
  → OnboardingWizard

empresa criada + cobrança não configurada
  → OnboardingBillingStep

cobrança configurada + Open Finance pendente
  → OnboardingBankStep

billing configurado + banco conectado + onboarding concluído
  → /manage
```

`OnboardingBankStep` continua sendo a última etapa obrigatória.

O progresso visual passa de 5 para 6 etapas no fluxo total:

1–4. dados atuais  
5. pagamento  
6. conta bancária

## 10. Estado de acesso

A configuração do método de pagamento é obrigatória para avançar ao Open Finance.

Depois que o billing estiver configurado, o cliente não precisa esperar o primeiro vencimento para usar o Balcão. A cobrança pode acontecer dias depois, conforme a regra do dia 1.

No primeiro corte desta implementação, inadimplência será **registrada e exibida**, mas não bloqueará automaticamente a operação. Bloqueio automático será uma política separada para evitar desligar um pequeno comércio por falha transitória de cobrança sem uma regra explícita de tolerância.

## 11. Segurança

- `ASAAS_API_KEY_balcao` somente no servidor/Vercel;
- `ASAAS_WEBHOOK_TOKEN_balcao` separado da API key;
- HTTPS obrigatório;
- nenhum dado completo de cartão no banco;
- nenhum CVV em log;
- API key nunca enviada ao browser;
- endpoints de gestão protegidos por usuário + vínculo com empresa;
- Webhook idempotente;
- `externalReference` usado para conciliação;
- respostas e logs devem omitir segredos.

## 12. Testes obrigatórios

A implementação só é considerada pronta com testes automatizados cobrindo o fluxo como conjunto.

### Regras de calendário

- cadastro dia 1 → primeira cobrança R$ 5,99 no próprio dia 1;
- cadastro dia 2 → R$ 11,98 no próximo dia 1;
- cadastro dia 31 → R$ 11,98 no próximo dia 1;
- virada de dezembro/janeiro;
- fevereiro/ano bissexto;
- timezone Brasil sem deslocar a data de cobrança.

### Integração

- usa exatamente `ASAAS_API_KEY_balcao`;
- ausência da chave falha de forma explícita e segura;
- customer não duplica em retry;
- assinatura não duplica em retry;
- cartão não aparece em persistência/logs;
- Webhook sem token é rejeitado;
- Webhook duplicado é processado uma vez;
- `PAYMENT_RECEIVED` ativa/atualiza billing;
- `PAYMENT_OVERDUE` marca `past_due`;
- onboarding não avança para banco sem billing configurado;
- billing configurado leva à etapa Malvo já existente;
- banco continua obrigatório para concluir onboarding;
- usuários existentes não perdem acesso ao fluxo atual.

### Verificação de conjunto

Executar no mínimo:

- testes unitários das datas/regras de cobrança;
- testes de contrato do cliente Asaas com HTTP mockado;
- testes das rotas;
- testes do estado do onboarding;
- suíte existente completa;
- lint;
- build de produção.

## 13. Migração de usuários existentes

A introdução do billing não deve quebrar contas já existentes.

A migração cria registros de billing apenas para novas empresas por padrão. Contas já onboardadas permanecem acessíveis e poderão ser migradas para cobrança em uma etapa controlada posterior, evitando cobrança inesperada durante deploy.

## 14. Critério de conclusão

A feature está pronta quando um novo usuário consegue, em produção ou ambiente equivalente auditável:

```text
Google → cadastro da loja → cartão → billing Asaas configurado
→ banco Malvo conectado → onboarding concluído → Balcão liberado
```

E o banco de dados demonstra, sem depender da interface:

- customer Asaas associado à empresa;
- regra de primeira cobrança correta;
- recorrência mensal de R$ 5,99 ancorada no dia 1;
- status atualizado por Webhook;
- nenhuma credencial ou dado completo de cartão persistido.
