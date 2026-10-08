import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import CoreMatrix from '@/components/site/CoreMatrix'
import Reveal from '@/components/site/Reveal'
import ScrollWords from '@/components/site/ScrollWords'
import { SIGNUP_HREF, SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

const RENAN_EMAIL = 'renan@rpgcapital.com.br'
const RENAN_LINKEDIN = 'https://br.linkedin.com/in/renan-guadalupe-aa562a2ba'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Cultura — Por que a RPG existe | RPG Capital & Crédito',
  description:
    'O sistema financeiro não foi feito para o pequeno comerciante. A RPG é. Conheça a matriz O³: propósito, missão, visão e os valores no centro de tudo.',
  alternates: { canonical: `${SITE_URL}/cultura`, types: { 'text/markdown': `${SITE_URL}/cultura.md` } },
  robots: { index: true, follow: true },
}

export default function CulturePage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <SiteHeader />

      <main>
        <section className={styles.pageHero}>
          <div className={styles.container}>
            <div className={styles.heroText}>
              <Reveal>
                <span className={styles.eyebrow}>Cultura</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.heroTitle}>
                  O sistema financeiro não foi feito para o pequeno comerciante. <span className={styles.highlight}>A RPG é.</span>
                </h1>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.sectionDark}>
          <div className={styles.container}>
            <span className={styles.eyebrowLight}>Propósito</span>
            <div style={{ marginTop: 28 }}>
              <ScrollWords
                text="O sistema financeiro brasileiro foi desenhado para empresas com balanço patrimonial, contador dedicado e gerente de banco. O comerciante de bairro, que abre cedo, fecha tarde e sustenta a economia real do país, ficou de fora. A RPG existe para fechar essa distância."
                accent={['comerciante', 'bairro', 'RPG', 'distância']}
              />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Matriz de cultura O³</span>
              <h2 className={styles.sectionTitle}>
                Tudo gira em torno de <span className={styles.blueWord}>três Os.</span>
              </h2>
              <p className={styles.lead}>
                No centro ficam os valores. Em volta, as camadas que eles sustentam — quanto mais perto do centro, mais perto dos valores. Passe
                o mouse ou toque em cada camada.
              </p>
            </Reveal>
            <Reveal delay={120}>
              <CoreMatrix />
            </Reveal>
          </div>
        </section>

        <section className={styles.sectionBlue}>
          <div className={styles.container}>
            <Reveal>
              <p className={styles.quote}>
                “Os egípcios já cobravam juros dos gregos. <span>O que muda é a experiência de quem usa.</span>”
              </p>
            </Reveal>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.container} ${styles.founder}`}>
            <Reveal className={styles.founderPhoto}>
              <span role="img" aria-label="Foto do fundador em breve">
                RG
              </span>
            </Reveal>
            <Reveal delay={120}>
              <span className={styles.eyebrow}>Quem está por trás</span>
              <h2 className={styles.sectionTitle} style={{ marginTop: 14 }}>
                Renan Pangoni Guadalupe
              </h2>
              <p className={styles.blueWord} style={{ marginTop: 8, fontWeight: 700, fontSize: 18 }}>
                Fundador e CEO
              </p>
              <p className={styles.lead} style={{ marginTop: 20 }}>
                Renan estuda Administração no Insper e fundou a RPG para resolver uma desconexão que via de perto: quem sustenta a economia
                real é justamente quem tem menos acesso a boas ferramentas e a crédito justo. Antes da RPG, trabalhou em projetos de fintech,
                energia e hardware.
              </p>
              <p className={styles.founderQuote}>
                “Todo dia, o comerciante que usa a RPG tem que fechar a loja com a operação um pouco melhor do que estaria sem ela. Essa é a
                única métrica que importa.”
              </p>
              <div className={styles.actions} style={{ marginTop: 28 }}>
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
                Quer construir <span>isso com a gente?</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p>Lojista, parceiro ou gente boa querendo trabalhar no varejo de verdade — fale com a gente.</p>
            </Reveal>
            <Reveal delay={200} className={styles.actions}>
              <a className={styles.btnYellow} href={SIGNUP_HREF}>
                Criar conta
              </a>
              <a className={styles.btnGhostLight} href={`mailto:${RENAN_EMAIL}`}>
                Falar com o Renan
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
