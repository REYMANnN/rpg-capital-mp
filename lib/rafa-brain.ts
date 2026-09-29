/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only'

import { createHash } from 'node:crypto'

import { createBalcaoDeepLink } from '@/lib/deeplink'
import { loadRafaStore, type RafaStoreState } from '@/lib/inventory/rafa-store'
import { claudeMessages, imageBlockFromDataUri, type ClaudeContentBlock, type ClaudeMessage, type ClaudeTool } from '@/lib/llm/claude'
import {
  activeProducts,
  askStorePick,
  bankBalance,
  bankStatement,
  buildRafaChanges,
  claimDailyTip,
  claimPriceReminder,
  cleanReply,
  moneyFlow,
  phoneStores,
  productView,
  salesSummary,
  searchStoreProducts,
  stockSummary,
} from '@/lib/rafa-agent'
import { rafaAiBudgetAvailable } from '@/lib/rafa-ai-usage'
import { appliedMessage, askRafaConfirmation, confirmationMessage, confirmRafaPending, getPendingRafaAction } from '@/lib/rafa-confirm'
import { formatRafaHistory, recentRafaEvents, recordRafaEvent, type RafaEventRow } from '@/lib/rafa-events'
import { processApprovedInvoiceMedia } from '@/lib/rafa-invoice'
import { loadInvoiceProofDataUri } from '@/lib/rafa-media'
import { commitRafaChanges, lastRafaOperations, rafaOperationRisks, undoLastRafaOperation, validateRafaChangesStrict } from '@/lib/rafa-ops'
import { listPendingProducts, markPendingRegistered } from '@/lib/rafa-pending-products'
import { changesForPrice, registerPendingPrice, remaining as remainingPendingPrices } from '@/lib/rafa-price-questions'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendText } from '@/lib/whatsapp'
import { FLOW_HINT, isBalcaoFlow } from '@/lib/whatsapp-flows'

// Rafa 3.0 — o "cérebro": um modelo forte (Claude) com TODO o contexto do lojista
// (conversa das últimas 48 h, o que está em andamento, memória, catálogo) e ferramentas.
// A IA decide o que fazer; o servidor valida cada escrita (limites, loja, versão, idempotência)
// e toda alteração pode ser desfeita com "desfaz".

