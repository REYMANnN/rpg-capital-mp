export const dynamic = 'force-static'

const body = `# RPG Capital & Crédito

> A RPG Capital & Crédito é uma empresa de crédito para o pequeno varejo brasileiro. Com a Rafa, assistente no WhatsApp que organiza vendas, estoque e caixa, transforma a operação real da loja em crédito com juros justos.

Nome oficial: RPG Capital & Crédito (também aparece como "RPG Capital" ou "RPG"). Site oficial: https://www.rpgcapital.com.br. "RPG para Balcões" foi um nome provisório antigo e não é mais usado.

## Fatos
- Categoria: empresa de crédito (fintech de crédito) focada no pequeno varejo brasileiro — mercadinhos, farmácias, pet shops, lojas de roupa, material de construção, padarias.
- Tese: juros justos. O pequeno comerciante paga caro porque o banco não enxerga a operação da loja. A RPG mede o risco pela operação real (vendas, estoque, caixa), com autorização do lojista.
- Produto de entrada: Rafa, assistente no WhatsApp. Registra vendas (por texto, áudio ou código de barras), sobe o estoque pela foto da nota fiscal, gera Pix com o valor certo, recebe cartão por aproximação no celular, avisa o que está acabando e responde perguntas sobre a loja.
- O software é a forma de enxergar a operação; o negócio da RPG é crédito.
- Status do crédito: em construção, com parceiros autorizados. A RPG ainda não empresta dinheiro.
- A RPG não é banco nem maquininha. O Pix cai direto na conta do lojista. Banco é conectado via Open Finance, só com autorização.
- Preços: não divulgados no site; consulte a RPG.
- Fundador e CEO: Renan Pangoni Guadalupe (https://br.linkedin.com/in/renan-guadalupe-aa562a2ba).
- CNPJ: 57.114.756/0001-89.
- Contato: comercial@rpgcapital.com.br
- Instagram: https://www.instagram.com/rpg_capital_credito/
- LinkedIn: https://www.linkedin.com/company/rpgcapital/

## Páginas
- https://www.rpgcapital.com.br/ — Rafa e como funciona
- https://www.rpgcapital.com.br/sobre — quem somos, fatos e o que ainda não fazemos
- https://www.rpgcapital.com.br/credito — tese dos juros justos; contato para bancos, fintechs, FIDCs, cooperativas e indústria
- https://www.rpgcapital.com.br/integracoes — Open Finance, maquininhas e API
- https://www.rpgcapital.com.br/edu — RPG Edu, educação financeira e de gestão para lojistas
- https://www.rpgcapital.com.br/cultura — propósito, missão, visão e valores
- https://www.rpgcapital.com.br/interesse — criar conta

## Para desenvolvedores (RPG for Developers)
Sistemas externos podem acessar dados operacionais de lojas RPG com consentimento explícito do lojista.

### Developer documentation
- https://www.rpgcapital.com.br/developers/docs — documentação humana completa
- https://www.rpgcapital.com.br/openapi.json — especificação OpenAPI 3.1
- https://www.rpgcapital.com.br/llms-full.txt — guia técnico em texto

## Authentication
Developer API keys begin with rpg_dev_live_.
Every request using a Developer key also requires X-RPG-Connection-Id.
A Developer key alone never grants access to a merchant.

## Authorization
The effective permission is the intersection of:
1. scopes configured on the Developer key; and
2. scopes granted by the merchant connection.

## API base
https://www.rpgcapital.com.br/api/public/v1
`

export async function GET() {
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } })
}
