import Link from 'next/link'
import styles from './site.module.css'

export const SIGNUP_HREF = '/interesse'
export const LOGIN_HREF = '/login?intent=login'
export const DEMO_HREF = '/demo'
export const SITE_URL = 'https://www.rpgcapital.com.br'
export const CONTACT_EMAIL = 'comercial@rpgcapital.com.br'
export const INSTAGRAM_URL = 'https://www.instagram.com/rpg_capital_credito/'
export const LINKEDIN_URL = 'https://www.linkedin.com/company/rpgcapital/'

const NAV = [
  { href: '/#rafa', label: 'Rafa' },
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/integracoes', label: 'Integrações' },
  { href: '/credito', label: 'Crédito' },
  { href: '/edu', label: 'RPG Edu' },
  { href: '/cultura', label: 'Cultura' },
]

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Link className={styles.logo} href="/" aria-label="RPG Capital & Crédito — início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-rpg-capital-credito-azul.png" width={913} height={228} alt="RPG Capital & Crédito" />
        </Link>
        <nav className={styles.navLinks} aria-label="Navegação principal">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.navActions}>
          <a className={styles.loginLink} href={LOGIN_HREF}>
            Entrar
          </a>
          <a className={styles.smallButton} href={SIGNUP_HREF}>
            Criar conta
          </a>
          <details className={styles.mobileMenu}>
            <summary aria-label="Abrir menu">
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </summary>
            <div className={styles.mobileMenuPanel}>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <a href={LOGIN_HREF}>Entrar</a>
              <a href={DEMO_HREF}>Conta de teste</a>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-rpg-capital-credito-azul.png" width={913} height={228} alt="RPG Capital & Crédito" />
          <p>Você toca a loja. A Rafa organiza o resto.</p>
        </div>
        <div className={styles.footerCol}>
          <strong>Produto</strong>
          <Link href="/#rafa">Rafa no WhatsApp</Link>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/integracoes">Integrações</Link>
          <Link href="/developers/docs">Documentação da API</Link>
        </div>
        <div className={styles.footerCol}>
          <strong>Empresa</strong>
          <Link href="/sobre">Sobre a RPG</Link>
          <Link href="/credito">Crédito</Link>
          <Link href="/edu">RPG Edu</Link>
          <Link href="/cultura">Cultura</Link>
        </div>
        <div className={styles.footerCol}>
          <strong>Acesso e contato</strong>
          <a href={LOGIN_HREF}>Entrar</a>
          <a href={SIGNUP_HREF}>Criar conta</a>
          <a href={DEMO_HREF}>Conta de teste</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
            Instagram
          </a>
          <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        </div>
      </div>
      <div className={`${styles.container} ${styles.footerBottom}`}>
        <span>© 2026 RPG Capital & Crédito.</span>
        <span>Feito para o varejo brasileiro.</span>
      </div>
    </footer>
  )
}