const MAX_STEPS = 8
const CATALOG_LIMIT = 1500
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 4_500_000

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const units = (milli: number) => (Math.round(milli) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const clock = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const short = (id: string) => String(id).slice(0, 8)

export type RafaBrainSource = 'text' | 'audio' | 'image' | 'document'

export type RafaBrainInput = {
  waId: string
  storeId: string
  wamid: string
  text: string
  source: RafaBrainSource
  // Fotos desta mensagem (ids de rafa_events com media_path).
  imageEventIds?: string[]
  attachment?: { label: string; content: string }
}

export type RafaBrainOutcome = 'replied' | 'budget'

// ---------- Prompt ----------

function systemPrompt(storeName: string, otherStores: number) {
  return [
    `Você é a Rafa, assistente da loja "${storeName}" no WhatsApp, feita pela RPG Capital. Você conversa com o dono ou funcionário da loja (o lojista), um comerciante ocupado que trabalha o dia todo.`,
    otherStores > 0 ? `Este número também tem acesso a ${otherStores} outra(s) loja(s); para trocar, use trocar_loja.` : 'Este número só tem acesso a esta loja.',
    '',
    'COMO VOCÊ TRABALHA',
    '• Você recebe a conversa inteira das últimas 48 h, o que está EM ANDAMENTO (confirmação aberta, notas, produtos esperando preço, últimas alterações), a MEMÓRIA do lojista e o catálogo. Use tudo isso. Nunca aja como se não soubesse o que aconteceu antes.',
    '• Entenda a intenção, mesmo com erro de digitação ou de transcrição de áudio (leia pelo som: "coda cola" = Coca-Cola, "mi dar de loja" = mudar de loja). Marca conhecida escrita errado é a marca.',
    '• O lojista pode mudar de assunto a qualquer hora. Nada fica "travado": se havia uma pergunta aberta e ele falou de outra coisa, resolva o que ele pediu agora e, se fizer sentido, lembre da pendência em 1 linha no fim. Se ele responder a pendência com outras palavras ("pode", "manda ver", "bora", "ok", "isso"), trate como resposta a ela.',
    '• Se ele mandar outra foto no meio de algo, olhe a foto e entenda como ela se encaixa (outra parte da nota, outro produto, outra nota).',
    '',
    'FERRAMENTAS E REGRAS DE ESCRITA',
    '• Consultas (estoque, preço, vendas, banco): faça direto e responda com os números que vieram do catálogo ou das ferramentas. Nunca invente número, produto, preço ou saldo.',
    '• Alterações (preço, estoque, entrada, venda, cadastrar, remover): use alterar_loja. Pedido claro = faça direto, sem pedir confirmação; o servidor pede confirmação sozinho nos casos de risco. Depois de fazer, diga exatamente o que ficou valendo e que dá pra desfazer falando "desfaz".',
    '• Se o produto for ambíguo (ex.: 3 marcas de papel higiênico), pergunte qual, listando nome e EAN. Se faltar um dado, pergunte só o que falta.',
    '• Preço de venda de produto novo SÓ o lojista define. Nunca sugira nem invente preço de venda.',
    '• Produtos esperando preço: quando o lojista disser os preços (por número, nome, texto ou áudio, até fora de ordem), use salvar_precos com os ids da lista EM ANDAMENTO.',
    '• Confirmação aberta: se ele concordar (com qualquer palavra), use confirmar_pendente; se recusar, recusar_pendente. Se ele pedir outra coisa, a confirmação continua aberta; não a repita a cada mensagem.',
    '• Nota fiscal / cupom de compra em foto: use ler_nota (ela lê, dá entrada no que já é da loja e pede preço dos novos). Se na conversa tem outras fotos da mesma nota recentes, passe todas em foto_ids. Foto que não é nota (produto, prateleira, lista, caderno): descreva em 1 linha o que viu e faça o que ele pediu, ou pergunte o que ele quer.',
    '• "desfaz", "volta", "errei", "não era isso" logo depois de uma alteração: use desfazer.',
    '• Memória: quando o lojista contar algo sobre a loja que vale para o futuro (fornecedor, dia de entrega, apelido de produto, como prefere ser atendido) ou pedir para lembrar, use lembrar com a frase dele. Só guarde o que ELE disse, nunca suposições suas. Se ele pedir para esquecer, esquecer_fato.',
    '• Links do Balcão (vender, ler-codigo, prateleira, entrada): use gerar_link quando pedirem para abrir ou quando for claramente mais fácil pela tela.',
    '• Número sozinho de 1 a 4 sem contexto é o menu: 1 vender, 2 ler código, 3 prateleira, 4 entrada (gerar_link).',
    '',
    'COMO RESPONDER',
    '• Português do Brasil, simples, direto, gentil, como uma funcionária de confiança. Até 6 linhas. Sem markdown, sem asteriscos, sem títulos, sem assinatura.',
    '• Áudio: comece com "Entendi: " + o pedido em uma frase, depois responda.',
    '• Valores sempre em reais (R$). Ao citar produto, nome completo como está no catálogo.',
    '• Uma mensagem só por vez. Não repita o que já disse na conversa. Não mande menu.',
    '• Algo estranho que você notou sozinho (preço errado, estoque negativo) ou uma pendência: fale no máximo UMA vez. Se já falou na CONVERSA RECENTE e o lojista não respondeu, não repita; ele puxa o assunto quando quiser.',
    '• Se perguntarem quem você é: a Rafa, da RPG Capital; consulta e cuida do estoque, preços, vendas e banco da loja pelo WhatsApp.',
    '• Assunto fora da loja: responda em 1 linha e volte pra loja.',
  ].join('\n')
}

function catalogText(state: RafaStoreState) {
  const products = activeProducts(state)
  if (!products.length) return 'CATÁLOGO DA LOJA: nenhum produto cadastrado ainda.'
  const shown = products.slice(0, CATALOG_LIMIT)
  return [
    `CATÁLOGO DA LOJA (${products.length} produtos${products.length > shown.length ? `; mostrando ${shown.length}, use buscar_produtos para o resto` : ''}). Colunas: id | nome | EAN | preço | custo médio | estoque | mínimo`,
    ...shown.map((product) => [
      product.id,
      product.name,
      product.barcode,
      money(product.priceCents),
      money(Math.round(product.averageCostCents || 0)),
      units(product.stockMilli),
      units(product.minStockMilli || 0),
    ].join(' | ')),
  ].join('\n')
}

// ---------- Contexto em andamento ----------

type OpenInvoice = { id: string; status: string; supplier_name: string | null; item_count: number | null; created_at: string; media_paths: string[] }

async function loadWorkingContext(input: { waId: string; storeId: string }) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 48 * 3600_000).toISOString()
  const [pendingAction, pendingProducts, invoices, operations, memory, events] = await Promise.all([
    getPendingRafaAction(input.waId).catch(() => null),
    listPendingProducts(input.storeId).catch(() => []),
    admin.from('rafa_invoice_imports').select('id,status,supplier_name,item_count,created_at,media_paths')
      .eq('store_id', input.storeId).gte('created_at', since).order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => (data || []) as OpenInvoice[], () => [] as OpenInvoice[]),
    lastRafaOperations(input.storeId, 5).catch(() => []),
    admin.from('rafa_memory').select('id,fact,created_at').eq('store_id', input.storeId).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(80)
      .then(({ data }) => data || [], () => []),
    recentRafaEvents(input.waId, { hours: 48, limit: 80 }).catch(() => [] as RafaEventRow[]),
  ])
  const pendingValid = pendingAction && new Date(pendingAction.expires_at).getTime() > Date.now() ? pendingAction : null
  return { pendingAction: pendingValid, pendingProducts, invoices, operations, memory, events }
}

type WorkingContext = Awaited<ReturnType<typeof loadWorkingContext>>

