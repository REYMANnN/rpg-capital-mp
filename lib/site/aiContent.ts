// Conteúdo em texto puro do site público, para buscadores e IAs (llms-full.txt e versões .md das páginas).
// Mantém o mesmo texto das páginas — se mudar uma página, atualize aqui também.

export const SITE = 'https://www.rpgcapital.com.br'

export const SUMMARY =
  'A RPG Capital & Crédito é uma empresa de crédito para o pequeno varejo brasileiro. Com a Rafa, assistente no WhatsApp que organiza vendas, estoque e caixa, transforma a operação real da loja em crédito com juros justos.'

export type Faq = readonly (readonly [string, string])[]

export const FAQ_SOBRE: Faq = [
  [
    'A RPG Capital & Crédito é um banco?',
    'Não. A RPG não é instituição financeira. O crédito está sendo construído com parceiros autorizados pelo Banco Central. O Pix das vendas cai direto na conta da loja.',
  ],
  [
    'A RPG Capital & Crédito é uma empresa de software?',
    'Não. A RPG é uma empresa de crédito. A Rafa, assistente no WhatsApp, é a porta de entrada: organiza a loja e torna visível a operação real, que é a base para um crédito com juros justos.',
  ],
  ['Quanto custa usar a Rafa?', 'Os preços não são divulgados no site. Fale com a RPG pelo comercial@rpgcapital.com.br.'],
  ['Quem fundou a RPG Capital & Crédito?', 'Renan Pangoni Guadalupe, fundador e CEO. Ele estuda Administração no Insper.'],
  ['"RPG para Balcões" é a mesma empresa?', 'Foi um nome provisório antigo da RPG Capital & Crédito e não é mais usado.'],
  ['Como falar com a RPG?', 'Pelo e-mail comercial@rpgcapital.com.br, pelo Instagram @rpg_capital_credito ou pelo LinkedIn da RPG Capital.'],
] as const

export const FAQ_CREDITO: Faq = [
  [
    'A RPG Capital & Crédito já oferece empréstimo?',
    'Ainda não. A frente de crédito está em construção e será oferecida por parceiros autorizados pelo Banco Central. Lojistas podem criar conta e usar a Rafa hoje para chegar prontos quando o crédito chegar.',
  ],
  [
    'O que são juros justos?',
    'Juro do tamanho do risco real da loja. Quando quem empresta enxerga a operação — vendas, margem, estoque e caixa — o risco é medido de verdade, e o lojista bom deixa de pagar pelo risco que o banco não consegue ver.',
  ],
  [
    'Quais dados a RPG usa para analisar uma loja?',
    'Três camadas, sempre com autorização do lojista: a operação (vendas, estoque, margem e giro, pela Rafa), o dinheiro (saldo, entradas e saídas, pelo Open Finance) e as vendas no cartão (débito, crédito, parcelas e estornos, pela maquininha).',
  ],
  [
    'O lojista pode desconectar os dados?',
    'Sim. Nenhum dado da loja é compartilhado sem autorização, e o lojista pode desconectar quando quiser.',
  ],
  [
    'Quem pode ser parceiro de crédito da RPG?',
    'Bancos, fintechs de crédito, FIDCs, cooperativas de crédito, indústria e distribuidores. O contato é pelo formulário da página de crédito ou pelo comercial@rpgcapital.com.br.',
  ],
] as const

const faqMd = (faq: Faq) => faq.map(([q, a]) => `### ${q}\n${a}`).join('\n\n')

export type AiPage = { path: string; md: string; title: string; body: string }

