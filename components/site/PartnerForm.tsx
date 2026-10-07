'use client'

import { useState, type FormEvent } from 'react'
import styles from './site.module.css'

const EMAIL = 'comercial@rpgcapital.com.br'

/** Formulário de parceiros: monta um e-mail pronto para comercial@ (sem guardar nada no site). */
export default function PartnerForm() {
  const [sent, setSent] = useState(false)

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const get = (key: string) => String(data.get(key) || '').trim()
    const body = [
      `Nome: ${get('nome')}`,
      `Empresa: ${get('empresa')}`,
      `Cargo: ${get('cargo')}`,
      `E-mail: ${get('email')}`,
      `Tipo de instituição: ${get('tipo')}`,
      '',
      'Como queremos trabalhar com a RPG:',
      get('mensagem'),
    ].join('\n')
    const subject = `Parceria de crédito — ${get('empresa') || get('nome')}`
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.formRow}>
        <label className={styles.field}>
          Nome
          <input name="nome" required autoComplete="name" />
        </label>
        <label className={styles.field}>
          Empresa
          <input name="empresa" required autoComplete="organization" />
        </label>
      </div>
      <div className={styles.formRow}>
        <label className={styles.field}>
          Cargo
          <input name="cargo" autoComplete="organization-title" />
        </label>
        <label className={styles.field}>
          E-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
      </div>
      <label className={styles.field}>
        Tipo de instituição
        <select name="tipo" defaultValue="Banco">
          <option>Banco</option>
          <option>Fintech de crédito</option>
          <option>FIDC</option>
          <option>Cooperativa de crédito</option>
          <option>Indústria ou distribuidor</option>
          <option>Outro</option>
        </select>
      </label>
      <label className={styles.field}>
        Como você quer trabalhar com a RPG?
        <textarea name="mensagem" />
      </label>
      <button type="submit" className={styles.btnPrimary}>
        Quero conversar
      </button>
      {sent ? (
        <p className={styles.formSuccess} role="status">
          Abrimos seu e-mail com a mensagem pronta. É só enviar — respondemos pelo {EMAIL}.
        </p>
      ) : (
        <p className={styles.formNote}>
          Ao enviar, abrimos seu e-mail com a mensagem pronta para {EMAIL}. Nada fica salvo no site.
        </p>
      )}
    </form>
  )
}
