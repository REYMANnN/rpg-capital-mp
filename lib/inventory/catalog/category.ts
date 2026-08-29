import type { GeneralCategory } from './types'

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function classifyGeneralCategory(...values: Array<string | undefined>): GeneralCategory {
  const text = fold(values.filter(Boolean).join(' '))
  if (!text.trim()) return 'Não classificado'

  if (/\b(pets?|racao|dogs?|cats?|cachorros?|gatos?|veterinario|veterinaria|veterinary)\b/.test(text)) return 'Pet'
  if (/\b(medicamento|medicine|medicines|pharmacy|farmacia|health|saude|drug|remedio|medical)\b/.test(text)) return 'Saúde'
  if (/\b(shampoo|conditioner|hair care|beauty|cosmetic|cosmetics|hygiene|higiene|skincare|skin care|deodorant|desodorante|soap|sabonete|toothpaste|creme dental|perfume)\b/.test(text)) return 'Higiene e beleza'
  if (/\b(cleaning|limpeza|detergent|detergente|disinfect|desinfetante|bleach|alvejante|laundry|sabao em po|amaciante)\b/.test(text)) return 'Limpeza'
  if (/\b(apparel|clothing|vestuario|camiseta|camisa|calca|roupa|shoes|calcado|tenis|dress|vestido|underwear)\b/.test(text)) return 'Vestuário'
  if (/\b(electronic|electronics|smartphone|mobile phone|cell phone|celular|notebook|laptop|computer|computador|television|tv|headphone|fone|charger|carregador|camera|tablet)\b/.test(text)) return 'Eletrônicos'
  if (/\b(book|books|livro|livros|media|dvd|blu-ray|magazine|revista|music|musica)\b/.test(text)) return 'Livros e mídia'
  if (/\b(construction|construcao|hardware|ferramenta|tool|tools|tinta|paint|cimento|parafuso|plumbing|hidraulica|eletrica)\b/.test(text)) return 'Casa e construção'
  if (/\b(utensil|utensils|utensilio|cozinha|kitchen|household goods|domestic|panela|copo|prato|talher|organizador|pote)\b/.test(text)) return 'Utilidades domésticas'
  if (/\b(food|foods|beverage|beverages|alimento|alimentos|bebida|bebidas|snack|snacks|biscoito|chocolate|refrigerante|cerveja|leite|cafe|coffee|cookie|cookies|water|agua|juice|suco)\b/.test(text)) return 'Alimentos e bebidas'
  if (/\b(other|others|outros)\b/.test(text)) return 'Outros'
  return 'Não classificado'
}
