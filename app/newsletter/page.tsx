import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import NewsletterForm from '@/components/site/NewsletterForm'
import { BrazilDotMap, CountUp, EditionPhone, LineChartDemo, RankingBars } from '@/components/site/NewsletterVisuals'
import Reveal from '@/components/site/Reveal'
import TiltCard from '@/components/site/TiltCard'
import { SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Radar do Lojista — a newsletter da RPG para o pequeno varejo | RPG Capital & Crédito',
  description:
    'O que mexe na sua loja hoje, em 3 minutos: mapa do varejo, gráfico do dia, número do dia e uma dica de gestão. De segunda a sexta, às 6h, grátis.',
  alternates: { canonical: `${SITE_URL}/newsletter` },
  robots: { index: true, follow: true },
}

const SUCCESS = 'Pronto! A partir do próximo dia útil, o Radar do Lojista chega no seu e-mail às 6h.'

const FAQ: Array<[string, string]> = [
  ['Quanto custa?', 'Nada. O Radar do Lojista é grátis.'],
  ['Quando chega?', 'De segunda a sexta, por volta das 6h da manhã, para você ler antes de abrir a loja.'],
  ['Quanto tempo leva para ler?', 'Uns 3 minutos. Cada edição é curta de propósito: mapa, gráfico, número do dia e uma dica.'],
  ['Como faço para sair?', 'É só clicar em "Deseja sair?" no fim desta página ou no fim de qualquer e-mail. Sai na hora.'],
  ['O que vocês fazem com meu e-mail?', 'Só usamos para enviar a newsletter. Não vendemos nem passamos para ninguém.'],
]

export default function NewsletterPage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <SiteHeader />

      <main>
        <section className={styles.pageHeroDark} id="assinar">
          <div className={`${styles.container} ${styles.nlHero}`}>
            <div>
              <Reveal>
                <span className={styles.eyebrowLight}>Newsletter · Radar do Lojista</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.pageTitle}>
                  O que mexe na sua loja hoje, <span>em 3 minutos.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className={styles.lead}>
                  Mapa do varejo, gráfico do dia, o número que importa e uma dica de gestão — direto no seu e-mail, antes de abrir a porta.
                </p>
              </Reveal>
              <Reveal delay={240} className={styles.nlHeroForm}>
                <NewsletterForm source="site_newsletter" buttonText="Assinar grátis" successText={SUCCESS} />
                <ul className={styles.nlFacts}>
                  <li>Segunda a sexta</li>
                  <li>Às 6h</li>
                  <li>Grátis</li>
                  <li>Sai quando quiser</li>
                </ul>
              </Reveal>
            </div>
            <Reveal delay={200} className={styles.nlHeroArt}>
              <TiltCard max={7}>
                <EditionPhone />
              </TiltCard>
            </Reveal>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.nlStats}>
              {[
                [<CountUp key="a" to={3} suffix=" min" />, 'de leitura por edição'],
                [<CountUp key="b" to={5} suffix="x" />, 'por semana, de segunda a sexta'],
                [<CountUp key="c" to={6} suffix="h" />, 'no seu e-mail, antes de abrir a loja'],
              ].map(([value, label], index) => (
                <Reveal key={index} className={styles.nlStat} delay={index * 120}>
                  <strong>{value}</strong>
                  <p>{label}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionSoft} id="edicao">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>O que vem em cada edição</span>
              <h2 className={styles.sectionTitle}>
                Informação do varejo <span className={styles.blueWord}>que dá para usar no mesmo dia.</span>
              </h2>
              <p className={styles.lead}>Nada de economês. Cada bloco responde uma pergunta: o que mudou e o que isso muda na sua loja.</p>
            </Reveal>

            <div className={styles.nlBento}>
              <Reveal className={`${styles.nlCard} ${styles.nlCardWide}`}>
                <div className={styles.nlCardHead}>
                  <small>📍 Mapa do varejo</small>
                  <h3>O que está acontecendo em cada região.</h3>
                </div>
                <BrazilDotMap />
              </Reveal>

              <Reveal className={styles.nlCard} delay={100}>
                <div className={styles.nlCardHead}>
                  <small>📈 Gráfico do dia</small>
                  <h3>Um gráfico, uma conclusão.</h3>
                </div>
                <LineChartDemo />
              </Reveal>

              <Reveal className={styles.nlCard} delay={160}>
                <div className={styles.nlCardHead}>
                  <small>🏆 Ranking</small>
                  <h3>O que mais está girando.</h3>
                </div>
                <RankingBars />
              </Reveal>

              <Reveal className={`${styles.nlCard} ${styles.nlCardBlue}`} delay={220}>
                <div className={styles.nlCardHead}>
                  <small>🔢 Número do dia</small>
                  <h3>O número que vale a pena saber hoje.</h3>
                </div>
                <strong className={styles.nlBig}>
                  <CountUp to={4.2} prefix="R$ " decimals={2} />
                </strong>
                <p>Exemplo: quanto a maquininha leva a cada R$ 100 vendidos no crédito — e como pagar menos.</p>
              </Reveal>

              <Reveal className={`${styles.nlCard} ${styles.nlCardYellow}`} delay={280}>
                <div className={styles.nlCardHead}>
                  <small>💡 Dica de gestão</small>
                  <h3>Uma ação prática para fazer hoje.</h3>
                </div>
                <p>Das trilhas do RPG Edu: preço, margem, caixa, estoque e equipe — em uma frase.</p>
                <a className={styles.nlLink} href="/edu">
                  Conhecer o RPG Edu →
                </a>
              </Reveal>
            </div>
            <p className={styles.nlNote}>Gráficos, mapa e números desta página são exemplos ilustrativos do formato.</p>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Como chega</span>
              <h2 className={styles.sectionTitle}>Do e-mail para o balcão em 3 passos.</h2>
            </Reveal>
            <div className={styles.thesis}>
              {[
                ['06:00', 'Chega no seu e-mail.', 'Antes de você levantar a porta, a edição do dia já está lá.'],
                ['3 MIN', 'Você lê no celular.', 'No café, no ônibus ou entre um cliente e outro.'],
                ['NA LOJA', 'Você decide melhor.', 'Preço, compra, promoção: com informação, não no chute.'],
              ].map(([tag, title, text], index) => (
                <Reveal key={tag} className={styles.thesisStep} delay={index * 140}>
                  <small>{tag}</small>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionSoft} id="perguntas">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Perguntas rápidas</span>
              <h2 className={styles.sectionTitle}>Sem letra miúda.</h2>
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

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.newsBand}>
              <div>
                <h2>Comece amanhã às 6h.</h2>
                <p>Deixe seu e-mail e receba o Radar do Lojista de segunda a sexta. Grátis.</p>
              </div>
              <NewsletterForm source="site_newsletter" buttonText="Assinar grátis" successText={SUCCESS} />
            </Reveal>
            <p className={styles.nlLeave}>
              Deseja sair? <a href="/newsletter/sair">Basta clicar aqui.</a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
