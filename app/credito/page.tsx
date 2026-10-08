import type { Metadata } from 'next'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import PartnerForm from '@/components/site/PartnerForm'
import Reveal from '@/components/site/Reveal'
import { FAQ_CREDITO } from '@/lib/site/aiContent'
import { SIGNUP_HREF, SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

const SEBRAE_SOURCE = 'https://crcma.org.br/noticias/aprovacao-de-credito-para-pequenos-negocios-atinge-maior-nivel-desde-2022'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Crédito — Juros justos começam com dados reais | RPG Capital & Crédito',
  description:
    'A tese dos juros justos da RPG: enxergar a operação real do pequeno varejo para medir o risco de verdade. Para bancos, fintechs, FIDCs, cooperativas e indústria.',
  alternates: { canonical: `${SITE_URL}/credito`, types: { 'text/markdown': `${SITE_URL}/credito.md` } },
  robots: { index: true, follow: true },
}

const LAYERS = [
  ['Operação', 'Produtos vendidos, estoque, margem por produto e giro', 'Rafa (vendas, estoque e notas)'],
  ['Dinheiro', 'Saldo, entradas e saídas: salários, contas, fornecedores', 'Banco do lojista, via Open Finance'],
  ['Vendas no cartão', 'Débito, crédito, parcelas e estornos', 'Maquininha'],
]

const MODELS = [
  ['Originação', 'Lojistas com operação comprovada chegam com dados prontos para análise.'],
  ['Score dinâmico', 'Risco atualizado a cada venda, não uma vez por ano.'],
  ['Monitoramento', 'Acompanhe a saúde da carteira pelo fluxo real da loja.'],
  ['Crédito na cadeia', 'Indústria e distribuidor financiam o lojista com base no sell-out.'],
]

