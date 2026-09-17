import type { Metadata } from 'next'
import { onboardingTerms, type OnboardingTerm } from '@/lib/legal/onboardingTerms'

export const metadata: Metadata = {
  title: 'Termos e Condições — RPG Capital',
  description: 'Termos de Uso, Termos Comerciais, Dados e Privacidade (LGPD) e Termos de IA do RPG Balcão.',
  alternates: { canonical: 'https://rpgcapital.com.br/termos' },
}

function TermContent({ term }: { term: OnboardingTerm }) {
  return (
    <div className="mt-6 space-y-7">
      {term.sections.map((section) => (
        <section key={section.title}>
          <h3 className="text-lg font-bold text-slate-950">{section.title}</h3>
          {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-2 text-base leading-7 text-slate-700">{paragraph}</p>)}
          {section.bullets ? <ul className="mt-3 list-disc space-y-2 pl-6 text-base leading-7 text-slate-700">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
        </section>
      ))}
    </div>
  )
}

export default function Termos() {
  const useTerms = onboardingTerms.find((term) => term.id === 'use')!
  const commercialTerms = onboardingTerms.find((term) => term.id === 'commercial')!
  const dataTerms = onboardingTerms.find((term) => term.id === 'data')!
  const aiTerms = onboardingTerms.find((term) => term.id === 'ai')!

  return (
    <main className="mx-auto w-full max-w-[860px] px-4 py-12 text-slate-900 sm:px-6">
      <p className="text-sm font-bold tracking-[0.16em] text-blue-700">RPG CAPITAL · BALCÃO</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Termos e Condições</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
        Esta página reúne os documentos aplicáveis ao uso do RPG Balcão. A RPG Capital é uma marca de <strong>57.114.756 RENAN PANGONI GUADALUPE</strong>, CNPJ <strong>57.114.756/0001-89</strong>.
      </p>
      <p className="mt-2 text-sm text-slate-500"><em>Última atualização: 16 de setembro de 2026</em></p>

      <nav aria-label="Índice dos termos" className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <a className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50" href="#uso">1. Termos de Uso</a>
        <a className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50" href="#comerciais">2. Termos Comerciais</a>
        <a className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50" href="#dados">3. Dados e Privacidade (LGPD)</a>
        <a className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50" href="#ia">4. Termos de IA</a>
      </nav>

      <section id="uso" className="scroll-mt-6 border-b border-slate-200 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{useTerms.title}</h2>
        <p className="mt-2 text-slate-600">{useTerms.shortDescription}</p>
        <TermContent term={useTerms} />
      </section>

      <section id="comerciais" className="scroll-mt-6 border-b border-slate-200 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{commercialTerms.title}</h2>
        <p className="mt-2 text-slate-600">{commercialTerms.shortDescription}</p>
        <TermContent term={commercialTerms} />
      </section>

      <section id="dados" className="scroll-mt-6 border-b border-slate-200 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{dataTerms.title}</h2>
        <p className="mt-2 text-slate-600">{dataTerms.shortDescription}</p>
        <TermContent term={dataTerms} />
        <a className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50" href="/privacidade">Abrir Política de Privacidade completa</a>
      </section>

      <section id="ia" className="scroll-mt-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight">{aiTerms.title}</h2>
        <p className="mt-2 text-slate-600">{aiTerms.shortDescription}</p>
        <TermContent term={aiTerms} />
      </section>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
        Dúvidas sobre estes termos: <a className="font-semibold text-blue-700 underline underline-offset-4" href="mailto:comercial@rpgcapital.com.br">comercial@rpgcapital.com.br</a>.
      </div>
    </main>
  )
}
