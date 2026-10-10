import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import UnsubscribeForm from '@/components/site/NewsletterUnsubscribeForm'
import Reveal from '@/components/site/Reveal'
import { SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Sair da newsletter — Radar do Lojista | RPG Capital & Crédito',
  description: 'Cancele o recebimento do Radar do Lojista.',
  alternates: { canonical: `${SITE_URL}/newsletter/sair` },
  robots: { index: false, follow: false },
}

export default function NewsletterLeavePage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <SiteHeader />

      <main>
        <section className={styles.pageHero}>
          <div className={`${styles.container} ${styles.nlLeaveWrap}`}>
            <Reveal>
              <a className={styles.eyebrow} href="/newsletter">
                ← Radar do Lojista
              </a>
            </Reveal>
            <Reveal delay={80}>
              <h1 className={styles.heroTitle}>
                Puxa… <span className={styles.highlight}>foi bom enquanto durou.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className={styles.heroSub}>Se quiser, conta pra gente por que está saindo — é opcional. Depois é só digitar seu e-mail.</p>
            </Reveal>
            <Reveal delay={240}>
              <UnsubscribeForm />
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