export default function CreditPage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            '@id': `${SITE_URL}/credito#faq`,
            mainEntity: FAQ_CREDITO.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })),
          }),
        }}
      />
      <SiteHeader />

      <main>
        <section className={styles.pageHeroDark}>
          <div className={styles.container}>
            <div className={styles.heroText}>
              <Reveal>
                <span className={styles.eyebrowLight}>Crédito</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.pageTitle}>
                  Juros justos começam com <span>dados reais.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className={styles.lead}>O pequeno comerciante paga caro porque o banco não enxerga a loja dele. A RPG enxerga.</p>
              </Reveal>
              <Reveal delay={240} className={styles.actions}>
                <a className={styles.btnYellow} href="#parceiros">
                  Sou parceiro — quero conversar
                </a>
                <a className={styles.btnGhostLight} href="#lojista">
                  Sou lojista
                </a>
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.container} ${styles.split}`}>
            <Reveal>
              <span className={styles.eyebrow}>O problema</span>
              <h2 className={styles.sectionTitle} style={{ marginTop: 16 }}>
                Quem sustenta a economia real é quem tem <span className={styles.blueWord}>menos acesso a crédito.</span>
              </h2>
              <p className={styles.lead} style={{ marginTop: 20 }}>
                O banco não vê o giro, a margem nem a sazonalidade da loja. O que ele não consegue medir, ele nega ou cobra caro.
              </p>
            </Reveal>
            <Reveal className={styles.statBlock} delay={150}>
              <strong>46%</strong>
              <p>
                dos pequenos negócios que pediram crédito tiveram o pedido aprovado em julho de 2026 — e esse foi o melhor resultado desde
                2022.
              </p>
              <small>
                Fonte: Sebrae, Pulso dos Pequenos Negócios (13ª edição), divulgada em 17/09/2026 —{' '}
                <a href={SEBRAE_SOURCE} target="_blank" rel="noreferrer">
                  CRC-MA
                </a>
                .
              </small>
            </Reveal>
          </div>
        </section>

        <section className={styles.sectionSoft}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>A tese dos juros justos</span>
              <h2 className={styles.sectionTitle}>
                Risco que não se vê vira juro alto. <span className={styles.blueWord}>Risco medido vira juro justo.</span>
              </h2>
            </Reveal>
            <div className={styles.thesis}>
              {[
                ['HOJE', 'O banco avalia a loja por papelada.', 'Sem enxergar a operação, o risco parece alto — e o juro sobe para todo mundo.'],
                ['COM A RPG', 'A operação real fica visível.', 'O que a loja vende, quanto lucra em cada produto, como o dinheiro entra e sai.'],
                ['RESULTADO', 'Juro do tamanho do risco real.', 'Quem empresta mede o risco de verdade, e o lojista bom paga o juro que a loja dele merece.'],
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

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>O que a RPG enxerga</span>
              <h2 className={styles.sectionTitle}>Três camadas de dados, uma visão só da loja.</h2>
              <p className={styles.lead}>Tudo só com autorização do lojista, que pode desconectar quando quiser.</p>
            </Reveal>
            <Reveal className={styles.tableWrap} delay={120}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Camada</th>
                    <th>O que mostra</th>
                    <th>De onde vem</th>
                  </tr>
                </thead>
                <tbody>
                  {LAYERS.map(([layer, what, source]) => (
                    <tr key={layer}>
                      <td>{layer}</td>
                      <td>{what}</td>
                      <td>{source}</td>
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
              <span className={styles.eyebrow}>Nossos compromissos</span>
              <h2 className={styles.sectionTitle}>Crédito que ajuda, nunca que afunda.</h2>
            </Reveal>
            <div className={styles.benefits}>
              {[
                ['Não empurramos crédito.', 'Crédito mal oferecido destrói negócio.'],
                ['Custo e limite claros antes de tudo.', 'Nada de taxa descoberta depois.'],
                ['Parcela que cabe no caixa.', 'O limite é calculado pelo fluxo real da loja.'],
                ['Linguagem simples.', 'Se o lojista precisar perguntar como funciona, a gente falhou.'],
              ].map(([title, text], index) => (
                <Reveal key={title} className={styles.benefit} delay={(index % 3) * 100}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionDark} id="parceiros">
          <div className={`${styles.container} ${styles.split}`}>
            <div>
              <Reveal className={styles.sectionHead}>
                <span className={styles.eyebrowLight}>Para parceiros</span>
                <h2 className={styles.sectionTitle}>
                  Somos a ponte entre a operação do varejo e <span className={styles.yellowWord}>quem empresta.</span>
                </h2>
                <p className={styles.lead}>Bancos, fintechs de crédito, FIDCs, cooperativas de crédito, indústria e distribuidores.</p>
              </Reveal>
              <div className={styles.flow} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: 32 }}>
                {MODELS.map(([title, text], index) => (
                  <Reveal key={title} className={styles.flowStep} delay={index * 100}>
                    <b>{title}</b>
                    <p>{text}</p>
                  </Reveal>
                ))}
              </div>
              <p className={styles.legalNote}>
                A frente de crédito da RPG está em construção e estamos escolhendo os primeiros parceiros. A RPG não é instituição financeira;
                o crédito será oferecido por parceiros autorizados pelo Banco Central.
              </p>
            </div>
            <Reveal delay={150}>
              <h3 className={styles.sectionTitle} style={{ fontSize: 30, marginBottom: 18 }}>
                Vamos conversar.
              </h3>
              <PartnerForm />
            </Reveal>
          </div>
        </section>

        <section className={styles.sectionSoft} id="perguntas">
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Perguntas frequentes</span>
              <h2 className={styles.sectionTitle}>Crédito, sem letra miúda.</h2>
            </Reveal>
            <div className={styles.faqList}>
              {FAQ_CREDITO.map(([question, answer], index) => (
                <Reveal as="details" key={question} delay={index * 60}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="lojista">
          <div className={styles.container}>
            <Reveal className={styles.creditBand}>
              <div>
                <span className={styles.eyebrow}>É lojista?</span>
                <h2 className={styles.creditTitle} style={{ marginTop: 14 }}>
                  O crédito ainda não está disponível. <span>Seja avisado primeiro.</span>
                </h2>
                <p className={styles.lead} style={{ marginTop: 16 }}>
                  Use a Rafa na sua loja hoje: com a operação organizada, você chega pronto quando o crédito chegar.
                </p>
              </div>
              <div className={styles.actions}>
                <a className={styles.btnPrimary} href={SIGNUP_HREF}>
                  Criar conta
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
