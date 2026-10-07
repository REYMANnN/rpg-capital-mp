import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import NewsletterForm from '@/components/site/NewsletterForm'
import Reveal from '@/components/site/Reveal'
import { SIGNUP_HREF, SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Videoaulas e materiais — RPG Edu | RPG Capital & Crédito',
  description: 'Videoaulas curtas e materiais de estudo sobre finanças e administração para o pequeno varejo. Inscreva-se para receber as primeiras aulas.',
  alternates: { canonical: `${SITE_URL}/edu/aulas` },
  robots: { index: true, follow: true },
}

const LESSONS = [
  ['Preço e margem', 'Margem: quanto sobra de verdade em cada produto'],
  ['Preço e margem', 'Como dar preço sem chutar'],
  ['Fluxo de caixa', 'Fluxo de caixa em 10 minutos'],
  ['Fluxo de caixa', 'Separar o dinheiro da loja do seu'],
  ['Estoque', 'Estoque que não para dinheiro'],
  ['Estoque', 'Curva ABC na prática'],
  ['Taxas', 'Maquininha: quanto ela leva do seu faturamento'],
  ['Crédito consciente', 'Capital de giro: quando pegar e quando fugir'],
  ['Gestão', 'Caixa por funcionário sem dor de cabeça'],
]

const MATERIALS = [
  ['Planilha de fluxo de caixa', 'Para quem ainda não usa a Rafa e quer começar a organizar.'],
  ['Checklist de fechamento do dia', 'O que conferir antes de baixar a porta.'],
  ['Guia de preço de venda', 'Passo a passo com exemplo de loja real.'],
]

export default function LessonsPage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <SiteHeader />

      <main>
        <section className={styles.pageHero}>
          <div className={styles.container}>
            <div className={styles.heroText}>
              <Reveal>
                <a className={styles.eyebrow} href="/edu">
                  ← RPG Edu
                </a>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.heroTitle}>
                  Videoaulas e <span className={styles.highlight}>materiais de estudo.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className={styles.heroSub}>
                  Estamos gravando as primeiras aulas. Deixe seu e-mail e a gente avisa assim que cada uma sair — junto com os materiais para
                  baixar.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.container}>
            <Reveal className={styles.newsBand}>
              <div>
                <h2>Quero receber as aulas.</h2>
                <p>Uma aula nova por semana no seu e-mail. Grátis.</p>
              </div>
              <NewsletterForm source="site_edu_aulas" />
            </Reveal>
          </div>
        </section>

        <section className={styles.sectionSoft}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Videoaulas</span>
              <h2 className={styles.sectionTitle}>O que vem por aí.</h2>
            </Reveal>
            <div className={styles.lessonGrid}>
              {LESSONS.map(([track, title], index) => (
                <Reveal key={title} className={styles.lesson} delay={(index % 3) * 80}>
                  <span className={styles.lessonThumb}>
                    <b>▶</b>
                  </span>
                  <small>{track}</small>
                  <h3>{title}</h3>
                  <span className={styles.soon}>Em breve</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Materiais de estudo</span>
              <h2 className={styles.sectionTitle}>Para baixar e usar na loja.</h2>
            </Reveal>
            <div className={styles.steps}>
              {MATERIALS.map(([title, text], index) => (
                <Reveal key={title} className={styles.step} delay={index * 100}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <span className={styles.soon}>Em breve</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={`${styles.container} ${styles.finalInner}`}>
            <Reveal>
              <h2 className={styles.finalTitle}>
                Enquanto isso, <span>a Rafa faz as contas.</span>
              </h2>
            </Reveal>
            <Reveal delay={150} className={styles.actions}>
              <a className={styles.btnYellow} href={SIGNUP_HREF}>
                Criar conta
              </a>
              <a className={styles.btnGhostLight} href="/edu#calculadoras">
                Usar as calculadoras
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
