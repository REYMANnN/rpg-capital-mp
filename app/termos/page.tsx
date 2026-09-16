import type { Metadata } from 'next'
import LegalFooter from '@/components/LegalFooter'

export const metadata: Metadata = {
  title: 'Termos de Uso — RPG Capital',
  description: 'Regras de uso do RPG Balcão e do atendimento pelo WhatsApp.',
}

export default function Termos() {
  return (
    <>
      <main className="mx-auto w-full max-w-[760px] px-4 py-12 leading-7 text-slate-900">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Termos de Uso</h1>
        <p className="mt-3 text-sm text-slate-500"><em>Última atualização: 16 de setembro de 2026</em></p>

        <h2 className="mt-10 text-xl font-bold">1. Quem oferece o serviço</h2>
        <p className="mt-3">
          O RPG Balcão é oferecido pela RPG Capital, marca de <strong>57.114.756 RENAN PANGONI GUADALUPE</strong>,
          CNPJ 57.114.756/0001-89. Ao criar uma conta ou usar nosso número de WhatsApp, você concorda com estes termos
          e com a <a className="text-blue-700 underline" href="/privacidade">Política de Privacidade</a>.
        </p>

        <h2 className="mt-10 text-xl font-bold">2. O que é o serviço</h2>
        <p className="mt-3">
          Software de gestão para comércio: cadastro de produtos, estoque, caixa, registro de vendas e compras,
          relatórios e atendimento automatizado pelo WhatsApp. <strong>A RPG não guarda, recebe nem movimenta o
          dinheiro das suas vendas.</strong> Pagamentos por Pix vão direto para a sua chave; pagamentos com cartão
          são feitos na sua própria maquininha.
        </p>

        <h2 className="mt-10 text-xl font-bold">3. Conta e acesso</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Você é responsável pelas informações cadastradas e por quem usa sua conta, seus PINs e seu número de WhatsApp.</li>
          <li>O número de WhatsApp vinculado à loja funciona como forma de acesso. Avise-nos imediatamente se perder o aparelho.</li>
        </ul>

        <h2 className="mt-10 text-xl font-bold">4. Assinatura</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Plano mensal de R$ 5,99, cobrado de forma recorrente pelo nosso parceiro de pagamentos.</li>
          <li>Você pode cancelar quando quiser; o acesso segue até o fim do período pago.</li>
          <li>Se algum recurso tiver custo extra, avisaremos antes de você contratar.</li>
        </ul>

        <h2 className="mt-10 text-xl font-bold">5. Inteligência artificial</h2>
        <p className="mt-3">
          O assistente interpreta textos, áudios e fotos para sugerir registros. Ele pode errar. Por isso, alterações
          de estoque, preço e lançamentos são apresentadas para <strong>sua confirmação</strong> antes de gravar.
          Você é responsável por conferir o que confirma.
        </p>

        <h2 className="mt-10 text-xl font-bold">6. Uso permitido</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>Não use o serviço para atividades ilegais, fraude, envio de spam ou cobrança de dívidas pelo WhatsApp.</li>
          <li>Não tente acessar dados de outras lojas, burlar limites ou prejudicar a plataforma.</li>
          <li>O uso do WhatsApp também segue as políticas do WhatsApp Business.</li>
        </ul>

        <h2 className="mt-10 text-xl font-bold">7. Seus dados</h2>
        <p className="mt-3">
          Os dados da sua loja são seus. Você pode exportá-los ou pedir a exclusão conforme a Política de Privacidade.
        </p>

        <h2 className="mt-10 text-xl font-bold">8. Disponibilidade e responsabilidade</h2>
        <p className="mt-3">
          Trabalhamos para manter o serviço disponível, mas podem ocorrer interrupções, inclusive de serviços de
          terceiros (WhatsApp, bancos, internet). Os relatórios são ferramentas de apoio e não substituem contador
          ou orientação profissional. Nossa responsabilidade se limita, no máximo, ao valor pago nos últimos 12 meses,
          exceto quando a lei proibir essa limitação.
        </p>

        <h2 className="mt-10 text-xl font-bold">9. Suspensão</h2>
        <p className="mt-3">Podemos suspender contas que violem estes termos ou coloquem em risco a plataforma ou outros usuários.</p>

        <h2 className="mt-10 text-xl font-bold">10. Alterações e foro</h2>
        <p className="mt-3">
          Podemos atualizar estes termos com aviso prévio. Fica eleito o foro da comarca de São José dos Campos/SP,
          ressalvado o foro do consumidor quando aplicável.
        </p>

        <p className="mt-10">Dúvidas: <a className="text-blue-700 underline" href="mailto:comercial@rpgcapital.com.br">comercial@rpgcapital.com.br</a></p>
      </main>
      <LegalFooter />
    </>
  )
}
