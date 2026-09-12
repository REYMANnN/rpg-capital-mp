export type AutomationRecipeKey =
  | 'margin_protection'
  | 'smart_pricing'
  | 'low_stock'
  | 'stockout_risk'
  | 'stagnant_stock'
  | 'excess_stock'
  | 'replenishment'
  | 'missing_cost'
  | 'sales_drop'
  | 'daily_summary'
  | 'unusual_expense'
  | 'card_effective_cost'

export type AutomationMode = 'notify' | 'recommend' | 'automatic'
export type AutomationCategory = 'pricing' | 'inventory' | 'sales' | 'finance'

export type AutomationRecipe = {
  key: AutomationRecipeKey
  title: string
  shortDescription: string
  description: string
  category: AutomationCategory
  defaultMode: AutomationMode
  supportsAutomatic: boolean
  defaultConfig: Record<string, number | boolean | string>
}

export const AUTOMATION_RECIPES: AutomationRecipe[] = [
  { key:'margin_protection', title:'Proteção de margem', shortDescription:'Encontre produtos cuja margem caiu.', description:'Acompanha custo e preço para avisar quando a margem fica abaixo do limite e calcula um preço seguro.', category:'pricing', defaultMode:'recommend', supportsAutomatic:true, defaultConfig:{ minimumMarginPct:25, targetMarginPct:30, maxChangePct:5, minimumIntervalDays:7 } },
  { key:'smart_pricing', title:'Preço inteligente', shortDescription:'Use margem, giro e estoque para melhorar preços.', description:'Analisa custo, margem, vendas dos últimos 30 dias e dias de estoque. Não usa dados regionais nesta fase.', category:'pricing', defaultMode:'recommend', supportsAutomatic:true, defaultConfig:{ minimumMarginPct:25, targetMarginPct:30, maxChangePct:5, minimumSalesCount:20, minimumIntervalDays:7, stockoutDays:7, excessDays:60 } },
  { key:'low_stock', title:'Estoque baixo', shortDescription:'Veja o que chegou ao estoque mínimo.', description:'Cria um alerta quando o estoque de um produto chega ou passa abaixo do mínimo cadastrado.', category:'inventory', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{} },
  { key:'stockout_risk', title:'Risco de ruptura', shortDescription:'Antecipe produtos que podem acabar.', description:'Usa a velocidade recente de vendas para estimar quantos dias de estoque restam.', category:'inventory', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{ days:7, minimumSales30d:3 } },
  { key:'stagnant_stock', title:'Estoque parado', shortDescription:'Encontre dinheiro parado na prateleira.', description:'Mostra produtos com estoque disponível e vendas muito baixas nos últimos 30 dias.', category:'inventory', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{ maxSales30d:2, minimumStockUnits:1 } },
  { key:'excess_stock', title:'Estoque excessivo', shortDescription:'Identifique cobertura muito acima do necessário.', description:'Compara estoque e velocidade de venda para encontrar produtos com muitos dias de cobertura.', category:'inventory', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{ days:60, minimumSales30d:3 } },
  { key:'replenishment', title:'Sugestão de reposição', shortDescription:'Saiba o que comprar e em qual quantidade.', description:'Estima uma quantidade de reposição para voltar ao número de dias de cobertura escolhido.', category:'inventory', defaultMode:'recommend', supportsAutomatic:false, defaultConfig:{ reorderAtDays:7, targetDays:30, minimumSales30d:3 } },
  { key:'missing_cost', title:'Produto sem custo', shortDescription:'Evite margem falsa por cadastro incompleto.', description:'Localiza produtos com estoque ou vendas mas sem custo médio confiável.', category:'inventory', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{} },
  { key:'sales_drop', title:'Queda nas vendas', shortDescription:'Detecte desaceleração relevante cedo.', description:'Compara os últimos 7 dias com os 7 dias anteriores e sinaliza uma queda material quando há amostra suficiente.', category:'sales', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{ dropPct:20, minimumPreviousRevenueCents:10000 } },
  { key:'daily_summary', title:'Resumo da operação', shortDescription:'Consolide o que aconteceu hoje.', description:'Resume vendas, receita, CMV, lucro bruto e itens vendidos no dia.', category:'sales', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{} },
  { key:'unusual_expense', title:'Despesa fora do normal', shortDescription:'Sinalize saídas financeiras atípicas.', description:'Analisa movimentações financeiras somente em leitura. Fica silenciosa quando não há histórico suficiente.', category:'finance', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{ increasePct:35 } },
  { key:'card_effective_cost', title:'Custo efetivo do cartão', shortDescription:'Acompanhe o custo observado dos repasses.', description:'Usa conciliações observadas para estimar o custo efetivo do cartão, sem afirmar que é a taxa contratual.', category:'finance', defaultMode:'notify', supportsAutomatic:false, defaultConfig:{} },
]

export const AUTOMATION_RECIPE_MAP = new Map(AUTOMATION_RECIPES.map((recipe) => [recipe.key, recipe]))
export function getAutomationRecipe(key:string){ return AUTOMATION_RECIPE_MAP.get(key as AutomationRecipeKey) ?? null }
