import Link from 'next/link'

export default function LegalFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-[13px] leading-6 text-slate-600">
      <p className="m-0">
        RPG Capital é uma marca de <strong className="font-semibold text-slate-800">57.114.756 RENAN PANGONI GUADALUPE</strong> · CNPJ 57.114.756/0001-89
      </p>
      <p className="mt-1.5 mb-0">
        <a className="underline-offset-4 hover:underline" href="mailto:comercial@rpgcapital.com.br">comercial@rpgcapital.com.br</a>
        {' · '}
        <Link className="underline-offset-4 hover:underline" href="/privacidade">Política de Privacidade</Link>
        {' · '}
        <Link className="underline-offset-4 hover:underline" href="/termos">Termos de Uso</Link>
      </p>
    </footer>
  )
}
