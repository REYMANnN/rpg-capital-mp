import { Comfortaa } from 'next/font/google'

// Fonte arredondada dos títulos, a mesma linguagem do material "Rafa no WhatsApp".
export const display = Comfortaa({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
})
