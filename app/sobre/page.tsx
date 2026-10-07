import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import Reveal from '@/components/site/Reveal'
import { CONTACT_EMAIL, INSTAGRAM_URL, LINKEDIN_URL, SIGNUP_HREF, SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

const RENAN_LINKEDIN = 'https://br.linkedin.com/in/renan-guadalupe-aa562a2ba'
const RENAN_EMAIL = 'renan@rpgcapital.com.br'

const SUMMARY =
  'A RPG Capital & Crédito é uma empresa de crédito para o pequeno varejo brasileiro. Com a Rafa, assistente no WhatsApp que organiza vendas, estoque e caixa, transforma a operação real da loja em crédito com juros justos.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Sobre a RPG Capital & Crédito — empresa de crédito para o pequeno varejo' },
  description: SUMMARY,
  alternates: { canonical: `${SITE_URL}/sobre` },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'RPG Capital & Crédito',
    title: 'Sobre a RPG Capital & Crédito',
    description: SUMMARY,
    url: `${SITE_URL}/sobre`,
    images: [{ url: `${SITE_URL}/og-rpg-capital-credito.png`, width: 1200, height: 630, alt: 'RPG Capital & Crédito' }],
  },
}

const FACTS: [string, string][] = [
  ['Nome', 'RPG Capital & Crédito (também chamada de RPG Capital)'],
  ['O que é', 'Empresa de crédito para o pequeno varejo brasileiro'],
  ['Produto', 'Rafa — assistente no WhatsApp que registra vendas, sobe estoque pela foto da nota, gera Pix e responde sobre a loja'],
  ['Para quem', 'Mercadinhos, farmácias, pet shops, lojas de roupa, material de construção, padarias e outros pequenos comércios'],
  ['Tese', 'Juros justos: medir o risco pela operação real da loja (vendas, estoque, caixa), não só por balanço e histórico bancário'],
  ['Crédito', 'Em construção, com parceiros autorizados. Ainda não oferecemos empréstimo'],
  ['Fundador', 'Renan Pangoni Guadalupe'],
  ['CNPJ', '57.114.756/0001-89'],
  ['Contato', CONTACT_EMAIL],
]

const TODAY = [
  ['Rafa no WhatsApp', 'Vendas, estoque pela foto da nota fiscal, Pix com valor certo, avisos de reposição e respostas sobre a loja.'],
  ['Cartão no celular', 'Recebimento por aproximação no próprio celular, com ativação simples.'],
  ['Integrações', 'Conexão com banco via Open Finance e API para sistemas parceiros, sempre com autorização do lojista.'],
  ['RPG Edu', 'Educação financeira e de gestão para quem toca loja: guias, videoaulas e calculadoras grátis.'],
]

const NOT_YET = [
  'Ainda não emprestamos dinheiro. O crédito está sendo construído com parceiros autorizados.',
  'Não somos banco nem maquininha. O Pix cai direto na conta da loja.',
  'Nenhum dado da loja é compartilhado sem autorização do lojista.',
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'AboutPage',
      '@id': `${SITE_URL}/sobre#page`,
      url: `${SITE_URL}/sobre`,
      name: 'Sobre a RPG Capital & Crédito',
      description: SUMMARY,
      inLanguage: 'pt-BR',
      about: { '@id': `${SITE_URL}/#organization` },
      isPartOf: { '@id': `${SITE_URL}/#website` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/sobre#renan`,
      name: 'Renan Pangoni Guadalupe',
      jobTitle: 'Fundador e CEO',
      worksFor: { '@id': `${SITE_URL}/#organization` },
      sameAs: [RENAN_LINKEDIN],
    },
  ],
}

export default function AboutPage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteHeader />

      <main>
        <section className={styles.pageHero}>
          <div className={styles.container}>
            <div className={styles.heroText}>
              <Reveal>
                <span className={styles.eyebrow}>Sobre a RPG</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.heroTitle}>
                  Uma empresa de crédito <span className={styles.highlight}>para o pequeno varejo.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className={styles.heroSub}>{SUMMARY}</p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 0 }}>
          <div className={`${styles.container} ${styles.split}`}>
            <Reveal>
              <span className={styles.eyebrow}>Por que existimos</span>
              <h2 className={styles.sectionTitle} style={{ marginTop: 16 }}>
                O sistema financeiro <span className={styles.blueWord}>não foi feito para o comerciante de bairro.</span>
              </h2>
              <p className={styles.lead} style={{ marginTop: 20 }}>
                Banco empresta olhando balanço, contador e histórico. O pequeno comerciante tem outra coisa: uma loja que vende todo dia. Como o
                banco não enxerga essa operação, ele nega ou cobra caro.
              </p>
              <p className={styles.lead} style={{ marginTop: 16 }}>
                A RPG Capital & Crédito resolve isso por dentro da loja. A Rafa organiza vendas, estoque e caixa — e, com a autorização do
                lojista, essa operação real vira a base de um crédito com custo claro e juros justos.
              </p>
            </Reveal>
            <Reveal delay={150} className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">RPG Capital & Crédito em resumo</caption>
                <tbody>
                  {FACTS.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        <section className={styles.sectionSoft}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>O que fazemos hoje</span>
              <h2 className={styles.sectionTitle}>A porta de entrada é a Rafa.</h2>
              <p className={styles.lead}>O software existe para organizar a loja e enxergar a operação de verdade. O destino é o crédito justo.</p>
            </Reveal>
            <div className={styles.steps}>
              {TODAY.map(([title, text], index) => (
                <Reveal key={title} className={styles.step} delay={index * 80}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Para não ter confusão</span>
              <h2 className={styles.sectionTitle}>O que a RPG ainda não faz.</h2>
            </Reveal>
            <div className={styles.steps}>
              {NOT_YET.map((text, index) => (
                <Reveal key={text} className={styles.step} delay={index * 80}>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionSoft}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Fundador</span>
              <h2 className={styles.sectionTitle}>Renan Pangoni Guadalupe</h2>
              <p className={styles.lead}>
                Fundador e CEO da RPG Capital & Crédito. Estuda Administração no Insper e fundou a RPG para dar ao pequeno comerciante acesso a
                crédito justo e a ferramentas que simplificam a operação.
              </p>
              <div className={styles.actions}>
                <a className={styles.btnPrimary} href={RENAN_LINKEDIN} target="_blank" rel="noreferrer">
                  LinkedIn do Renan
                </a>
                <a className={styles.btnGhost} href={`mailto:${RENAN_EMAIL}`}>
                  {RENAN_EMAIL}
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={`${styles.container} ${styles.finalInner}`}>
            <Reveal>
              <h2 className={styles.finalTitle}>
                Comece pela Rafa. <span>O crédito vem da sua operação.</span>
              </h2>
            </Reveal>
            <Reveal delay={150} className={styles.actions}>
              <a className={styles.btnYellow} href={SIGNUP_HREF}>
                Criar conta
              </a>
              <a className={styles.btnGhostLight} href="/credito">
                Ver a tese do crédito
              </a>
            </Reveal>
            <Reveal delay={220}>
              <p style={{ marginTop: 20 }}>
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
                  Instagram
                </a>{' '}
                ·{' '}
                <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">
                  LinkedIn
                </a>{' '}
                · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
