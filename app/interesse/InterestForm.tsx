'use client'

import { FormEvent, useState } from 'react'
import styles from './interesse.module.css'

type FormState = {
  name: string
  businessName: string
  address: string
  phone: string
  email: string
  secondaryPhone: string
  secondaryEmail: string
  referralSource: string
  helpText: string
}

const initialState: FormState = {
  name: '',
  businessName: '',
  address: '',
  phone: '',
  email: '',
  secondaryPhone: '',
  secondaryEmail: '',
  referralSource: '',
  helpText: '',
}

export default function InterestForm() {
  const [form, setForm] = useState<FormState>(initialState)
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'sending') return

    setStatus('sending')
    setMessage('')

    try {
      const response = await fetch('/api/interesse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null

      if (!response.ok || !result?.ok) {
        setStatus('error')
        setMessage(result?.error || 'Não foi possível enviar agora. Tente novamente.')
        return
      }

      setStatus('success')
      setForm(initialState)
      setMessage('Recebemos seu interesse. Em breve entraremos em contato para lhe entregar sua conta RPG.')
    } catch {
      setStatus('error')
      setMessage('Não foi possível enviar agora. Tente novamente.')
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Seu nome</span>
          <input
            required
            autoComplete="name"
            maxLength={120}
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="Como podemos chamar você?"
          />
        </label>

        <label className={styles.field}>
          <span>Nome do comércio</span>
          <input
            required
            maxLength={160}
            value={form.businessName}
            onChange={(event) => update('businessName', event.target.value)}
            placeholder="Nome da sua loja"
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>Endereço do comércio</span>
        <input
          required
          autoComplete="street-address"
          maxLength={240}
          value={form.address}
          onChange={(event) => update('address', event.target.value)}
          placeholder="Rua, número, bairro, cidade e estado"
        />
      </label>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Telefone principal</span>
          <input
            required
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
            placeholder="(11) 99999-9999"
          />
        </label>

        <label className={styles.field}>
          <span>E-mail principal</span>
          <input
            required
            type="email"
            autoComplete="email"
            maxLength={180}
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="voce@seucomercio.com.br"
          />
        </label>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Telefone secundário <em>opcional</em></span>
          <input
            type="tel"
            maxLength={32}
            value={form.secondaryPhone}
            onChange={(event) => update('secondaryPhone', event.target.value)}
            placeholder="Outro telefone para contato"
          />
        </label>

        <label className={styles.field}>
          <span>E-mail secundário <em>opcional</em></span>
          <input
            type="email"
            maxLength={180}
            value={form.secondaryEmail}
            onChange={(event) => update('secondaryEmail', event.target.value)}
            placeholder="Outro e-mail para contato"
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>Como ouviu falar de nós?</span>
        <input
          required
          maxLength={240}
          value={form.referralSource}
          onChange={(event) => update('referralSource', event.target.value)}
          placeholder="Ex.: indicação, Instagram, WhatsApp, faculdade..."
        />
      </label>

      <label className={styles.field}>
        <span>Como a RPG poderia ajudar você?</span>
        <textarea
          required
          rows={6}
          maxLength={2000}
          value={form.helpText}
          onChange={(event) => update('helpText', event.target.value)}
          placeholder="Conte quais problemas você enfrenta hoje no seu comércio e o que gostaria que a RPG resolvesse."
        />
      </label>

      <button className={styles.submitButton} type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando...' : 'Enviar meu interesse'}
      </button>

      {message ? (
        <p className={status === 'success' ? styles.success : styles.error} role="status">
          {message}
        </p>
      ) : null}
    </form>
  )
}
