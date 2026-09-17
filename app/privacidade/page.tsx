import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — RPG Capital',
  description: 'Como a RPG Capital coleta, usa e protege os seus dados.',
  alternates: { canonical: 'https://rpgcapital.com.br/privacidade' },
}

export default function Privacidade() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-12 leading-7 text-slate-900">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Política de Privacidade</h1>
      <p className="mt-3 text-sm text-slate-500"><em>Última atualização: 16 de setembro de 2026</em></p>

      <h2 className="mt-10 text-xl font-bold">1. Quem somos</h2>
      <p className="mt-3">
        A RPG Capital é uma marca de <strong>57.114.756 RENAN PANGONI GUADALUPE</strong>, CNPJ <strong>57.114.756/0001-89</strong>
        (“RPG”, “nós”), controladora dos dados tratados no site rpgcapital.com.br, no aplicativo RPG Balcão e no
        atendimento pelo WhatsApp. Contatos oficiais: <a className="text-blue-700 underline" href="mailto:comercial@rpgcapital.com.br">comercial@rpgcapital.com.br</a>
        {' e '}<a className="text-blue-700 underline" href="tel:+5511936206235">+55 11 93620-6235</a>.
      </p>

      <h2 className="mt-10 text-xl font-bold">2. Quais dados coletamos</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li><strong>Cadastro:</strong> nome, e-mail, telefone, CPF ou CNPJ, nome e endereço da loja, chave Pix.</li>
        <li><strong>Operação da loja:</strong> produtos, preços, custos, estoque, vendas, compras, notas fiscais e fornecedores que você registra.</li>
        <li><strong>WhatsApp:</strong> número, mensagens, áudios, fotos e documentos que você envia para o nosso número oficial.</li>
        <li><strong>Conexão bancária (opcional):</strong> saldos e transações das contas que você decidir conectar ao módulo Financeiro, via Open Finance, somente com o seu consentimento.</li>
        <li><strong>Cobrança:</strong> dados necessários para cobrar a assinatura, processados pelo nosso parceiro de pagamentos.</li>
        <li><strong>Uso técnico:</strong> endereço IP, tipo de aparelho e navegador, registros de acesso e segurança.</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">3. Para que usamos</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Prestar o serviço: estoque, caixa, relatórios, alertas e atendimento pelo WhatsApp.</li>
        <li>Interpretar mensagens de texto, áudio e foto para transformar em registros que você confirma.</li>
        <li>Cobrar a assinatura e cumprir obrigações legais e fiscais.</li>
        <li>Garantir segurança e prevenir fraudes.</li>
        <li>Melhorar o produto, inclusive com estatísticas agregadas e anônimas entre lojas.</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">4. Bases legais (LGPD)</h2>
      <p className="mt-3">
        Execução de contrato (art. 7º, V), cumprimento de obrigação legal (art. 7º, II), legítimo interesse para
        segurança e melhoria do serviço (art. 7º, IX), e consentimento quando a lei ou o recurso exigir, inclusive
        para a conexão bancária opcional (art. 7º, I).
      </p>

      <h2 className="mt-10 text-xl font-bold">5. Com quem compartilhamos</h2>
      <p className="mt-3">Não vendemos seus dados. Compartilhamos apenas com fornecedores necessários para o serviço:</p>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Hospedagem e banco de dados, incluindo Vercel e Supabase.</li>
        <li>Mensageria, incluindo WhatsApp Business Platform, da Meta.</li>
        <li>Conexão bancária via Open Finance, quando você optar por conectar uma conta.</li>
        <li>Cobrança e processamento de pagamentos.</li>
        <li>Provedores de inteligência artificial usados para transcrever ou interpretar conteúdo.</li>
        <li>Autoridades, quando exigido por lei.</li>
      </ul>
      <p className="mt-3">Alguns fornecedores podem processar dados fora do Brasil, com as garantias previstas na LGPD.</p>

      <h2 className="mt-10 text-xl font-bold">6. Por quanto tempo guardamos</h2>
      <p className="mt-3">
        Enquanto sua conta estiver ativa e, depois, pelo prazo exigido por obrigações legais e fiscais ou para
        exercício de direitos. Dados usados apenas com base em consentimento são apagados quando você revoga,
        salvo obrigação legal de guarda.
      </p>

      <h2 className="mt-10 text-xl font-bold">7. Seus direitos</h2>
      <p className="mt-3">
        Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação,
        informação sobre compartilhamento e revogação de consentimento, nos termos da LGPD, pelo e-mail
        <a className="text-blue-700 underline" href="mailto:comercial@rpgcapital.com.br"> comercial@rpgcapital.com.br</a>. Também pode reclamar à ANPD.
      </p>

      <h2 className="mt-10 text-xl font-bold">8. WhatsApp</h2>
      <p className="mt-3">
        O número oficial da RPG Capital para esta operação é <strong>+55 11 93620-6235</strong>. Só enviamos mensagens
        de acordo com as permissões e bases legais aplicáveis. Quando houver comunicações opt-in, você poderá cancelar
        o recebimento conforme as instruções apresentadas no canal.
      </p>

      <h2 className="mt-10 text-xl font-bold">9. Segurança</h2>
      <p className="mt-3">
        Usamos criptografia em trânsito, controles de acesso e registros de auditoria. Nenhum sistema é 100% seguro;
        incidentes relevantes serão tratados conforme a legislação aplicável.
      </p>

      <h2 className="mt-10 text-xl font-bold">10. Menores de idade</h2>
      <p className="mt-3">O serviço é destinado a empresas e pessoas maiores de 18 anos.</p>

      <h2 className="mt-10 text-xl font-bold">11. Mudanças</h2>
      <p className="mt-3">Podemos atualizar esta política. Mudanças relevantes serão informadas pelos canais adequados.</p>
    </main>
  )
}
