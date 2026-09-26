import type { ReactNode } from 'react'

// Painel de admin: tela cheia, sem o selo de versão do Balcão por cima dos botões.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{'[data-build-version]{display:none!important}'}</style>
    {children}
  </>
}
