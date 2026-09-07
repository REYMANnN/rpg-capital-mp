import type { Metadata } from 'next'
import styles from './landing.module.css'

const signupHref = '/auth/signup/reset'
const loginHref = '/login?intent=login'

export const metadata: Metadata = {
  title: 'RPG para Balcões — Gestão completa da sua loja por R$ 5,99/mês',
  description:
    'Gerencie inventário, vendas, finanças e equipe da sua loja em um só lugar. RPG para Balcões custa R$ 5,99 por mês e não cobra taxa no Pix.',
  alternates: { canonical: 'https://rpgcapital.com.br/' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'RPG para Balcões',
    title: 'RPG para Balcões — Sua loja inteira por R$ 5,99/mês',
    description:
      'Inventário, vendas, finanças, equipe e muito mais. Menos de um cafezinho por mês para gerenciar toda a sua loja.',
    url: 'https://rpgcapital.com.br/',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1750262701480-91fc40e726ba?auto=format&fit=crop&fm=jpg&q=85&w=1200&h=630',
        width: 1200,
        height: 630,
        alt: 'Atendimento e pagamento em um pequeno comércio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RPG para Balcões — Sua loja inteira por R$ 5,99/mês',
    description: 'Inventário, vendas, finanças, equipe e Pix sem taxa em um sistema simples para o varejo.',
    images: [
      'https://images.unsplash.com/photo-1750262701480-91fc40e726ba?auto=format&fit=crop&fm=jpg&q=85&w=1200&h=630',
    ],
  },
  manifest: '/manifest.webmanifest',
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://rpgcapital.com.br/#organization',
      name: 'RPG Capital',
      url: 'https://rpgcapital.com.br/',
      email: 'comercial@rpgcapital.com.br',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://rpgcapital.com.br/#website',
      url: 'https://rpgcapital.com.br/',
      name: 'RPG para Balcões',
      publisher: { '@id': 'https://rpgcapital.com.br/#organization' },
      inLanguage: 'pt-BR',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://rpgcapital.com.br/#software',
      name: 'RPG para Balcões',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Sistema de gestão para pequenos varejistas com inventário, vendas, finanças, equipe e cobrança Pix sem taxa da RPG.',
      publisher: { '@id': 'https://rpgcapital.com.br/#organization' },
      offers: {
        '@type': 'Offer',
        price: '5.99',
        priceCurrency: 'BRL',
        url: 'https://www.rpgcapital.com.br/auth/signup/reset',
      },
    },
  ],
}

const features = [
  ['01', 'Inventário', 'Controle produtos, entradas, saídas, custos e o que está acabando.'],
  ['02', 'Vendas', 'Registre as vendas e mantenha o estoque atualizado junto com o caixa.'],
  ['03', 'Finanças', 'Acompanhe saldo e movimentações para entender para onde o dinheiro da loja está indo.'],
  ['04', 'Equipe', 'Organize quem vende, quem cuida do estoque e quem administra o negócio.'],
  ['05', 'Pix sem taxa', 'Cobre direto no balcão com o valor certo — sem taxa no Pix.'],
  ['06', 'Código de barras', 'Use o celular para encontrar e cadastrar produtos com muito menos digitação.'],
] as const

