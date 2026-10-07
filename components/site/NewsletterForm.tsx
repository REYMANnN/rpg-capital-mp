'use client'

import { useState, type FormEvent } from 'react'
import styles from './site.module.css'

/** Inscrição na newsletter do RPG Edu (guarda só nome e e-mail). */
export default function NewsletterForm({ source = 'site_edu' }: { source?: 'site_edu' | 'site_edu_aulas' }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setStatus('sending')
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), name: data.get('nome') || '', source }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Não foi possível inscrever agora.')
      setStatus('ok')
      form.reset()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Não foi possível inscrever agora.')
    }
  }

  if (status === 'ok') {
    return (
      <p className={styles.formSuccess} role="status">
        Pronto! Você vai receber as novidades do RPG Edu no seu e-mail.
      </p>
    )
  }

  return (
    <form className={styles.newsletter} onSubmit={onSubmit}>
      <label className={styles.srOnly} htmlFor={`nl-nome-${source}`}>
        Seu nome
      </label>
      <input id={`nl-nome-${source}`} name="nome" placeholder="Seu nome" autoComplete="name" />
      <label className={styles.srOnly} htmlFor={`nl-email-${source}`}>
        Seu e-mail
      </label>
      <input id={`nl-email-${source}`} name="email" type="email" required placeholder="Seu melhor e-mail" autoComplete="email" />
      <button type="submit" className={styles.btnYellow} disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Quero receber'}
      </button>
      {status === 'error' && (
        <p className={styles.formError} role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
