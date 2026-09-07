import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLegalDocument, LEGAL_DOCUMENTS, LEGAL_CONTACT_EMAIL } from '@/lib/legal/terms'

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ slug: document.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const document = getLegalDocument(slug)
  if (!document) return { title: 'Documento não encontrado | RPG para Balcões' }

  const canonical = `https://www.rpgcapital.com.br/termos/${document.slug}`
  return {
    title: `${document.title} | RPG para Balcões`,
    description: `${document.title} — versão ${document.version}, vigente desde ${document.effectiveDate}.`,
    alternates: { canonical },
    robots: { index: true, follow: true },
  }
}

export default async function LegalTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const document = getLegalDocument(slug)
  if (!document) notFound()

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="border-b border-slate-200 pb-7">
          <Link href="/" className="text-sm font-bold tracking-[0.16em] text-blue-700">RPG PARA BALCÕES</Link>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">{document.title}</h1>
          <p className="mt-3 text-sm font-medium text-slate-500">Versão {document.version} · Vigente desde {document.effectiveDate}</p>
          <p className="mt-6 text-base leading-7 text-slate-700">{document.intro}</p>
        </div>

        <div className="mt-8 space-y-9">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold tracking-tight text-slate-950">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul className="mt-4 list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700 sm:text-base">
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-7 text-sm leading-6 text-slate-600">
          <p>Contato: <a className="font-semibold text-blue-700 underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a></p>
          <p className="mt-2">Guarde esta versão se ela fizer parte da sua contratação. A versão registrada no aceite da conta é a que comprova o documento aceito naquele momento.</p>
        </footer>
      </article>
    </main>
  )
}
