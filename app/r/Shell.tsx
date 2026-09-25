'use client'

import { MessageCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { RAFA_WHATSAPP } from './shared'
import styles from './r.module.css'

type Props = {
  title: string
  subtitle?: string
  status: 'loading' | 'ready' | 'ended' | 'error'
  action?: ReactNode
  children: ReactNode
}

// Moldura comum das ferramentas da Rafa: topo, carregando e link encerrado.
export default function Shell({ title, subtitle, status, action, children }: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div className={styles.topGrow}>
          <div className={styles.topTitle}>{title}</div>
          {subtitle && <div className={styles.topSub}>{subtitle}</div>}
        </div>
        {action}
      </header>
      {status === 'loading' && <div className={styles.center}><div className={styles.spin} /></div>}
      {status === 'ended' && (
        <div className={styles.center}>
          <div className={styles.bigIcon}><MessageCircle size={34} /></div>
          <div className={styles.bigTitle}>Esse link foi encerrado</div>
          <div className={styles.bigText}>Peça um novo para a Rafa no WhatsApp. Ela sempre manda o link mais recente.</div>
          <a className={styles.btn} style={{ maxWidth: 320, textDecoration: 'none' }} href={RAFA_WHATSAPP}>Voltar pro WhatsApp</a>
        </div>
      )}
      {status === 'error' && (
        <div className={styles.center}>
          <div className={styles.bigTitle}>Não consegui abrir sua loja</div>
          <div className={styles.bigText}>Confira a internet e tente de novo.</div>
          <button className={styles.btn} style={{ maxWidth: 320 }} onClick={() => window.location.reload()}>Tentar de novo</button>
        </div>
      )}
      {status === 'ready' && children}
    </main>
  )
}

export function Toast({ message, error }: { message: string; error?: boolean }) {
  if (!message) return null
  return <div className={`${styles.toast} ${error ? styles.toastError : ''}`} role="status">{message}</div>
}