function workingBlock(ctx: WorkingContext) {
  const lines: string[] = ['EM ANDAMENTO (dados de agora):']
  if (ctx.pendingAction) {
    const payload = ctx.pendingAction.payload as any
    const what = payload?.kind === 'invoice_media' ? 'ler a nota fiscal que ele mandou' : 'fazer estas alterações'
    lines.push(`• CONFIRMAÇÃO ABERTA (perguntada ${clock(ctx.pendingAction.created_at)}; vale até ${clock(ctx.pendingAction.expires_at)}): a Rafa perguntou se pode ${what}:`)
    lines.push(`  "${String(ctx.pendingAction.mensagem_confirmacao || '').replace(/\s*—\s*Rafa\s*$/u, '').replace(/\n+/g, ' / ').slice(0, 900)}"`)
  } else {
    lines.push('• Nenhuma confirmação aberta.')
  }
  if (ctx.pendingProducts.length) {
    lines.push(`• PRODUTOS NOVOS ESPERANDO PREÇO DE VENDA (${ctx.pendingProducts.length}). id | nome | EAN | custo | quantidade:`)
    ctx.pendingProducts.slice(0, 40).forEach((row) => lines.push(`  ${short(row.id)} | ${row.name} | ${row.barcode} | ${money(row.cost_cents)} | ${units(row.quantity_milli)}`))
  }
  if (ctx.invoices.length) {
    lines.push('• NOTAS DAS ÚLTIMAS 48 H. id | quando | status | fornecedor | itens:')
    ctx.invoices.forEach((row) => lines.push(`  ${short(row.id)} | ${clock(row.created_at)} | ${row.status} | ${row.supplier_name || '?'} | ${row.item_count ?? '?'}`))
  }
  if (ctx.operations.length) {
    lines.push('• ÚLTIMAS ALTERAÇÕES DA RAFA (a mais nova primeiro; "desfaz" desfaz a mais nova aplicada):')
    ctx.operations.forEach((row: any) => lines.push(`  ${clock(row.created_at)} | ${row.status === 'undone' ? 'DESFEITA' : 'aplicada'} | ${String(row.summary || row.tool).slice(0, 160)}`))
  }
  return lines.join('\n')
}

function memoryBlock(ctx: WorkingContext) {
  if (!ctx.memory.length) return 'MEMÓRIA DO LOJISTA: nada guardado ainda.'
  return ['MEMÓRIA DO LOJISTA (coisas que ele contou; id | fato):', ...ctx.memory.map((row: any) => `${short(row.id)} | ${row.fact}`)].join('\n')
}

// ---------- Ferramentas ----------

