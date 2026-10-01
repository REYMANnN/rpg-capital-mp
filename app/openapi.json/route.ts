export const dynamic = 'force-static'

const document = {
  openapi: '3.1.0',
  info: {
    title: 'RPG API',
    version: '1.0.0',
    description: 'API para integrações autorizadas com lojas RPG. Chaves Developer usam Authorization Bearer e X-RPG-Connection-Id.',
  },
  servers: [{ url: 'https://rpgcapital.com.br/api/public/v1' }],
  security: [{ DeveloperKey: [], RPGConnection: [] }],
  components: {
    securitySchemes: {
      DeveloperKey: { type: 'http', scheme: 'bearer', bearerFormat: 'rpg_dev_live_' },
      RPGConnection: { type: 'apiKey', in: 'header', name: 'X-RPG-Connection-Id' },
    },
    schemas: {
      ApiError: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
    },
  },
  paths: {
    '/products': {
      get: {
        summary: 'Lista produtos',
        'x-rpg-scope': 'products:read',
        responses: { '200': { description: 'Produtos da loja autorizada' }, '403': { description: 'Scope ausente' } },
      },
    },
    '/products/{id}': {
      get: {
        summary: 'Consulta produto',
        'x-rpg-scope': 'products:read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Produto' } },
      },
    },
    '/inventory': {
      get: {
        summary: 'Resumo do estoque',
        'x-rpg-scope': 'inventory:read',
        responses: { '200': { description: 'Estoque' } },
      },
    },
    '/inventory/movements': {
      get: {
        summary: 'Movimentações de estoque',
        'x-rpg-scope': 'inventory:read',
        responses: { '200': { description: 'Movimentações' } },
      },
    },
    '/sales': {
      get: {
        summary: 'Lista vendas',
        'x-rpg-scope': 'sales:read',
        responses: { '200': { description: 'Vendas' } },
      },
    },
    '/sales/{id}': {
      get: {
        summary: 'Consulta venda',
        'x-rpg-scope': 'sales:read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Venda' } },
      },
    },
    '/finance/transactions': {
      get: {
        summary: 'Transações financeiras',
        'x-rpg-scope': 'finance:read',
        responses: { '200': { description: 'Transações' } },
      },
    },
    '/finance/summary': {
      get: {
        summary: 'Resumo financeiro',
        'x-rpg-scope': 'finance:read',
        responses: { '200': { description: 'Resumo financeiro' } },
      },
    },
    '/pricing/history': {
      get: {
        summary: 'Histórico de preços',
        'x-rpg-scope': 'pricing:read',
        responses: { '200': { description: 'Histórico' } },
      },
    },
    '/imports/products': {
      post: {
        summary: 'Cria ou atualiza produtos',
        'x-rpg-scope': 'products:write',
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Importação processada' } },
      },
    },
    '/imports/inventory-movements': {
      post: {
        summary: 'Registra movimentações de estoque',
        'x-rpg-scope': 'inventory:write',
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Movimentações processadas' } },
      },
    },
    '/imports/sales': {
      post: {
        summary: 'Registra vendas externas',
        'x-rpg-scope': 'sales:ingest',
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Vendas processadas' } },
      },
    },
    '/pricing/recommendations/{id}/apply': {
      post: {
        summary: 'Aplica recomendação de preço',
        'x-rpg-scope': 'pricing:write',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Preço aplicado' } },
      },
    },
  },
}

export async function GET() {
  return Response.json(document, {
    headers: {
      'cache-control': 'public, max-age=300, s-maxage=3600',
      'access-control-allow-origin': '*',
    },
  })
}
