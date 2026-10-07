import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import NewsletterForm from '@/components/site/NewsletterForm'
import { CardFeeCalculator, MarginCalculator } from '@/components/site/Calculators'
import Reveal from '@/components/site/Reveal'
import { SIGNUP_HREF, SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'RPG Edu — Educação financeira e de gestão para o pequeno varejo',
  description:
    'Guias curtos e calculadoras grátis para quem toca loja: margem, fluxo de caixa, estoque, taxas da maquininha, Pix, crédito consciente e MEI. Sem economês.',
  alternates: { canonical: `${SITE_URL}/edu` },
  robots: { index: true, follow: true },
}

const TRILHAS = [
  ['💰', 'Preço e margem', ['Como calcular a margem de lucro da sua loja', 'Markup ou margem: qual usar para dar preço', 'Como precificar produto novo sem chutar']],
  ['📈', 'Fluxo de caixa', ['Por que a loja vende bem e mesmo assim falta dinheiro', 'Como separar o dinheiro da loja do seu', 'Fluxo de caixa no caderno, na planilha ou no celular']],
  ['📦', 'Estoque que gira', ['Curva ABC para mercadinho', 'Como reduzir perda e produto vencido', 'Quanto comprar do fornecedor']],
  ['💳', 'Taxas e maquininha', ['Quanto a maquininha come do seu faturamento', 'Antecipação: quando vale a pena', 'Débito, crédito ou Pix: qual custa menos para a loja']],
  ['⚡', 'Pix na loja', ['Pix para empresa: tarifas e cuidados', 'Como não cair no golpe do comprovante falso']],
  ['🤝', 'Crédito consciente', ['Capital de giro: quando pegar e quando fugir', 'Como comparar juros de verdade (CET)', 'Como o banco avalia sua loja']],
  ['👥', 'Gestão e equipe', ['Como controlar o caixa por funcionário', 'Como montar a escala da equipe']],
  ['🧾', 'MEI e impostos', ['Limite do MEI: o que acontece se passar', 'Como manter o DAS em dia']],
] as const

export default function EduPage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <SiteHeader />

      <main>
        <section className={styles.pageHero}>
          <div className={styles.container}>
            <div className={styles.heroText}>
              <Reveal>
                <span className={styles.eyebrow}>RPG Edu</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.heroTitle}>
                  Aprenda a fazer sua loja <span className={styles.highlight}>dar mais dinheiro.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className={styles.heroSub}>
                  O RPG Edu é o braço de educação da RPG Capital & Crédito. A ideia é simples: levar para o lojista o conhecimento de finanças
                  e administração que sempre ficou com os grandes — em videoaulas, guias curtos e calculadoras grátis. Sem economês.
                </p>
              </Reveal>
              <Reveal delay={240} className={styles.actions}>
                <a className={styles.btnPrimary} href="/edu/aulas">
                  Acessar videoaulas e materiais
                </a>
                <a className={styles.btnGhost} href="#calculadoras">
                  Usar as calculadoras
                </a>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.section} id="aulas">
          <div className={`${styles.container} ${styles.split}`}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Videoaulas e materiais</span>
              <h2 className={styles.sectionTitle}>
                A gente te ensina. <span className={styles.blueWord}>E mostra como fica mais fácil com a RPG.</span>
              </h2>
              <p className={styles.lead}>
                Aulas curtas sobre finanças e administração da loja: preço, margem, caixa, estoque, equipe e crédito. Assista no celular, entre
                um cliente e outro.
              </p>
              <div className={styles.actions}>
                <a className={styles.btnPrimary} href="/edu/aulas">
                  Acessar videoaulas e materiais
                </a>
              </div>
            </Reveal>
            <Reveal delay={120} className={`${styles.lessonGrid} ${styles.lessonGrid2}`}>
              {['Margem: quanto sobra de verdade', 'Fluxo de caixa em 10 minutos', 'Estoque que não para dinheiro', 'Maquininha: quanto ela leva'].map(
                (title, index) => (
                  <a key={title} href="/edu/aulas" className={styles.lesson}>
                    <span className={styles.lessonThumb}>
                      <b>▶</b>
                    </span>
                    <h3>{title}</h3>
                    <small>Aula {index + 1} · em breve</small>
                  </a>
                ),
              )}
            </Reveal>
          </div>
        </section>

        <section className={styles.sectionSoft} id="calculadoras">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Calculadoras grátis</span>
              <h2 className={styles.sectionTitle}>Faça a conta em 1 minuto.</h2>
              <p className={styles.lead}>Coloque os números da sua loja e veja na hora. Nada é salvo.</p>
            </Reveal>
            <div className={styles.calcGrid}>
              <Reveal>
                <MarginCalculator />
              </Reveal>
              <Reveal delay={120}>
                <CardFeeCalculator />
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.section} id="trilhas">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Trilhas</span>
              <h2 className={styles.sectionTitle}>
                O que todo dono de loja precisa saber. <span className={styles.muted}>Explicado direito.</span>
              </h2>
              <p className={styles.lead}>Os primeiros guias estão sendo escritos. Cada um com exemplo de loja real e uma calculadora no final.</p>
            </Reveal>
            <div className={styles.trilhas}>
              {TRILHAS.map(([icon, title, guides], index) => (
                <Reveal key={title} className={styles.trilha} delay={(index % 4) * 80}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    {icon}
                  </span>
                  <h3>{title}</h3>
                  <ul>
                    {guides.map((guide) => (
                      <li key={guide}>{guide}</li>
                    ))}
                  </ul>
                  <span className={styles.soon}>Em breve</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 0 }} id="newsletter">
          <div className={styles.container}>
            <Reveal className={styles.newsBand}>
              <div>
                <h2>Uma dica de gestão por semana.</h2>
                <p>Receba no e-mail as aulas novas, os guias e as calculadoras assim que saírem. Sem spam — dá pra sair quando quiser.</p>
              </div>
              <NewsletterForm />
            </Reveal>
          </div>
        </section>

        <section className={styles.section} style={{ paddingTop: 0 }}>
          <div className={styles.container}>
            <Reveal className={styles.creditBand}>
              <div>
                <span className={styles.eyebrow}>A Rafa explica</span>
                <h2 className={styles.creditTitle} style={{ marginTop: 14 }}>
                  Ficou dúvida? <span>Pergunte à Rafa.</span>
                </h2>
                <p className={styles.lead} style={{ marginTop: 16 }}>
                  “Por quanto vendo esse produto?” ou “vale a pena antecipar?” — a Rafa explica com os números da sua loja.
                </p>
              </div>
              <div className={styles.actions}>
                <a className={styles.btnPrimary} href={SIGNUP_HREF}>
                  Perguntar à Rafa
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={`${styles.container} ${styles.finalInner}`}>
            <Reveal>
              <h2 className={styles.finalTitle}>
                Quer que essas contas <span>se façam sozinhas?</span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p>A gente te ensina a cuidar das finanças da loja — e com a Rafa, margem, estoque e caixa se calculam sozinhos a cada venda.</p>
            </Reveal>
            <Reveal delay={200} className={styles.actions}>
              <a className={styles.btnYellow} href={SIGNUP_HREF}>
                Criar conta
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