const PERIOD = { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes', '30dias', 'tudo'] }

const TOOLS: ClaudeTool[] = [
  { name: 'buscar_produtos', description: 'Busca produtos da loja por nome, marca ou EAN (use quando o catálogo não estiver completo ou para confirmar).', input_schema: { type: 'object', properties: { termo: { type: 'string' } }, required: ['termo'] } },
  { name: 'resumo_estoque', description: 'Visão geral do estoque: produtos, valor pelo custo e pelo preço, zerados, abaixo do mínimo.', input_schema: { type: 'object', properties: {} } },
  { name: 'vendas', description: 'Vendas registradas no Balcão no período: faturamento, número de vendas, lucro bruto, ticket, formas de pagamento, mais vendidos.', input_schema: { type: 'object', properties: { periodo: PERIOD, de: { type: 'string', description: 'AAAA-MM-DD' }, ate: { type: 'string', description: 'AAAA-MM-DD' } } } },
  { name: 'saldo_banco', description: 'Saldo agora das contas bancárias conectadas (consulta o banco na hora).', input_schema: { type: 'object', properties: {} } },
  { name: 'extrato', description: 'Movimentações bancárias do período: entradas por origem, saídas, categorias, últimos lançamentos.', input_schema: { type: 'object', properties: { periodo: PERIOD, de: { type: 'string' }, ate: { type: 'string' }, tipo: { type: 'string', enum: ['todos', 'entradas', 'saidas'] }, busca: { type: 'string' } } } },
  { name: 'fluxo_dinheiro', description: 'De onde veio e pra onde foi o dinheiro: contrapartes, grupos, gastos recorrentes, vendas do caixa x banco, notas x pagamentos.', input_schema: { type: 'object', properties: { periodo: PERIOD, de: { type: 'string' }, ate: { type: 'string' } } } },
  { name: 'ver_nota', description: 'Mostra os itens lidos de uma nota (id da lista de notas em andamento).', input_schema: { type: 'object', properties: { nota_id: { type: 'string' } }, required: ['nota_id'] } },
  { name: 'rever_imagem', description: 'Olha de novo uma foto antiga da conversa (id que aparece como [foto xxxxxxxx]).', input_schema: { type: 'object', properties: { foto_id: { type: 'string' } }, required: ['foto_id'] } },
  {
    name: 'alterar_loja',
    description: 'Faz alterações na loja. Pedido claro do lojista = chame direto. O servidor valida e, se houver risco (remover, preço abaixo do custo, muitas alterações), pede confirmação sozinho. Valores em reais (7.5), quantidades em unidades (12). Use ids do catálogo.',
    input_schema: {
      type: 'object',
      properties: {
        resumo: { type: 'string', description: 'uma frase do que está sendo feito' },
        alteracoes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['preco', 'estoque', 'entrada', 'venda', 'cadastrar', 'remover'] },
              produto_id: { type: 'string', description: 'obrigatório, exceto em cadastrar' },
              novo_preco_reais: { type: 'number' },
              novo_estoque: { type: 'number', description: 'estoque final (tipo estoque)' },
              quantidade: { type: 'number', description: 'unidades (entrada ou venda)' },
              custo_unitario_reais: { type: 'number' },
              pagamento: { type: 'string', enum: ['pix', 'card', 'cash'] },
              ean: { type: 'string' },
              nome: { type: 'string' },
              preco_reais: { type: 'number', description: 'preço de venda (cadastrar)' },
              custo_reais: { type: 'number', description: 'custo de compra (cadastrar)' },
              estoque_inicial: { type: 'number' },
              unidade: { type: 'string', enum: ['UN', 'KG'] },
            },
            required: ['tipo'],
          },
        },
      },
      required: ['resumo', 'alteracoes'],
    },
  },
  { name: 'confirmar_pendente', description: 'O lojista concordou com a CONFIRMAÇÃO ABERTA: executa.', input_schema: { type: 'object', properties: {} } },
  { name: 'recusar_pendente', description: 'O lojista recusou a CONFIRMAÇÃO ABERTA: cancela.', input_schema: { type: 'object', properties: {} } },
  { name: 'ler_nota', description: 'Lê nota fiscal/cupom de compra das fotos, dá entrada no que já é da loja e pede preço dos novos. Sem foto_ids usa as fotos desta mensagem.', input_schema: { type: 'object', properties: { foto_ids: { type: 'array', items: { type: 'string' }, description: 'ids [foto xxxxxxxx] de todas as partes da mesma nota' } } } },
  {
    name: 'salvar_precos',
    description: 'Salva o preço de venda de produtos novos que esperam preço (ids da lista EM ANDAMENTO). O produto é cadastrado com a quantidade e o custo da nota.',
    input_schema: {
      type: 'object',
      properties: {
        precos: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, preco_reais: { type: 'number' } }, required: ['id', 'preco_reais'] } },
        pular: { type: 'array', items: { type: 'string' }, description: 'ids que o lojista quer deixar pra depois' },
      },
    },
  },
  { name: 'cancelar_nota', description: 'Cancela uma nota ainda não aplicada (se já foi aplicada, use desfazer).', input_schema: { type: 'object', properties: { nota_id: { type: 'string' } }, required: ['nota_id'] } },
  { name: 'esquecer_pendencias', description: 'Descarta produtos esperando preço (todos, ou só os ids dados) e fecha a confirmação aberta. Use quando o lojista disser que não quer mais cadastrar.', input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } } },
  { name: 'desfazer', description: 'Desfaz a última alteração aplicada pela Rafa (até 48 h), se nada mudou nesses produtos depois.', input_schema: { type: 'object', properties: {} } },
  { name: 'lembrar', description: 'Guarda na memória um fato que o lojista contou (na voz dele, curto).', input_schema: { type: 'object', properties: { fato: { type: 'string' } }, required: ['fato'] } },
  { name: 'esquecer_fato', description: 'Apaga um fato da memória (id da MEMÓRIA).', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'gerar_link', description: 'Manda o link do Balcão: vender (caixa), ler-codigo, prateleira (lista de produtos) ou entrada (subir estoque). Encerra a resposta.', input_schema: { type: 'object', properties: { fluxo: { type: 'string', enum: ['vender', 'ler-codigo', 'prateleira', 'entrada'] }, texto: { type: 'string', description: 'uma linha antes do link (opcional)' } }, required: ['fluxo'] } },
  { name: 'trocar_loja', description: 'Mostra as lojas deste número para o lojista escolher. Encerra a resposta.', input_schema: { type: 'object', properties: {} } },
]

// ---------- Execução ----------

type ToolOutcome = { result: unknown; terminal?: boolean; images?: ClaudeContentBlock[] }