export default function Home() {
  return (
    <div className={styles.page}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className={styles.header}>
        <div className={styles.container + ' ' + styles.headerInner}>
          <a className={styles.brand} href="#topo" aria-label="RPG para Balcões — início">
            <span className={styles.brandMark}>RPG</span>
            <span className={styles.brandCopy}>
              <strong>RPG para Balcões</strong>
              <small>por RPG Capital</small>
            </span>
          </a>
          <nav className={styles.nav} aria-label="Navegação principal">
            <a href="#produto">Produto</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#preco">Preço</a>
            <a className={styles.loginLink} href="/login?intent=login">Entrar</a>
            <a className={styles.smallButton} href="/auth/signup/reset">Criar conta</a>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero} id="topo">
          <div className={styles.container + ' ' + styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>GESTÃO FEITA PARA O VAREJO REAL</p>
              <h1>RPG para Balcões</h1>
              <p className={styles.heroLine}>Tudo que sua loja precisa para vender, controlar e crescer.</p>
              <p className={styles.heroText}>
                Estoque, vendas, financeiro e equipe em um só lugar. Simples o bastante para usar no balcão.
                Completo o bastante para cuidar do negócio.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.button} href="/auth/signup/reset">Começar agora</a>
                <a className={styles.textLink} href="/login?intent=login">Já tenho uma conta <span>→</span></a>
              </div>
              <ul className={styles.heroPoints} aria-label="Destaques">
                <li>✓ R$ 5,99 por mês</li>
                <li>✓ Pix sem taxa</li>
                <li>✓ Sem equipamento caro</li>
              </ul>
            </div>
            <figure className={styles.heroVisual}>
              <img
                src="https://images.unsplash.com/photo-1750262701480-91fc40e726ba?auto=format&fit=crop&fm=jpg&q=82&w=1600"
                width="1600"
                height="1067"
                alt="Pessoa realizando um pagamento no balcão de um pequeno comércio"
              />
              <figcaption className={styles.floatingCard}>
                <span className={styles.statusDot} aria-hidden="true" />
                <span><strong>Venda registrada</strong><small>estoque atualizado automaticamente</small></span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className={styles.statementSection}>
          <div className={styles.container + ' ' + styles.statement}>
            <p>RPG PARA BALCÕES</p>
            <h2>Menos planilha. Menos confusão. <span>Mais controle.</span></h2>
          </div>
        </section>

        <section className={styles.section} id="produto">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>TODA A OPERAÇÃO</p>
              <h2>Sua loja inteira em um só lugar.</h2>
              <p>As ferramentas que o comerciante usa todos os dias, reunidas sem transformar a operação em um curso de software.</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map(([number, title, description]) => (
                <article key={number} className={title === 'Pix sem taxa' ? styles.featureCardAccent : styles.featureCard}>
                  <span className={styles.featureNumber}>{number}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.splitSection + ' ' + styles.section}>
          <div className={styles.container + ' ' + styles.splitGrid}>
            <figure className={styles.scanVisual}>
              <img
                src="https://images.unsplash.com/photo-1770013413878-2530e2c3d82b?auto=format&fit=crop&fm=jpg&q=82&w=1600"
                width="1600"
                height="1067"
                alt="Comerciante usando o celular para conferir produtos do estoque"
              />
            </figure>
            <div className={styles.splitCopy}>
              <p className={styles.eyebrow}>SIMPLES DE PROPÓSITO</p>
              <h2>Feito para o balcão. Não para complicar o balcão.</h2>
              <p>Você não precisa transformar sua loja numa operação de tecnologia. Use o que já tem, cadastre seus produtos e comece a ter mais controle.</p>
              <ul className={styles.checkList}>
                <li>Funciona no celular e no computador.</li>
                <li>Não exige maquininha própria da RPG.</li>
                <li>Pix vai direto para a conta da sua loja.</li>
                <li>Gestão sem planilhas espalhadas.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container + ' ' + styles.previewGrid}>
            <div className={styles.previewCopy}>
              <p className={styles.eyebrow}>CONTROLE SEM COMPLICAÇÃO</p>
              <h2>Abra a loja. Veja o que importa.</h2>
              <p>Vendas, estoque e financeiro conversam entre si para você enxergar a operação sem juntar informação na mão.</p>
            </div>
            <div className={styles.dashboardShell} role="img" aria-label="Exemplo visual das áreas de gestão da RPG para Balcões">
              <div className={styles.dashboardTop}><span>RPG para Balcões</span><span>Loja aberta</span></div>
              <div className={styles.dashboardBody}>
                <aside className={styles.dashboardSide}><strong>Visão geral</strong><span>Vendas</span><span>Estoque</span><span>Financeiro</span><span>Equipe</span></aside>
                <div className={styles.dashboardMain}>
                  <div className={styles.metricRow}>
                    <div><small>Vendas</small><strong>Hoje</strong></div>
                    <div><small>Estoque</small><strong>Em dia</strong></div>
                    <div><small>Financeiro</small><strong>Atualizado</strong></div>
                  </div>
                  <div className={styles.activityBars} aria-hidden="true">
                    {[34, 56, 45, 78, 64, 88, 72].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}
                  </div>
                  <div className={styles.activityList}>
                    <p><span>Produto vendido</span><strong>Estoque -1</strong></p>
                    <p><span>Pix recebido</span><strong>Sem taxa</strong></p>
                    <p><span>Conta conectada</span><strong>Dados atualizados</strong></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.pricing + ' ' + styles.section} id="preco">
          <div className={styles.container + ' ' + styles.priceCard}>
            <div className={styles.priceCopy}>
              <p className={styles.eyebrowLight}>PREÇO QUE CABE NO BALCÃO</p>
              <h2>Menos de um cafezinho por mês. <span>E você gerencia toda a sua loja.</span></h2>
              <p>Pague menos de um cafezinho por mês e gerencie <strong>TODO o seu negócio:</strong> inventário, vendas, finanças, equipe e muito mais.</p>
              <div className={styles.price}><span>R$</span><strong>5,99</strong><small>/ mês</small></div>
              <a className={styles.yellowButton} href={signupHref}>Criar minha conta</a>
            </div>
            <div className={styles.coffeeCard}>
              <div className={styles.coffeeIcon}>☕</div>
              <p><strong>1 cafezinho</strong></p>
              <span>pode custar mais que um mês inteiro de gestão da sua loja.</span>
              <hr />
              <p className={styles.coffeeResult}>RPG para Balcões<br /><strong>R$ 5,99/mês</strong></p>
            </div>
          </div>
        </section>

        <section className={styles.section} id="como-funciona">
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>COMECE SEM BUROCRACIA</p>
              <h2>Da conta criada ao balcão em três passos.</h2>
            </div>
            <div className={styles.stepsGrid}>
              <article><span>1</span><h3>Crie sua conta</h3><p>Comece pela sua Conta Google, sem precisar decorar uma nova senha.</p></article>
              <article><span>2</span><h3>Configure sua loja</h3><p>Organize produtos, equipe e as informações necessárias para sua operação.</p></article>
              <article><span>3</span><h3>Abra o balcão</h3><p>Venda, acompanhe e administre tudo no mesmo lugar.</p></article>
            </div>
          </div>
        </section>

        <section className={styles.manifesto + ' ' + styles.section}>
          <div className={styles.container + ' ' + styles.manifestoInner}>
            <p className={styles.eyebrow}>NOSSA IDEIA É SIMPLES</p>
            <h2>Sua loja não precisa de um sistema caro para ser bem administrada.</h2>
            <p>A RPG para Balcões foi feita para colocar ferramentas de gestão de verdade nas mãos de quem toca uma loja todos os dias.</p>
          </div>
        </section>

        <section className={styles.faq + ' ' + styles.section}>
          <div className={styles.container + ' ' + styles.faqGrid}>
            <div className={styles.sectionHeading}><p className={styles.eyebrow}>DÚVIDAS RÁPIDAS</p><h2>O que o comerciante quer saber.</h2></div>
            <div className={styles.faqList}>
              <details><summary>Quanto custa a RPG para Balcões?</summary><p>O acesso custa R$ 5,99 por mês.</p></details>
              <details><summary>A RPG cobra taxa no Pix?</summary><p>Não. A RPG não cobra taxa sobre as vendas em Pix feitas pelo fluxo do Balcões.</p></details>
              <details><summary>O que eu consigo gerenciar?</summary><p>Inventário, vendas, finanças, equipe e outras rotinas de gestão da loja em um só sistema.</p></details>
              <details><summary>Preciso trocar minha maquininha?</summary><p>Não. A proposta é funcionar com a operação que o comerciante já tem, sem exigir uma maquininha própria da RPG.</p></details>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.container + ' ' + styles.finalInner}>
            <div><p className={styles.eyebrowLight}>RPG PARA BALCÕES</p><h2>Sua loja inteira. Na sua mão.</h2><p>Inventário, vendas, finanças e equipe por R$ 5,99 por mês.</p></div>
            <a className={styles.yellowButton} href={signupHref}>Começar agora</a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container + ' ' + styles.footerGrid}>
          <div><a className={styles.brand} href="#topo"><span className={styles.brandMark}>RPG</span><span className={styles.brandCopy}><strong>RPG para Balcões</strong><small>por RPG Capital</small></span></a><p>Gestão simples para quem tem uma loja para tocar.</p></div>
          <div><strong>Produto</strong><a href="#produto">Funcionalidades</a><a href="#preco">Preço</a><a href="#como-funciona">Como funciona</a></div>
          <div><strong>Acesso</strong><a href={loginHref}>Entrar</a><a href={signupHref}>Criar conta</a></div>
          <div><strong>Contato</strong><a href="mailto:comercial@rpgcapital.com.br">comercial@rpgcapital.com.br</a></div>
        </div>
        <div className={styles.container + ' ' + styles.footerBottom}><span>© 2026 RPG Capital.</span><span>Feito para o varejo brasileiro.</span></div>
      </footer>
    </div>
  )
}
