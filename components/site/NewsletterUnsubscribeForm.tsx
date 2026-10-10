'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { UNSUBSCRIBE_REASONS } from '@/lib/newsletter/reasons'
import styles from './site.module.css'

/** Formulário de /newsletter/sair: motivo opcional + e-mail. */
export default function NewsletterUnsubscribeForm() {
  const [reason, setReason] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setStatus('sending')
    try {
      const response = await fetch('/api/newsletter/sair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), reason }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não conseguimos tirar seu e-mail agora.')
      setStatus('ok')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Não conseguimos tirar seu e-mail agora.')
    }
  }

  if (status === 'ok') {
    return (
      <div className={styles.nlBye} role="status">
        <span aria-hidden="true">👋</span>
        <h2>Seu e-mail foi retirado.</h2>
        <p>Esperamos te ver aqui de novo no futuro!</p>
        <Link className={styles.btnGhost} href="/">
          Voltar para o site
        </Link>
      </div>
    )
  }

  return (
    <form className={styles.nlLeaveForm} onSubmit={onSubmit}>
      <fieldset>
        <legend>Por que você está saindo? (opcional)</legend>
        <div className={styles.nlReasons}>
          {UNSUBSCRIBE_REASONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={reason === option}
              className={reason === option ? styles.nlReasonActive : styles.nlReason}
              onClick={() => setReason(reason === option ? '' : option)}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor="nl-sair-email">Seu e-mail</label>
      <div className={styles.nlLeaveRow}>
        <input id="nl-sair-email" name="email" type="email" required placeholder="O e-mail que recebe a newsletter" autoComplete="email" />
        <button type="submit" className={styles.btnPrimary} disabled={status === 'sending'}>
          {status === 'sending' ? 'Saindo…' : 'Sair da newsletter'}
        </button>
      </div>
      {status === 'error' && (
        <p className={styles.formError} role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
