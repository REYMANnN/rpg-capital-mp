import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '@/components/site/site.module.css'
import { display } from '@/components/site/fonts'
import Reveal from '@/components/site/Reveal'
import Spotlight from '@/components/site/Spotlight'
import Terminal from '@/components/site/Terminal'
import { SITE_URL, SiteFooter, SiteHeader } from '@/components/site/SiteChrome'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Integrações e RPG for Developers — RPG Capital & Crédito',
  description: 'Conecte sistemas à RPG para ler ou escrever produtos, estoque, vendas, financeiro e preços com autorização explícita do lojista.',
  alternates: { canonical: `${SITE_URL}/integracoes` },
  robots: { index: true, follow: true },
}

const capabilities = [
  ['📦', 'Produtos', 'Leia cadastros e, com autorização, crie ou altere produtos.'],
  ['🗂', 'Estoque', 'Consulte o estoque e registre entradas, saídas e ajustes.'],
  ['🧾', 'Vendas', 'Consulte vendas ou envie vendas de outro sistema para a RPG.'],
  ['🏦', 'Financeiro', 'Consulte transações e informações financeiras autorizadas.'],
  ['🏷', 'Preços', 'Leia histórico e recomendações ou aplique alterações autorizadas.'],
  ['⚡', 'Webhooks', 'Receba eventos para manter seu sistema sincronizado com a RPG.'],
]

const steps = [
  ['Crie seu app', 'Entre no RPG for Developers com Google e crie uma aplicação.'],
  ['Gere sua chave', 'Defina quais scopes aquela chave poderá utilizar.'],
  ['Peça autorização', 'Gere um link com os acessos que deseja e envie ao lojista.'],
  ['Use a API', 'Com a chave e o Connection ID, acesse apenas o que foi autorizado.'],
]

export default function IntegrationsPage() {
  return (
    <div className={`${styles.page} ${display.variable}`}>
      <style>{'[data-build-version]{display:none!important}'}</style>
      <SiteHeader />

      <main>
        <section className={styles.pageHeroDark}>
          <div className={`${styles.container} ${styles.pageHeroGrid}`}>
            <div className={styles.heroText}>
              <Reveal>
                <span className={styles.eyebrowLight}>RPG for Developers</span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className={styles.pageTitle}>
                  Construa seu sistema sobre os <span>dados da RPG.</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className={styles.lead}>
                  Crie uma aplicação, gere sua chave, peça somente as permissões necessárias e envie um link seguro para o lojista autorizar a conexão.
                </p>
              </Reveal>
              <Reveal delay={240} className={styles.actions}>
                <Link href="/developers/login" className={styles.btnYellow}>
                  Criar conta Developer
                </Link>
                <Link href="/developers/docs" className={styles.btnGhostLight}>
                  Ler documentação
                </Link>
              </Reveal>
              <Reveal delay={300}>
                <p className={styles.lead} style={{ fontSize: 15 }}>
                  Já tem conta?{' '}
                  <Link href="/developers/login" className={styles.yellowWord}>
                    Entrar no RPG for Developers
                  </Link>{' '}
                  ·{' '}
                  <Link href="/developers/docs" className={styles.yellowWord}>
                    Documentação
                  </Link>
                </p>
              </Reveal>
            </div>
            <Reveal delay={200}>
              <Terminal />
            </Reveal>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>Como funciona</span>
              <h2 className={styles.sectionTitle}>
                Quatro passos. <span className={styles.muted}>Sempre com a autorização do lojista.</span>
              </h2>
            </Reveal>
            <div className={styles.connected}>
              {steps.map(([title, text], index) => (
                <Reveal key={title} className={styles.connectedStep} delay={index * 120}>
                  <span>{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionSoft}>
          <div className={styles.container}>
            <Reveal className={styles.sectionHead}>
              <span className={styles.eyebrow}>API</span>
              <h2 className={styles.sectionTitle}>Uma API para a operação da loja.</h2>
            </Reveal>
            <div className={styles.spotlightGrid}>
              {capabilities.map(([icon, title, text], index) => (
                <Reveal key={title} delay={(index % 3) * 100}>
                  <Spotlight>
                    <span className={styles.cardIcon} aria-hidden="true">
                      {icon}
                    </span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </Spotlight>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal className={styles.securityBand}>
              <span className={styles.lock} aria-hidden="true">
                🔒
              </span>
              <div>
                <h2 className={styles.sectionTitle} style={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>
                  O lojista continua no controle.
                </h2>
                <ul>
                  <li>Uma chave Developer sozinha não acessa nenhuma loja.</li>
                  <li>Cada conexão exige autorização explícita do proprietário ou administrador.</li>
                  <li>Leitura e escrita são permissões separadas.</li>
                </ul>
              </div>
            </Reveal>
            <Reveal className={styles.actions} delay={150}>
              <Link href="/developers/login" className={styles.btnPrimary} style={{ marginTop: 32 }}>
                Criar conta Developer
              </Link>
              <Link href="/developers/docs" className={styles.btnGhost} style={{ marginTop: 32 }}>
                Ler documentação
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
