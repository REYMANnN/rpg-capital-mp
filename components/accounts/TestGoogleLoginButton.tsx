import Link from 'next/link'

const TEST_EMAIL = 'renanguadalupe05@gmail.com'

export default function TestGoogleLoginButton() {
  return (
    <div className="mt-4">
      <Link
        href="/manage"
        className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-950 hover:bg-amber-100"
      >
        Entrar na conta de teste
      </Link>
      <p className="mt-2 text-center text-xs text-slate-500">Temporário · {TEST_EMAIL}</p>
    </div>
  )
}
