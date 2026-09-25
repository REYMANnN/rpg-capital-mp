import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Rafa · Balcão',
  description: 'Ferramentas da Rafa para o seu comércio.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#102b21',
}

// Ferramentas abertas pelo link da Rafa no WhatsApp. Tela cheia, sem o selo de versão do Balcão.
export default function RafaToolsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{'[data-build-version]{display:none!important}'}</style>
      {children}
    </>
  )
}
