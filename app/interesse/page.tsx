import type { Metadata } from 'next'
import InterestForm from './InterestForm'
import styles from './interesse.module.css'

export const metadata: Metadata = {
  title: 'Tenho interesse — RPG para Balcões',
  description: 'Cadastre seu interesse em usar a RPG para Balcões durante a fase final de testes.',
  robots: { index: true, follow: true },
}

export default function InteressePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="RPG para Balcões — início">
          <span className={styles.brandMark}>RPG</span>
          <span className={styles.brandCopy}>
            <strong>RPG para Balcões</strong>
            <small>por RPG Capital</small>
          </span>
        </a>
        <a className={styles.loginLink} href="/login?intent=login">Entrar na minha conta</a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>FASE FINAL DE TESTES</p>
          <h1>A RPG para Balcões já está na fase de testes finais!</h1>
          <p className={styles.lead}>
            Caso tenha interesse em ajudar a RPG a ajudar outros lojistas, basta preencher o formulário de interesse abaixo.
          </p>
          <p className={styles.supporting}>
            Se você quer usar a RPG no seu comércio, conte um pouco sobre você e sobre a sua loja. Em breve entraremos em contato para conhecer melhor a sua operação e lhe entregar sua conta RPG.
          </p>
          <a className={styles.primaryButton} href="#formulario">Tenho interesse</a>
        </div>

        <aside className={styles.infoCard} aria-label="Como funciona">
          <span className={styles.cardNumber}>01</span>
          <h2>Você deixa seus dados.</h2>
          <p>A RPG analisa o seu interesse e entende como pode ajudar o seu comércio.</p>
          <span className={styles.cardNumber}>02</span>
          <h2>Nós entramos em contato.</h2>
          <p>Assim que pudermos liberar a sua conta, falamos com você pelos contatos informados.</p>
        </aside>
      </section>

      <section className={styles.formSection} id="formulario">
        <div className={styles.formIntro}>
          <p className={styles.eyebrow}>FORMULÁRIO DE INTERESSE</p>
          <h2>Conte um pouco sobre o seu comércio.</h2>
          <p>
            Telefone e e-mail principais são obrigatórios. Se quiser, você também pode deixar um segundo telefone e um segundo e-mail.
          </p>
        </div>
        <InterestForm />
      </section>
    </main>
  )
}
