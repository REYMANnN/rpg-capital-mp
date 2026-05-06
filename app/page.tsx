import Link from 'next/link'
import { Logo } from '@/components/logo'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0057d2] flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Logo size="md" />
        <Link
          href="/cadastro"
          className="text-sm text-white/80 hover:text-white transition-colors"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-4xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-8">
          <div className="w-2 h-2 rounded-full bg-[#ffde00] animate-pulse" />
          <span className="text-white/90 text-sm font-medium">Zero taxas na rede RPG Capital</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-6">
          Pagamentos{' '}
          <span className="text-[#ffde00]">sem taxa.</span>
          <br />
          Para todo mundo.
        </h1>

        <p className="text-lg md:text-xl text-white/80 max-w-2xl mb-12 leading-relaxed">
          Conecte sua loja ou pague em qualquer estabelecimento da rede RPG Capital.
          Sem taxas entre clientes da rede. Simples assim.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <Link
            href="/cadastro?type=pj"
            className="flex-1 bg-[#ffde00] text-[#0a0a0a] font-bold py-4 px-8 rounded-xl text-center text-lg hover:bg-yellow-300 transition-colors shadow-lg"
          >
            Sou Lojista
          </Link>
          <Link
            href="/cadastro?type=pf"
            className="flex-1 border-2 border-white text-white font-bold py-4 px-8 rounded-xl text-center text-lg hover:bg-white hover:text-[#0057d2] transition-colors"
          >
            Quero pagar na rede
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-3 gap-8 w-full max-w-lg">
          {[
            { value: '0%', label: 'Taxa na rede' },
            { value: '1%', label: 'Taxa fora da rede' },
            { value: '5min', label: 'Para começar' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-black text-[#ffde00]">{stat.value}</p>
              <p className="text-white/70 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Features */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-[#0057d2] text-center mb-12">
            Uma plataforma completa para seu negócio
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '⚡',
                title: 'Pagamentos instantâneos',
                desc: 'QR Code + Pix em segundos. Sem maquininha cara.',
              },
              {
                icon: '📦',
                title: 'Gestão de estoque',
                desc: 'Controle seu inventário direto no painel do lojista.',
              },
              {
                icon: '📊',
                title: 'Dashboard completo',
                desc: 'Relatórios, terminais, contatos e muito mais.',
              },
            ].map((f) => (
              <div key={f.title} className="text-center p-6 rounded-2xl bg-slate-50">
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-lg text-slate-900 mb-2">{f.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#003d94] py-8 px-6 text-center">
        <Logo size="sm" />
        <p className="text-white/50 text-xs mt-3">
          © 2024 RPG Capital. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  )
}
