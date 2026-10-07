'use client'

import { useState } from 'react'
import styles from './site.module.css'

type Layer = {
  id: string
  label: string
  title: string
  text: string
  items?: { name: string; text: string }[]
}

const LAYERS: Layer[] = [
  {
    id: 'core',
    label: 'O³',
    title: 'O³ — nossos valores centrais',
    text: 'No centro de tudo estão três valores. Cada decisão da RPG passa por eles antes de qualquer outra coisa.',
    items: [
      { name: 'Obsessão', text: 'Pelo cliente, pela dor dele e pela jornada inteira. Se o lojista precisar perguntar como funciona, o produto falhou.' },
      { name: 'Otimização', text: 'O mínimo de recursos para o maior resultado possível. Testar pequeno, escalar o que funciona, matar rápido o que não funciona.' },
      { name: 'Ousadia', text: 'Mudar a experiência de um público que o sistema financeiro ignorou — sem esperar permissão para fazer melhor.' },
    ],
  },
  {
    id: 'proposito',
    label: 'Propósito',
    title: 'Propósito',
    text: 'O sistema financeiro brasileiro não foi desenhado para o pequeno comerciante. A RPG existe para fechar a distância entre o sistema financeiro e a operação real do varejo.',
  },
  {
    id: 'missao',
    label: 'Missão',
    title: 'Missão',
    text: 'Todo dia, deixar a operação do comerciante um pouco melhor: um pouco mais lucrativa, com um pouco mais de margem e de fôlego no caixa.',
  },
  {
    id: 'visao',
    label: 'Visão',
    title: 'Visão',
    text: 'Que ter uma conta RPG seja tão essencial para um comércio quanto ter um CNPJ.',
  },
]

/** Matriz O³: círculos concêntricos — quanto mais perto do centro, mais perto dos valores. */
export default function CoreMatrix() {
  const [active, setActive] = useState('core')
  const layer = LAYERS.find((l) => l.id === active) ?? LAYERS[0]
  const rings = [...LAYERS].reverse() // de fora para dentro

  return (
    <div className={styles.matrix}>
      <div className={styles.rings} role="group" aria-label="Matriz de cultura O³">
        {rings.map((ring, i) => (
          <button
            key={ring.id}
            type="button"
            className={`${styles.ring} ${styles[`ring${i}`]} ${ring.id === active ? styles.ringOn : ''}`}
            onMouseEnter={() => setActive(ring.id)}
            onFocus={() => setActive(ring.id)}
            onClick={() => setActive(ring.id)}
            aria-pressed={ring.id === active}
          >
            <span className={styles.ringLabel}>{ring.label}</span>
          </button>
        ))}
        <span className={styles.orbit} aria-hidden="true">
          <i>O</i>
          <i>O</i>
          <i>O</i>
        </span>
      </div>
      <div className={styles.matrixPanel} aria-live="polite">
        <span className={styles.eyebrow}>{layer.id === 'core' ? 'Centro' : 'Camada'}</span>
        <h3>{layer.title}</h3>
        <p>{layer.text}</p>
        {layer.items && (
          <div className={styles.oList}>
            {layer.items.map((item) => (
              <div key={item.name} className={styles.oItem}>
                <b>{item.name}</b>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        )}
        <div className={styles.matrixHint}>
          {LAYERS.map((l) => (
            <button key={l.id} type="button" onClick={() => setActive(l.id)} className={l.id === active ? styles.hintOn : ''}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