export const AI_PAGES: AiPage[] = [
  {
    path: '/sobre',
    md: '/sobre.md',
    title: 'Sobre a RPG Capital & Crédito',
    body: `${SUMMARY}

## Em resumo
- Nome: RPG Capital & Crédito (também chamada de RPG Capital)
- O que é: empresa de crédito para o pequeno varejo brasileiro
- Produto: Rafa — assistente no WhatsApp que registra vendas, sobe estoque pela foto da nota, gera Pix e responde sobre a loja
- Para quem: mercadinhos, farmácias, pet shops, lojas de roupa, material de construção, padarias e outros pequenos comércios
- Tese: juros justos — medir o risco pela operação real da loja (vendas, estoque, caixa), não só por balanço e histórico bancário
- Crédito: em construção, com parceiros autorizados. Ainda não oferecemos empréstimo
- Fundador e CEO: Renan Pangoni Guadalupe (https://br.linkedin.com/in/renan-guadalupe-aa562a2ba)
- CNPJ: 57.114.756/0001-89
- Contato: comercial@rpgcapital.com.br
- Instagram: https://www.instagram.com/rpg_capital_credito/
- LinkedIn: https://www.linkedin.com/company/rpgcapital/

## Por que existimos
O sistema financeiro não foi feito para o comerciante de bairro. Banco empresta olhando balanço, contador e histórico. O pequeno comerciante tem outra coisa: uma loja que vende todo dia. Como o banco não enxerga essa operação, ele nega ou cobra caro.

A RPG Capital & Crédito resolve isso por dentro da loja. A Rafa organiza vendas, estoque e caixa — e, com a autorização do lojista, essa operação real vira a base de um crédito com custo claro e juros justos.

## O que fazemos hoje
- Rafa no WhatsApp: vendas, estoque pela foto da nota fiscal, Pix com valor certo, avisos de reposição e respostas sobre a loja.
- Cartão no celular: recebimento por aproximação no próprio celular, com ativação simples.
- Integrações: conexão com banco via Open Finance e API para sistemas parceiros, sempre com autorização do lojista.
- RPG Edu: educação financeira e de gestão para quem toca loja — guias, videoaulas e calculadoras grátis.

## O que a RPG ainda não faz
- Ainda não emprestamos dinheiro. O crédito está sendo construído com parceiros autorizados.
- Não somos banco nem maquininha. O Pix cai direto na conta da loja.
- Nenhum dado da loja é compartilhado sem autorização do lojista.

## Perguntas frequentes
${faqMd(FAQ_SOBRE)}`,
  },
  {
    path: '/',
    md: '/index.md',
    title: 'RPG Capital & Crédito — Crédito justo para o pequeno varejo',
    body: `${SUMMARY}

## A Rafa: sua loja mais organizada pelo WhatsApp
A Rafa é a assistente da RPG Capital & Crédito no WhatsApp. O lojista manda mensagem, foto ou áudio — do jeito que fala no balcão — e ela organiza venda, estoque, lista de compras e financeiro. Sem planilha e sem sistema difícil.

### O que a Rafa faz
- Estoque sem planilha: tirou foto da nota fiscal do fornecedor, a Rafa lê produto, quantidade e custo e cadastra tudo. Ela só pergunta o que não conseguiu ler.
- Venda simples: escaneie o produto ou só fale o que vendeu. A venda fica registrada e o estoque baixa sozinho.
- Pix ou cartão: a Rafa gera o QR Code do Pix com o valor certo ou abre o pagamento por aproximação no celular.
- Saiba o que está acabando: avisos de estoque baixo e lista de compras pronta.
- Seu dinheiro no lugar: conecte o banco com segurança (Open Finance) e veja para onde o dinheiro da loja está indo, sem trocar de banco.
- Cada um no seu lugar: cada funcionário com o seu acesso.
- Resumo do dia no WhatsApp: quanto vendeu, comparação com ontem, mais vendidos e o que precisa comprar.
- Perguntas em linguagem natural: "Quanto vendi hoje?", "O que mais dá lucro?".

## Mais controle hoje. Crédito mais justo amanhã.
O histórico de vendas, pagamentos e compras fica organizado. A RPG entende melhor a realidade da loja — e isso é a base para oferecer crédito mais adequado no futuro.

## Para quem
Mercadinho, farmácia, pet shop, loja de roupas, material de construção, papelaria, conveniência, padaria, açougue e hortifruti.

## Como começar
1. Crie sua conta no formulário de inscrição: ${SITE}/interesse
2. Ative a Rafa no seu WhatsApp.
3. Mande a primeira nota ou venda. Conectar o banco é opcional.

## Perguntas frequentes
### O que é a RPG Capital & Crédito?
Uma empresa de crédito para o pequeno varejo brasileiro. Usa a operação real da loja — vendas, estoque e caixa — para construir crédito com juros justos.
### A RPG cobra taxa no Pix?
Não. O Pix cai direto na conta da loja.
### Preciso trocar de banco ou de maquininha?
Não. E, se quiser, o celular também recebe cartão por aproximação — a ativação sai no mesmo dia ou no seguinte.
### Preciso de computador?
Não. Tudo funciona no celular e no WhatsApp. O painel também abre no computador.
### Meus dados estão seguros?
O banco é conectado pelo Open Finance, só com autorização, e o lojista desconecta quando quiser.`,
  },
  {
    path: '/credito',
    md: '/credito.md',
    title: 'Crédito — Juros justos começam com dados reais',
    body: `O pequeno comerciante paga caro porque o banco não enxerga a loja dele. A RPG Capital & Crédito enxerga.

## O problema
Quem sustenta a economia real é quem tem menos acesso a crédito. O banco não vê o giro, a margem nem a sazonalidade da loja. O que ele não consegue medir, ele nega ou cobra caro. Segundo o Sebrae (Pulso dos Pequenos Negócios, 13ª edição, divulgada em 17/09/2026), 46% dos pequenos negócios que pediram crédito tiveram o pedido aprovado em julho de 2026 — o melhor resultado desde 2022.

## A tese dos juros justos
Risco que não se vê vira juro alto. Risco medido vira juro justo.
- Hoje: o banco avalia a loja por papelada. Sem enxergar a operação, o risco parece alto — e o juro sobe para todo mundo.
- Com a RPG: a operação real fica visível — o que a loja vende, quanto lucra em cada produto, como o dinheiro entra e sai.
- Resultado: juro do tamanho do risco real.

## O que a RPG enxerga (sempre com autorização do lojista)
| Camada | O que mostra | De onde vem |
|---|---|---|
| Operação | Produtos vendidos, estoque, margem por produto e giro | Rafa (vendas, estoque e notas) |
| Dinheiro | Saldo, entradas e saídas: salários, contas, fornecedores | Banco do lojista, via Open Finance |
| Vendas no cartão | Débito, crédito, parcelas e estornos | Maquininha |

## Compromissos
- Não empurramos crédito. Crédito mal oferecido destrói negócio.
- Custo e limite claros antes de tudo.
- Parcela que cabe no caixa: o limite é calculado pelo fluxo real da loja.
- Linguagem simples.

## Para parceiros
A RPG é a ponte entre a operação do varejo e quem empresta: bancos, fintechs de crédito, FIDCs, cooperativas de crédito, indústria e distribuidores.
- Originação: lojistas com operação comprovada chegam com dados prontos para análise.
- Score dinâmico: risco atualizado a cada venda, não uma vez por ano.
- Monitoramento: saúde da carteira pelo fluxo real da loja.
- Crédito na cadeia: indústria e distribuidor financiam o lojista com base no sell-out.

A frente de crédito da RPG está em construção. A RPG não é instituição financeira; o crédito será oferecido por parceiros autorizados pelo Banco Central. Contato: comercial@rpgcapital.com.br

## Perguntas frequentes
${faqMd(FAQ_CREDITO)}`,
  },
  {
    path: '/integracoes',
    md: '/integracoes.md',
    title: 'Integrações — RPG for Developers',
    body: `Sistemas externos podem acessar dados operacionais de lojas RPG com consentimento explícito do lojista.

## Como funciona
1. Crie seu app no RPG for Developers (login com Google).
2. Gere sua chave e defina os scopes que ela pode usar.
3. Gere um link com os acessos desejados e envie ao lojista para autorizar.
4. Com a chave e o Connection ID, acesse apenas o que foi autorizado.

## O que a API cobre
Produtos, estoque, vendas, financeiro, preços e webhooks.

## O lojista continua no controle
- Uma chave Developer sozinha não acessa nenhuma loja.
- Cada conexão exige autorização explícita do proprietário ou administrador.
- Leitura e escrita são permissões separadas.

Documentação: ${SITE}/developers/docs · OpenAPI: ${SITE}/openapi.json`,
  },
  {
    path: '/edu',
    md: '/edu.md',
    title: 'RPG Edu — Educação financeira e de gestão para o pequeno varejo',
    body: `O RPG Edu é o braço de educação da RPG Capital & Crédito: leva para o lojista o conhecimento de finanças e administração que sempre ficou com os grandes — em videoaulas, guias curtos e calculadoras grátis. Sem economês.

## Calculadoras grátis
- Margem e markup: quanto você ganha de verdade em cada produto.
- Quanto a maquininha leva: o custo mensal e anual das taxas de cartão.

## Trilhas (guias em produção)
- Preço e margem; fluxo de caixa; estoque que gira; taxas e maquininha; Pix na loja; crédito consciente; gestão e equipe; MEI e impostos.

## Videoaulas
Aulas curtas sobre preço, margem, caixa, estoque, equipe e crédito — em produção. Inscrição para receber: ${SITE}/edu/aulas`,
  },
  {
    path: '/cultura',
    md: '/cultura.md',
    title: 'Cultura da RPG Capital & Crédito',
    body: `## Propósito
O sistema financeiro brasileiro foi desenhado para empresas com balanço patrimonial, contador dedicado e gerente de banco. O comerciante de bairro, que sustenta a economia real do país, ficou de fora. A RPG existe para fechar essa distância.

## Missão
Melhorar, cada dia, a operação do comerciante: deixar a loja um pouco mais lucrativa e dar mais respiro financeiro ao negócio.

## Visão
Que ter uma conta RPG seja tão fundamental para um comércio quanto ter um CNPJ.

## Valores — O³
- Obsessão: pelo cliente, pela dor dele e pela jornada inteira.
- Otimização: o mínimo de recursos para o maior resultado possível.
- Ousadia: mudar a experiência de um público que o sistema financeiro ignorou.

## Fundador
Renan Pangoni Guadalupe, fundador e CEO. Estuda Administração no Insper. Contato: renan@rpgcapital.com.br`,
  },
]

export function pageMarkdown(page: AiPage) {
  return `# ${page.title}

Fonte: ${SITE}${page.path === '/' ? '/' : page.path} · RPG Capital & Crédito

${page.body}
`
}

export function markdownResponse(text: string) {
  return new Response(text, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
