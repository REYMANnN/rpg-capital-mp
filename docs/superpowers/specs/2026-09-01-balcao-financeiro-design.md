# Balcão Financeiro — Design

## Objetivo

Adicionar um módulo financeiro operacional ao Balcão sem misturar gestão de conta com permissões de funcionário. O módulo deve funcionar agora com dados simulados persistidos no Supabase e, depois, receber dados reais da Malvo sem trocar o contrato consumido pela interface.

## Módulos e acessos

Os únicos módulos operacionais atribuíveis por PIN são:

- **Estoque**: estoque + entrada de mercadoria.
- **Caixa**: checkout e vendas.
- **Financeiro**: dashboard financeiro e movimentações.

Papéis prontos:

- `stock`: Estoque.
- `cashier`: Caixa.
- `finance`: Financeiro.
- `manager`: Estoque + Caixa + Financeiro.
- `custom`: qualquer combinação dos três módulos acima.

Equipe, lojas, dispositivos, integrações e configurações de conta continuam exclusivas da gestão autenticada pela conta principal/Google. Nenhuma permissão personalizada por PIN pode conceder esses acessos.

## Financeiro

A aba `Financeiro` aparece no aplicativo operacional para `finance`, `manager` e `custom` que contenha a permissão financeira. Funcionários sem permissão financeira não recebem dados financeiros do endpoint, não apenas escondem a aba.

O dashboard mostra apenas informações sustentáveis por dados internos do Balcão ou, futuramente, pela Malvo:

- saldo bancário consolidado e por conta;
- entradas bancárias;
- saídas bancárias;
- fluxo líquido;
- faturamento registrado pelo Balcão;
- CMV;
- lucro bruto;
- margem bruta ponderada;
- valor do estoque a custo;
- dias de estoque estimados;
- série diária de entradas/saídas;
- série diária de faturamento/CMV;
- despesas por categoria;
- movimentações recentes com contraparte, CPF/CNPJ quando disponível, categoria, confiança e tipo de transação.

Faturamento e entradas bancárias permanecem métricas separadas. Transferências internas entre contas não contam como entrada ou saída operacional nos totais.

## Fonte dos dados

### Dados internos

Produtos já possuem `averageCostCents`. Novas vendas passam a congelar `unitCostCents` e `lineCostCents` por item no momento da venda. Isso permite CMV e margem históricos corretos. Vendas antigas sem snapshot usam custo atual apenas como fallback e são consideradas estimadas.

### Dados financeiros

O schema normalizado do Balcão terá contas e transações independentes do provedor. Nesta fase, `source = 'mock'`. Depois a Malvo gravará/normalizará no mesmo formato.

Dados mockados ficam somente no negócio/loja de teste e são identificados como demonstração na UI.

## Segurança

- Tabelas financeiras têm RLS habilitado.
- `anon` e `authenticated` não recebem acesso direto às tabelas financeiras.
- O frontend acessa dados somente por `/api/balcao/finance/dashboard`.
- O endpoint valida o contexto operacional existente e exige `analysis.financial` para sessões de funcionários.
- Usuários de gestão autenticados por Google com vínculo ativo ao negócio podem acessar o dashboard.
- `service_role` permanece apenas no servidor.

## Contrato do dashboard

A API retorna um objeto normalizado com `period`, `previewMode`, `summary`, `accounts`, `cashFlow`, `salesFlow`, `expenseCategories` e `transactions`. A UI nunca depende de campos específicos da Malvo.

## UX

O dashboard é mobile-first. Possui seletor de período (7, 30 ou 90 dias), cartões-resumo, gráficos leves sem dependência nova, contas conectadas, categorias de despesas e tabela/lista de movimentações. Quando os dados forem simulados, exibe claramente `Dados de demonstração`.
