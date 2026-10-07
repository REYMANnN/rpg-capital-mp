import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import DaySummary from '@/components/site/DaySummary'
import HeroPhone from '@/components/site/HeroPhone'
import { NotaScan, PayToggle, StockBars, VendaFeed } from '@/components/site/MiniUIs'
import Reveal from '@/components/site/Reveal'
import RotatingWord from '@/components/site/RotatingWord'
import StickySteps from '@/components/site/StickySteps'
import TiltCard from '@/components/site/TiltCard'
import {
  CONTACT_EMAIL,
  DEMO_HREF,
  INSTAGRAM_URL,
  LINKEDIN_URL,
  SIGNUP_HREF,
  SITE_URL,
  SiteFooter,
  SiteHeader,
} from '@/components/site/SiteChrome'

const TITLE = 'Rafa — sua loja mais organizada pelo WhatsApp | RPG Capital & Crédito'
const DESCRIPTION =
  'A Rafa é a assistente da RPG no WhatsApp: registra vendas, sobe o estoque pela foto da nota, gera Pix e avisa o que está acabando. Você toca a loja. A Rafa organiza o resto.'
const OG_IMAGE = `${SITE_URL}/site/pix-cartao.webp`

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'RPG Capital & Crédito',
    title: 'Sua loja mais organizada pelo WhatsApp — conheça a Rafa',
    description: DESCRIPTION,
    url: `${SITE_URL}/`,
    images: [{ url: OG_IMAGE, width: 1200, height: 1200, alt: 'Rafa gerando Pix e cobrança no cartão pelo celular' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sua loja mais organizada pelo WhatsApp — conheça a Rafa',
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  manifest: '/manifest.webmanifest',
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'RPG Capital & Crédito',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/brand/logo-rpg-capital-credito-azul.png`,
      email: CONTACT_EMAIL,
      sameAs: [INSTAGRAM_URL, LINKEDIN_URL],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: 'RPG Capital & Crédito',
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'pt-BR',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#rafa`,
      name: 'Rafa',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'WhatsApp, Web',
      description: DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

const PAINS = ['Produto acaba sem perceber', 'Venda fica sem registro', 'Estoque vira confusão', 'Sistema complicado atrapalha']

const STORES = [
  'Mercadinho',
  'Farmácia',
  'Pet shop',
  'Loja de roupas',
  'Material de construção',
  'Papelaria',
  'Conveniência',
  'Padaria',
  'Açougue',
  'Hortifruti',
]

const BENEFITS = [
  ['Menos caderno', 'Cada venda e cada entrada de mercadoria vira registro na hora.'],
  ['Estoque sem chute', 'O estoque baixa a cada venda e a Rafa avisa quando algo está acabando.'],
  ['Resposta na hora', '“Quanto vendi hoje?”, “O que mais dá lucro?” — pergunte como perguntaria a um sócio.'],
  ['Perda também conta', '“Quebrei duas garrafas” vira baixa de estoque com o motivo certo.'],
  ['Do seu jeito', 'Escreveu errado? Mandou áudio? Ela entende.'],
  ['Equipe no lugar', 'Cada funcionário com o seu acesso. Você decide quem vê o quê.'],
] as const

const STEPS = [
  {
    tag: 'VENDER',
    title: 'Escaneie, finalize e pronto.',
    text: 'Escaneie o produto ou só fale o que vendeu. A venda fica registrada e o estoque baixa sozinho.',
    image: '/site/venda-scanner.webp',
    alt: 'Lojista escaneando o código de barras de um produto com o celular',
  },
  {
    tag: 'SUBIR ESTOQUE',
    title: 'Tirou foto da nota? Acabou.',
    text: 'A Rafa lê produto, quantidade e custo e cadastra tudo. Você não digita item por item — ela só pergunta o que não conseguiu ler.',
    image: '/site/nota-fiscal.webp',
    alt: 'Celular fotografando uma nota fiscal de fornecedor',
  },
  {
    tag: 'RECEBER',
    title: 'Pix ou cartão, você escolhe.',
    text: 'A Rafa gera o QR Code do Pix com o valor certo ou abre o pagamento por aproximação no celular. Você acompanha e a venda fica registrada.',
    image: '/site/pix-cartao.webp',
    alt: 'Dois celulares: um com QR Code de Pix e outro recebendo cartão por aproximação',
  },
  {
    tag: 'ACOMPANHAR',
    title: 'Veja como foi o dia.',
    text: 'Vendas de hoje, mais vendidos e o que precisa comprar — num resumo no seu WhatsApp, no fim do dia.',
    image: '/site/lojista-feliz.webp',
    alt: 'Lojista sorrindo enquanto confere o resumo do dia no celular',
  },
]

const FAQ = [
  ['O que é a Rafa?', 'A assistente da RPG no WhatsApp. Ela registra vendas, sobe estoque pela foto da nota, gera Pix e responde sobre a sua loja.'],
  ['A RPG cobra taxa no Pix?', 'Não. O Pix cai direto na conta da sua loja. Vale conferir se o seu banco cobra tarifa de Pix para empresa.'],
  ['Preciso trocar de banco ou de maquininha?', 'Não. Continue com os seus. E, se quiser, seu celular também recebe cartão por aproximação — a ativação é simples e sai no mesmo dia ou no seguinte.'],
  ['Preciso de computador?', 'Não. Tudo funciona no celular e no WhatsApp. O painel também abre no computador.'],
  ['Meus dados estão seguros?', 'O banco é conectado pelo Open Finance, só com a sua autorização, e você desconecta quando quiser.'],
  ['A RPG empresta dinheiro?', 'Ainda não. Estamos construindo crédito com juros justos, com parceiros autorizados. Quando chegar, custo e limite vêm claros antes de tudo.'],
  ['Dá pra testar antes?', 'Sim. Use a conta de teste ou crie sua conta para começar a falar com a Rafa.'],
] as const

export default function Home() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <SiteHeader />

      <main>
        {/* 1. Topo */}
        <section className={styles.hero} id="topo">
          <span className={styles.guides} aria-hidden="true" />
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <Reveal>
                <span className={styles.eyebrow}>Conheça a Rafa</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.heroTitle}>
                  Sua loja <span className={styles.highlight}>mais organizada</span> pelo WhatsApp.
                </h1>
              </Reveal>
              <Reveal delay={140}>
                <p className={styles.rotateLine}>
                  A Rafa cuida do seu{' '}
                  <RotatingWord words={['estoque', 'caixa', 'Pix', 'cartão', 'fornecedor', 'dia a dia']} />
                </p>
              </Reveal>
              <Reveal delay={200}>
                <p className={styles.heroSub}>
                  A assistente da RPG que ajuda você a vender mais e ter controle total — por mensagem, foto ou áudio.
                </p>
              </Reveal>
              <Reveal delay={260}>
                <p className={styles.tagline}>
                  Você toca a loja. <span>A Rafa organiza o resto.</span>
                </p>
              </Reveal>
              <Reveal delay={320} className={styles.actions}>
                <a className={styles.btnPrimary} href={SIGNUP_HREF}>
                  Criar conta
                </a>
                <a className={styles.btnYellow} href={DEMO_HREF}>
                  Testar conta demo
                </a>
              </Reveal>
              <Reveal delay={380}>
                <ul className={styles.chips} aria-label="Destaques">
                  <li>Tudo pelo WhatsApp</li>
                  <li>Sem planilha</li>
                  <li>Sem sistema difícil</li>
                </ul>
              </Reveal>
            </div>
            <HeroPhone />
          </div>
        </section>

        {/* Faixa de tipos de loja */}
        <div className={styles.marquee} aria-label="Feito para mercadinho, farmácia, pet shop e outras lojas">
          <div className={styles.marqueeTrack} aria-hidden="true">
            {[...STORES, ...STORES].map((store, index) => (
              <span key={index}>{store}</span>
            ))}
          </div>
        </div>

        {/* 2. O problema */}
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.split}`}>
            <Reveal className={styles.photoFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/site/lojista-cansado.webp" width={688} height={941} alt="Lojista cansado no balcão com caderno e calculadora" loading="lazy" />
            </Reveal>
            <div>
              <Reveal>
                <h2 className={styles.sectionTitle}>
                  Loja <span className={styles.blueWord}>dá trabalho.</span>
                </h2>
                <span className={styles.underline} aria-hidden="true" />
              </Reveal>
              <ul className={styles.painList}>
                {PAINS.map((pain, index) => (
                  <Reveal as="li" key={pain} delay={index * 140} activeClassName={styles.solved}>
                    <span className={styles.painIcon} aria-hidden="true">
                      ✓
                    </span>
                    <span className={styles.painText}>{pain}</span>
                  </Reveal>
                ))}
              </ul>
              <Reveal delay={700}>
                <p className={styles.lead} style={{ marginTop: 24 }}>
                  Com a Rafa, cada uma dessas dores vira coisa resolvida — sem planilha e sem sistema difícil.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 3. A Rafa funciona no WhatsApp */}
        <section className={styles.sectionDark} id="rafa">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrowLight}>Rafa no WhatsApp</span>
              <h2 className={styles.sectionTitle}>
                A Rafa funciona <span className={styles.yellowWord}>no WhatsApp.</span>
              </h2>
              <p className={styles.lead}>O app que você já usa o dia inteiro vira o sistema da sua loja.</p>
            </Reveal>
            <div className={styles.flow}>
              {[
                ['Mande foto, áudio ou mensagem.', 'Do jeito que você fala no balcão. Escreveu errado? Ela entende.'],
                ['A Rafa entende e organiza.', 'Venda, estoque, lista de compras e financeiro, tudo no lugar certo, automaticamente.'],
                ['Sem planilha. Sem sistema difícil.', 'Nada de curso, nada de tela confusa. Você só conversa.'],
              ].map(([title, text], index) => (
                <Reveal key={title} className={styles.flowStep} delay={index * 140}>
                  <span className={styles.flowNumber}>{index + 1}</span>
                  <b>{title}</b>
                  <p>{text}</p>
                  {index < 2 && <span className={styles.flowLine} aria-hidden="true" />}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 4. O que a Rafa faz */}
        <section className={styles.section} id="produto">
          <div className={styles.container}>
            <Reveal className={`${styles.sectionHead} ${styles.center}`}>
              <span className={styles.eyebrow}>O que a Rafa faz por você</span>
              <h2 className={styles.sectionTitle}>
                A loja inteira, <span className={styles.muted}>numa conversa.</span>
              </h2>
            </Reveal>
            <div className={styles.bento2}>
              <Reveal>
                <TiltCard className={styles.bentoCard} max={4}>
                  <h3>Estoque sem planilha</h3>
                  <p>Tirou foto da nota? A Rafa cadastra os produtos. Você não digita item por item.</p>
                  <NotaScan />
                </TiltCard>
              </Reveal>
              <Reveal delay={100}>
                <TiltCard className={styles.bentoCard} max={4}>
                  <h3>Venda simples</h3>
                  <p>Escaneie o produto, finalize a venda e o estoque baixa sozinho.</p>
                  <VendaFeed />
                </TiltCard>
              </Reveal>
              <Reveal>
                <TiltCard className={styles.bentoCard} max={4}>
                  <h3>Pix ou cartão</h3>
                  <p>A Rafa gera o QR Code do Pix ou abre o pagamento por aproximação no celular. A venda fica registrada.</p>
                  <PayToggle />
                </TiltCard>
              </Reveal>
              <Reveal delay={100}>
                <TiltCard className={styles.bentoCard} max={4}>
                  <h3>Saiba o que está acabando</h3>
                  <p>Veja os itens com estoque baixo e reponha antes de faltar. Nada de perder venda por produto em falta.</p>
                  <StockBars />
                </TiltCard>
              </Reveal>
              <Reveal>
                <TiltCard className={styles.bentoSmall} max={3}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    🏦
                  </span>
                  <h3>Seu dinheiro no lugar</h3>
                  <p>Conecte o banco com segurança e veja pra onde o dinheiro da loja está indo. Sem trocar de banco.</p>
                </TiltCard>
              </Reveal>
              <Reveal delay={100}>
                <TiltCard className={styles.bentoSmall} max={3}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    👥
                  </span>
                  <h3>Cada um no seu lugar</h3>
                  <p>Cada funcionário com o seu acesso. Você decide quem vê o quê.</p>
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 5. Como funciona — passo a passo */}
        <section className={styles.sectionSoft} id="como-funciona">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Como funciona</span>
              <h2 className={styles.sectionTitle}>
                A Rafa trabalha pela sua loja. <span className={styles.muted}>Você só conversa.</span>
              </h2>
            </Reveal>
            <StickySteps steps={STEPS} />
          </div>
        </section>

        {/* 6. O que muda no seu dia */}
        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>O que muda no seu dia</span>
              <h2 className={styles.sectionTitle}>Menos correria. Mais controle.</h2>
            </Reveal>
            <div className={styles.benefits}>
              {BENEFITS.map(([title, text], index) => (
                <Reveal key={title} className={styles.benefit} delay={(index % 3) * 100}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className={styles.actions} delay={200}>
              <a className={styles.btnYellow} href={SIGNUP_HREF} style={{ marginTop: 40 }}>
                Falar com a Rafa no WhatsApp
              </a>
            </Reveal>
          </div>
        </section>

        {/* 7. Resumo do dia */}
        <section className={styles.sectionSoft}>
          <div className={`${styles.container} ${styles.summarySplit}`}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Veja como foi o dia</span>
              <h2 className={styles.sectionTitle}>
                Fechou a loja? <span className={styles.blueWord}>A Rafa já fez as contas.</span>
              </h2>
              <p className={styles.lead}>
                Todo fim de dia chega no seu WhatsApp um resumo curto: quanto você vendeu, o que mais saiu e o que precisa comprar amanhã. Sem
                abrir sistema nenhum.
              </p>
              <ul className={styles.bulletList}>
                <li>Comparação com ontem, pra saber se o dia foi bom.</li>
                <li>Os produtos que mais venderam.</li>
                <li>O que está acabando, com a lista de compras pronta.</li>
              </ul>
            </Reveal>
            <Reveal delay={120}>
              <DaySummary />
            </Reveal>
          </div>
        </section>

        {/* 8. Crédito */}
        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.creditBand}>
              <div>
                <h2 className={styles.creditTitle}>
                  Mais controle hoje. <span>Crédito mais justo amanhã.</span>
                </h2>
                <ul className={styles.bulletList}>
                  <li>Seu histórico de vendas, pagamentos e compras fica organizado.</li>
                  <li>A RPG entende melhor a realidade da sua loja.</li>
                  <li>No futuro, isso ajuda a oferecer crédito mais adequado para você.</li>
                </ul>
                <a className={styles.textLink} href="/credito">
                  Entenda a tese dos juros justos <span aria-hidden="true">→</span>
                </a>
              </div>
              <div className={styles.checkCard} aria-hidden="true">
                <div className={styles.checkRow}>
                  Vendas <i>✓</i>
                </div>
                <div className={styles.checkRow}>
                  Pagamentos <i>✓</i>
                </div>
                <div className={styles.checkRow}>
                  Compras <i>✓</i>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* 9. Como começar */}
        <section className={styles.sectionSoft}>
          <div className={styles.container}>
            <Reveal className={`${styles.sectionHead} ${styles.center}`}>
              <span className={styles.eyebrow}>Como começar</span>
              <h2 className={styles.sectionTitle}>Três passos e a Rafa já está trabalhando.</h2>
            </Reveal>
            <div className={styles.steps}>
              {[
                ['Crie sua conta', 'Preencha o formulário de inscrição. Leva poucos minutos.'],
                ['Ative a Rafa', 'Ela aparece no seu WhatsApp, pronta para ajudar.'],
                ['Mande a primeira nota ou venda', 'Conectar o banco é opcional e pode ficar para depois.'],
              ].map(([title, text], index) => (
                <Reveal key={title} className={styles.step} delay={index * 120}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className={`${styles.actions}`} delay={300}>
              <a className={styles.btnPrimary} href={SIGNUP_HREF} style={{ margin: '40px auto 0' }}>
                Criar conta
              </a>
            </Reveal>
          </div>
        </section>

        {/* 10. Perguntas frequentes */}
        <section className={styles.section}>
          <div className={`${styles.container} ${styles.faqGrid}`}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Dúvidas rápidas</span>
              <h2 className={styles.sectionTitle}>O que o lojista quer saber.</h2>
              <p className={styles.lead}>
                Ficou alguma dúvida? Escreva para <a href={`mailto:${CONTACT_EMAIL}`} className={styles.blueWord}>{CONTACT_EMAIL}</a>.
              </p>
            </Reveal>
            <div className={styles.faqList}>
              {FAQ.map(([question, answer], index) => (
                <Reveal as="details" key={question} delay={index * 60}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 11. Chamada final */}
        <section className={styles.finalCta}>
          <div className={`${styles.container} ${styles.finalInner}`}>
            <Reveal>
              <h2 className={styles.finalTitle}>
                Comece a usar a <span>Rafa hoje.</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p>Você toca a loja. A Rafa organiza o resto.</p>
            </Reveal>
            <Reveal delay={200} className={styles.actions}>
              <a className={styles.btnYellow} href={SIGNUP_HREF}>
                Criar conta
              </a>
              <a className={styles.btnGhostLight} href={DEMO_HREF}>
                Testar conta demo
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
