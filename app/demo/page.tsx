import type { Metadata } from 'next'
import DemoBalcao from './DemoBalcao'

export const metadata: Metadata = {
  title: 'Conta de teste | BALCÃO',
  description: 'Teste o BALCÃO como gerente com uma loja de demonstração completa e dados fictícios.',
  robots: { index: false, follow: false },
}

export default function DemoPage() {
  return <DemoBalcao />
}