function byPrefix<T extends { id: string }>(rows: T[], id: unknown) {
  const key = String(id || '').trim().toLowerCase()
  if (key.length < 4) return undefined
  const matches = rows.filter((row) => row.id.toLowerCase().startsWith(key))
  return matches.length === 1 ? matches[0] : undefined
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

async function imageBlocks(paths: string[]) {
  const blocks: ClaudeContentBlock[] = []
  for (const path of paths.slice(0, MAX_IMAGES)) {
    try {
      const dataUri = await loadInvoiceProofDataUri(path)
      if (dataUri.length * 0.75 > MAX_IMAGE_BYTES) continue
      const block = imageBlockFromDataUri(dataUri)
      if (block) blocks.push(block)
    } catch (error) {
      console.error('rafa brain image load failed', error instanceof Error ? error.message : error)
    }
  }
  return blocks
}

export async function runRafaBrain(input: RafaBrainInput): Promise<RafaBrainOutcome> {
  const [budget, loaded, stores, ctx] = await Promise.all([
    rafaAiBudgetAvailable(input.storeId),
    loadRafaStore(input.storeId),
    phoneStores(input.waId).catch(() => []),
    loadWorkingContext({ waId: input.waId, storeId: input.storeId }),
  ])
  if (!budget.allowed) return 'budget'
  const { store } = loaded
  let state = loaded.state
  const otherStores = stores.filter((item) => item.id !== input.storeId).length
  const admin = createAdminClient()

  const currentImageIds = new Set(input.imageEventIds || [])
  const historyEvents = ctx.events.filter((event) => event.source_id !== input.wamid && !currentImageIds.has(event.id))
  const imageEvents = ctx.events.filter((event) => event.media_path && (event.kind === 'image' || event.kind === 'document'))
  const currentImages = imageEvents.filter((event) => currentImageIds.has(event.id))

  // Mensagem atual.
  const sourceLabel = input.source === 'audio' ? 'ÁUDIO (transcrito)' : input.source === 'image' ? 'FOTO' : input.source === 'document' ? 'ARQUIVO' : 'TEXTO'
  const nowText = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }).format(new Date())
  const currentParts: string[] = [`Agora é ${nowText} (Brasília).`, '', `MENSAGEM NOVA DO LOJISTA (${sourceLabel}):`]
  if (currentImages.length) currentParts.push(`Fotos desta mensagem: ${currentImages.map((event) => `[foto ${short(event.id)}]`).join(' ')} (as imagens estão logo abaixo)`)
  if (input.attachment) currentParts.push(`[${input.attachment.label}]\n${input.attachment.content.slice(0, 14_000)}`)
  currentParts.push(input.text.trim() ? input.text.trim().slice(0, 3000) : currentImages.length ? '(sem texto, só a foto)' : '(sem texto)')

  const firstUser: ClaudeContentBlock[] = [
    { type: 'text', text: [workingBlock(ctx), memoryBlock(ctx), formatRafaHistory(historyEvents)].join('\n\n') },
    { type: 'text', text: currentParts.join('\n') },
    ...(await imageBlocks(currentImages.map((event) => String(event.media_path)))),
  ]
  const messages: ClaudeMessage[] = [{ role: 'user', content: firstUser }]
  const system = [
    { text: systemPrompt(store.displayName || 'sua loja', otherStores), cache: true },
    { text: catalogText(state), cache: true },
  ]

  let usedPriceTool = false
  const appliedSummaries: string[] = []
  const reply = async (body: string, noMenu = false) => {
    const sent = await sendText(input.waId, body, { inReplyTo: input.wamid, noMenu })
    if (!sent.ok) throw new Error(sent.error)
  }

  const execute = async (name: string, args: any): Promise<ToolOutcome> => {
    switch (name) {
      case 'buscar_produtos': {
        const found = searchStoreProducts(state, String(args.termo || ''))
        return { result: found.length ? { produtos: found.map(productView) } : { produtos: [], observacao: 'Nenhum produto com esse termo.' } }
      }
      case 'resumo_estoque': return { result: stockSummary(state) }
      case 'vendas': return { result: salesSummary(state, args) }
      case 'saldo_banco': return { result: await bankBalance(input.storeId) }
      case 'extrato': return { result: await bankStatement(input.storeId, args) }
      case 'fluxo_dinheiro': return { result: await moneyFlow(input.storeId, state, args) }

      case 'ver_nota': {
        const invoice = byPrefix(ctx.invoices, args.nota_id)
        if (!invoice) return { result: { erro: 'Nota não encontrada. Use o id da lista de notas.' } }
        const { data } = await admin.from('rafa_invoice_imports').select('status,supplier_name,extraction').eq('id', invoice.id).eq('store_id', input.storeId).maybeSingle()
        const lines = Array.isArray((data?.extraction as any)?.lines) ? (data!.extraction as any).lines : []
        return {
          result: {
            status: data?.status,
            fornecedor: data?.supplier_name,
            itens: lines.slice(0, 80).map((line: any) => ({
              descricao: line.description,
              ean: line.ean,
              quantidade: line.quantity,
              custo_unitario: line.unit_cost_cents != null ? money(Number(line.unit_cost_cents)) : null,
              produto_da_loja: line.resolution?.status === 'resolved' ? line.resolution.candidate?.name : null,
            })),
          },
        }
      }

      case 'rever_imagem': {
        const event = byPrefix(imageEvents, args.foto_id)
        if (!event?.media_path) return { result: { erro: 'Foto não encontrada.' } }
        const blocks = await imageBlocks([String(event.media_path)])
        return blocks.length ? { result: { ok: `foto ${short(event.id)} abaixo` }, images: blocks } : { result: { erro: 'Não consegui abrir essa foto.' } }
      }

      case 'alterar_loja': {
        const items = Array.isArray(args.alteracoes) ? args.alteracoes : []
        const built = buildRafaChanges(state, items, ctx.pendingProducts)
        if ('error' in built) return { result: { erro: built.error } }
        const invalid = validateRafaChangesStrict(state, built.changes)
        if (invalid) return { result: { erro: invalid } }
        const risks = rafaOperationRisks(state, built.changes)
        if (risks.length) {
          const message = `${confirmationMessage(state, built.changes).replace(/\n\nQuer que eu faça essas alterações\?\n— Rafa$/, '')}\n\nAtenção: ${risks.join('; ')}.\nConfirma?`
          const sent = await askRafaConfirmation({ waId: input.waId, storeId: input.storeId, changes: built.changes, state, inReplyTo: input.wamid, message })
          if (!sent.ok) throw new Error(sent.error)
          return { result: { ok: 'pedido de confirmação enviado' }, terminal: true }
        }
        const committed = await commitRafaChanges({
          storeId: input.storeId,
          waId: input.waId,
          operationId: `${input.wamid}:alterar:${hash(items)}`,
          tool: 'alterar_loja',
          summary: String(args.resumo || 'alteração pelo WhatsApp').slice(0, 300),
          args: { alteracoes: items },
          // Recalcula com o estado mais novo (se a loja mudou no meio, refaz em cima do atual).
          build: (fresh) => {
            const again = buildRafaChanges(fresh, items, ctx.pendingProducts)
            return 'error' in again ? { error: again.error } : again.changes
          },
        })
        if (committed.status === 'rejected') return { result: { erro: committed.message } }
        if (committed.status === 'duplicate') return { result: { ok: 'Isso já tinha sido feito antes (não repeti).' } }
        state = committed.after
        const barcodes = committed.changes.flatMap((change) => change.kind === 'cadastrar' ? [change.barcode] : [])
        if (barcodes.length) await markPendingRegistered(input.storeId, barcodes).catch(() => {})
        const done = appliedMessage(committed.after, committed.changes).replace(/^Pronto!\n/, '').replace(/\n— Rafa$/, '')
        appliedSummaries.push(done)
        await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'action', text: `${String(args.resumo || '')}: ${done}`.slice(0, 1500) })
        return { result: { feito: done, lembrete: 'Diga o que ficou valendo e que dá pra desfazer falando "desfaz".' } }
      }

      case 'confirmar_pendente': {
        if (!ctx.pendingAction) return { result: { erro: 'Não há confirmação aberta.' } }
        const result = await confirmRafaPending(input.waId)
        if (result.kind === 'none') return { result: { erro: 'Não há confirmação aberta (talvez já tenha sido feita).' } }
        if (result.kind === 'expired' || result.kind === 'invalidated') return { result: { ok: 'mensagem enviada' }, terminal: true }
        if (result.kind === 'media') {
          await reply('Lendo sua nota, uns 20 segundos ⏳', true)
          await processApprovedInvoiceMedia({ waId: input.waId, storeId: result.storeId, importId: result.importId, autoApply: true })
          return { result: { ok: 'nota processada' }, terminal: true }
        }
        state = result.after
        const barcodes = [...new Set(result.changes.flatMap((change) => {
          if (change.kind === 'cadastrar') return [change.barcode]
          const product = result.after.products.find((item) => item.id === change.productId)
          return product?.barcode ? [product.barcode] : []
        }))]
        await markPendingRegistered(result.storeId, barcodes).catch(() => {})
        const done = appliedMessage(result.after, result.changes).replace(/^Pronto!\n/, '').replace(/\n— Rafa$/, '')
        appliedSummaries.push(done)
        await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'action', text: done.slice(0, 1500) })
        return { result: { feito: done } }
      }

      case 'recusar_pendente': {
        if (!ctx.pendingAction) return { result: { erro: 'Não há confirmação aberta.' } }
        await admin.from('rafa_pending_actions').update({ status: 'recusada' }).eq('id', ctx.pendingAction.id).eq('status', 'pendente')
        const payload = ctx.pendingAction.payload as any
        if (payload?.kind === 'invoice_media' && payload.import_id) {
          await admin.from('rafa_invoice_imports').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', String(payload.import_id)).eq('status', 'classified')
        }
        return { result: { ok: 'cancelado' } }
      }

      case 'ler_nota': {
        const ids: string[] = Array.isArray(args.foto_ids) ? args.foto_ids : []
        const chosen = ids.length ? ids.map((id) => byPrefix(imageEvents, id)).filter((event): event is RafaEventRow => Boolean(event)) : currentImages
        const paths = [...new Set(chosen.map((event) => String(event.media_path || '')).filter(Boolean))]
        if (!paths.length) return { result: { erro: 'Não achei a foto da nota. Peça para o lojista mandar a foto.' } }
        const { data: created, error } = await admin.from('rafa_invoice_imports').insert({
          wa_id: input.waId,
          store_id: input.storeId,
          media_paths: paths,
          classification: { classe: 'nota_fiscal', origem: 'rafa3' },
          status: 'classified',
        }).select('id').single()
        if (error) throw error
        await reply(paths.length > 1 ? `Lendo sua nota (${paths.length} fotos), uns 30 segundos ⏳` : 'Lendo sua nota, uns 20 segundos ⏳', true)
        try {
          await processApprovedInvoiceMedia({ waId: input.waId, storeId: input.storeId, importId: String(created.id), autoApply: true })
        } catch (error) {
          console.error('rafa brain invoice failed', error instanceof Error ? error.message : error)
          await admin.from('rafa_invoice_imports').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', created.id)
          await reply('Não consegui ler essa nota agora. Me manda de novo a foto, de frente e com boa luz (ou o PDF/XML).')
        }
        return { result: { ok: 'nota processada' }, terminal: true }
      }

      case 'salvar_precos': {
        usedPriceTool = true
        const rows = await remainingPendingPrices(input.storeId)
        const saved: string[] = []
        const errors: string[] = []
        const below: Array<{ row: (typeof rows)[number]; cents: number }> = []
        for (const entry of Array.isArray(args.precos) ? args.precos : []) {
          const row = byPrefix(rows, entry?.id)
          const cents = Math.round(Number(entry?.preco_reais) * 100)
          if (!row) { errors.push(`id ${entry?.id} não está esperando preço`); continue }
          if (!(cents > 0)) { errors.push(`preço inválido para ${row.name}`); continue }
          if (cents < row.cost_cents) { below.push({ row, cents }); continue }
          try {
            await registerPendingPrice(row, cents, input.waId)
            saved.push(`${row.name} a ${money(cents)}`)
          } catch (error) {
            errors.push(`${row.name}: ${error instanceof Error ? error.message : 'falhou'}`)
          }
        }
        const skipped: string[] = []
        for (const id of Array.isArray(args.pular) ? args.pular : []) {
          const row = byPrefix(rows, id)
          if (!row) continue
          await admin.from('rafa_pending_products').update({ status: 'pulado', current: false, updated_at: new Date().toISOString() }).eq('id', row.id)
          skipped.push(row.name)
        }
        if (saved.length) {
          appliedSummaries.push(`cadastrados: ${saved.join(', ')}`)
          await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'action', text: `preços salvos: ${saved.join(', ')}`.slice(0, 1500) })
        }
        if (below.length) {
          const fresh = (await loadRafaStore(input.storeId)).state
          state = fresh
          const changes = below.flatMap(({ row, cents }) => changesForPrice(row, cents, fresh))
          await Promise.all(below.map(({ row, cents }) => admin.from('rafa_pending_products').update({ proposed_price_cents: cents }).eq('id', row.id)))
          const message = [
            saved.length ? `Salvei ${saved.length}: ${saved.join(' · ')}.` : '',
            `${below.map(({ row, cents }) => `${row.name} a ${money(cents)} fica abaixo do custo (${money(row.cost_cents)})`).join(' · ')}. Confirma mesmo assim?`,
          ].filter(Boolean).join('\n')
          const sent = await askRafaConfirmation({ waId: input.waId, storeId: input.storeId, changes, state: fresh, inReplyTo: input.wamid, message })
          if (!sent.ok) throw new Error(sent.error)
          return { result: { ok: 'confirmação enviada' }, terminal: true }
        }
        if (saved.length) state = (await loadRafaStore(input.storeId)).state
        const left = (await remainingPendingPrices(input.storeId)).map((row) => row.name)
        return { result: { salvos: saved, pulados: skipped, erros: errors, ainda_sem_preco: left.slice(0, 20) } }
      }

      case 'cancelar_nota': {
        const invoice = byPrefix(ctx.invoices, args.nota_id)
        if (!invoice) return { result: { erro: 'Nota não encontrada.' } }
        if (invoice.status === 'applied') return { result: { erro: 'Essa nota já entrou no estoque; para voltar, use desfazer.' } }
        await admin.from('rafa_invoice_imports').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', invoice.id).neq('status', 'applied')
        await admin.from('rafa_pending_products').update({ status: 'descartado', current: false, updated_at: new Date().toISOString() }).eq('invoice_import_id', invoice.id).eq('status', 'aguardando_preco')
        return { result: { ok: 'nota cancelada' } }
      }

      case 'esquecer_pendencias': {
        const ids: string[] = Array.isArray(args.ids) ? args.ids : []
        const targets = ids.length ? ids.map((id) => byPrefix(ctx.pendingProducts, id)).filter(Boolean).map((row) => row!.id) : ctx.pendingProducts.map((row) => row.id)
        if (targets.length) await admin.from('rafa_pending_products').update({ status: 'descartado', current: false, updated_at: new Date().toISOString() }).in('id', targets)
        if (ctx.pendingAction && !ids.length) await admin.from('rafa_pending_actions').update({ status: 'invalidada' }).eq('id', ctx.pendingAction.id).eq('status', 'pendente')
        return { result: { ok: `${targets.length} produto(s) descartado(s)` } }
      }

      case 'desfazer': {
        const undone = await undoLastRafaOperation({ storeId: input.storeId, waId: input.waId })
        if (undone.status === 'nothing') return { result: { erro: 'Não tem alteração recente da Rafa para desfazer.' } }
        if (undone.status === 'blocked') return { result: { erro: undone.message } }
        state = (await loadRafaStore(input.storeId)).state
        await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'undo', text: undone.summary })
        return { result: { desfeito: undone.summary } }
      }

      case 'lembrar': {
        const fact = String(args.fato || '').replace(/\s+/g, ' ').trim().slice(0, 300)
        if (fact.length < 2) return { result: { erro: 'fato vazio' } }
        if (ctx.memory.length >= 80) return { result: { erro: 'Memória cheia; peça para apagar algo antes.' } }
        const inbound = ctx.events.find((event) => event.source_id === input.wamid)
        await admin.from('rafa_memory').insert({ store_id: input.storeId, fact, created_by_wa: input.waId, source_event_id: inbound?.id || null })
        await recordRafaEvent({ waId: input.waId, storeId: input.storeId, direction: 'system', kind: 'memory', text: `guardou: ${fact}` })
        return { result: { ok: 'guardado' } }
      }

      case 'esquecer_fato': {
        const row = byPrefix(ctx.memory as Array<{ id: string; fact: string }>, args.id)
        if (!row) return { result: { erro: 'Fato não encontrado.' } }
        await admin.from('rafa_memory').update({ deleted_at: new Date().toISOString() }).eq('id', row.id).eq('store_id', input.storeId)
        return { result: { ok: 'esquecido' } }
      }

      case 'gerar_link': {
        const fluxo = String(args.fluxo || '')
        if (!isBalcaoFlow(fluxo)) return { result: { erro: 'fluxo inválido' } }
        const link = await createBalcaoDeepLink({ waId: input.waId, storeId: input.storeId, fluxo })
        const intro = String(args.texto || '').trim() ? cleanReply(String(args.texto)) : FLOW_HINT[fluxo]
        await reply(`${[...appliedSummaries.length ? [`Feito: ${appliedSummaries.join('\n')}`] : [], intro].join('\n\n')}\n${link.url}`)
        return { result: { ok: 'link enviado' }, terminal: true }
      }

      case 'trocar_loja': {
        if (stores.length < 2) return { result: { observacao: 'Este número só tem acesso a uma loja.', loja_atual: store.displayName } }
        const sent = await askStorePick(input.waId, stores, input.wamid)
        if (!sent.ok) throw new Error(sent.error)
        return { result: { ok: 'lista enviada' }, terminal: true }
      }

      default: return { result: { erro: 'ferramenta desconhecida' } }
    }
  }

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await claudeMessages({
      storeId: input.storeId,
      waId: input.waId,
      operation: 'rafa_brain',
      system,
      messages,
      tools: TOOLS,
      maxTokens: 2000,
      temperature: 0.2,
      timeoutMs: 60_000,
    })
    const calls = response.content.filter((block): block is Extract<ClaudeContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')

    if (!calls.length) {
      const text = response.content.filter((block) => block.type === 'text').map((block: any) => block.text).join('\n').trim()
      if (!text) throw new Error('rafa_brain_empty')
      const body = cleanReply(text)
      const pending = usedPriceTool ? [] : await listPendingProducts(input.storeId).catch(() => [])
      const tip = pending.length || ctx.pendingAction ? null : await claimDailyTip(input.waId, input.storeId, state, 0).catch(() => null)
      const mentionsPrices = /pre[çc]o/i.test(body)
      const reminder = !mentionsPrices && pending.length ? await claimPriceReminder(input.waId, pending).catch(() => null) : null
      const withTip = tip && !body.includes(tip) ? `${body}\n\nDica do dia: ${tip}` : body
      await reply(reminder ? `${withTip}\n\n${reminder}` : withTip)
      return 'replied'
    }

    messages.push({ role: 'assistant', content: response.content })
    const results: ClaudeContentBlock[] = []
    let terminal = false
    for (const call of calls) {
      if (terminal) {
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify({ erro: 'resposta já enviada' }) })
        continue
      }
      let outcome: ToolOutcome
      try {
        outcome = await execute(call.name, call.input || {})
      } catch (error) {
        console.error('rafa brain tool failed', call.name, error instanceof Error ? error.message : error)
        outcome = { result: { erro: error instanceof Error ? error.message.slice(0, 300) : 'falha na ferramenta' } }
      }
      if (outcome.terminal) terminal = true
      const content = JSON.stringify(outcome.result).slice(0, 14_000)
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: outcome.images?.length ? [{ type: 'text', text: content }, ...outcome.images as any[]] : content,
      })
    }
    if (terminal) return 'replied'
    messages.push({ role: 'user', content: results })
  }

  await reply(appliedSummaries.length ? `Feito:\n${appliedSummaries.join('\n')}\nSe algo não bater, fala "desfaz".` : 'Não consegui fechar essa resposta agora. Me fala de outro jeito?')
  return 'replied'
}

export const RAFA_BRAIN_TOOLS = TOOLS.map((tool) => tool.name)
