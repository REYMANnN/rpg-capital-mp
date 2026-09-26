export type OnboardingTermId = 'use' | 'commercial' | 'data' | 'ai'

export type OnboardingTermSection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export type OnboardingTerm = {
  id: OnboardingTermId
  title: string
  shortDescription: string
  publicHref?: string
  sections: OnboardingTermSection[]
}

export const onboardingTerms: OnboardingTerm[] = [
  {
    id: 'use',
    title: 'Termos de Uso',
    shortDescription: 'Regras gerais para criar e usar sua conta no BALCÃO.',
    publicHref: '/termos',
    sections: [
      {
        title: '1. Serviço e conta',
        paragraphs: [
          'O RPG Balcão é oferecido pela RPG Capital, marca de 57.114.756 RENAN PANGONI GUADALUPE, CNPJ 57.114.756/0001-89. Ao criar uma conta ou usar o serviço, você concorda com estes termos e com a Política de Privacidade.',
          'O BALCÃO é um software de gestão para comércio, com cadastro de produtos, estoque, caixa, registro de vendas e compras, relatórios e atendimento automatizado pelo WhatsApp.',
          'Você é responsável pelas informações cadastradas e por quem usa sua conta, seus PINs e o número de WhatsApp vinculado à loja.',
        ],
      },
      {
        title: '2. Uso permitido',
        paragraphs: ['O serviço deve ser usado de forma lícita e dentro das permissões da conta.'],
        bullets: [
          'Não use o serviço para fraude, spam, cobrança ilícita ou outras atividades ilegais.',
          'Não tente acessar dados de outras lojas, burlar limites ou prejudicar a plataforma.',
          'O uso do WhatsApp também segue as políticas do WhatsApp Business.',
        ],
      },
      {
        title: '3. Disponibilidade e responsabilidade',
        paragraphs: [
          'Trabalhamos para manter o serviço disponível, mas podem ocorrer interrupções, inclusive de serviços de terceiros, bancos, WhatsApp e internet.',
          'Relatórios e recursos do BALCÃO são ferramentas de apoio e não substituem contador ou orientação profissional.',
        ],
      },
      {
        title: '4. Suspensão e alterações',
        paragraphs: [
          'Podemos suspender contas que violem estes termos ou coloquem em risco a plataforma ou outros usuários.',
          'Podemos atualizar estes termos com aviso prévio. Fica eleito o foro da comarca de São José dos Campos/SP, ressalvado o foro do consumidor quando aplicável.',
        ],
      },
      {
        title: '5. WhatsApp e alertas',
        paragraphs: [
          'Só enviamos mensagens para quem se cadastrou e autorizou contato. Você pode parar de receber alertas a qualquer momento respondendo PARAR ou pelo menu. Sempre é possível falar com uma pessoa da nossa equipe.',
        ],
      },
    ],
  },
  {
    id: 'commercial',
    title: 'Termos Comerciais',
    shortDescription: 'Preço, cobrança recorrente, renovação e condições comerciais do plano.',
    sections: [
      {
        title: '1. Plano e preço',
        paragraphs: [
          'O plano BALCÃO custa R$ 9,99 por mês e é cobrado de forma recorrente pelo parceiro de pagamentos da RPG.',
          'A cobrança recorrente ocorre todo dia 1. Não há cobrança proporcional.',
        ],
      },
      {
        title: '2. Primeira cobrança',
        paragraphs: [
          'Se você concluir a adesão depois do dia 1, não cobramos no momento da adesão. No próximo dia 1 serão cobrados R$ 19,98, correspondentes ao mês de entrada e ao mês corrente. Depois disso, a cobrança volta a R$ 9,99 por mês, todo dia 1.',
        ],
      },
      {
        title: '3. Autorização de cobrança',
        paragraphs: [
          'Ao aceitar estes Termos Comerciais e continuar, você autoriza a cobrança recorrente do BALCÃO nas condições apresentadas acima.',
          'Os dados completos do cartão são enviados ao parceiro de pagamentos pelo servidor do BALCÃO e não são armazenados no banco de dados da RPG.',
        ],
      },
      {
        title: '4. Cancelamento e custos adicionais',
        paragraphs: [
          'Você pode cancelar quando quiser em Configurações > Conta. O cancelamento interrompe cobranças futuras e encerra o acesso do negócio ao BALCÃO. Valores já pagos não são estornados automaticamente; quando houver direito legal a reembolso, ele será tratado conforme a legislação aplicável.',
          'Se algum recurso tiver custo extra ou houver alteração relevante de preço, a RPG informará antes da contratação ou da entrada em vigor da nova condição.',
        ],
      },
    ],
  },
  {
    id: 'data',
    title: 'Dados e Privacidade (LGPD)',
    shortDescription: 'Como seus dados são coletados, usados, compartilhados e protegidos.',
    publicHref: '/privacidade',
    sections: [
      {
        title: '1. Controladora e dados tratados',
        paragraphs: [
          'A RPG Capital, marca de 57.114.756 RENAN PANGONI GUADALUPE, CNPJ 57.114.756/0001-89, é controladora dos dados tratados no site rpgcapital.com.br, no aplicativo RPG Balcão e no atendimento pelo WhatsApp.',
          'Podemos tratar dados de cadastro, identificação, contato, loja, produtos, estoque, vendas, compras, notas fiscais, fornecedores, mensagens e arquivos enviados pelo WhatsApp, dados técnicos de acesso e, quando você optar por conectar, dados bancários via Open Finance.',
        ],
      },
      {
        title: '2. Finalidades e bases legais',
        paragraphs: [
          'Usamos os dados para prestar o serviço, interpretar mensagens e arquivos, manter estoque e caixa, produzir relatórios e alertas, cobrar a assinatura, cumprir obrigações legais, garantir segurança e melhorar o produto.',
          'As bases legais incluem execução de contrato, cumprimento de obrigação legal, legítimo interesse para segurança e melhoria do serviço e consentimento quando a lei ou o recurso exigir, inclusive para conexão bancária opcional.',
        ],
      },
      {
        title: '3. Compartilhamento',
        paragraphs: ['Não vendemos seus dados. Compartilhamos apenas o necessário para operar o serviço e cumprir a lei.'],
        bullets: [
          'Hospedagem e banco de dados, incluindo Vercel e Supabase.',
          'WhatsApp Business Platform, da Meta.',
          'Parceiros autorizados de Open Finance, quando você conectar uma conta.',
          'Parceiros de cobrança e pagamento.',
          'Provedores de inteligência artificial usados para transcrever ou interpretar conteúdo.',
          'Autoridades, quando exigido por lei.',
        ],
      },
      {
        title: '4. Retenção, segurança e direitos',
        paragraphs: [
          'Mantemos os dados enquanto a conta estiver ativa e, depois, pelo prazo necessário para obrigações legais, fiscais ou exercício de direitos. Dados tratados apenas por consentimento podem ser apagados após revogação, salvo obrigação legal de guarda.',
          'Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revogação de consentimento pelo e-mail comercial@rpgcapital.com.br. Também pode reclamar à ANPD.',
          'Usamos criptografia em trânsito, controle de acesso por usuário e registros de auditoria. Nenhum sistema é 100% seguro; incidentes relevantes serão tratados conforme a LGPD.',
        ],
      },
    ],
  },
  {
    id: 'ai',
    title: 'Termos de IA',
    shortDescription: 'Regras específicas para recursos que usam inteligência artificial.',
    sections: [
      {
        title: '1. O que a IA faz',
        paragraphs: [
          'Recursos de inteligência artificial do BALCÃO podem interpretar texto, áudio, fotos e documentos para transcrever conteúdo, identificar informações, organizar dados e sugerir registros ou ações dentro do sistema.',
        ],
      },
      {
        title: '2. Limitações e confirmação',
        paragraphs: [
          'Modelos de inteligência artificial podem errar, omitir informações ou interpretar conteúdo de forma incorreta. Você deve conferir as informações antes de confirmar registros ou decisões relevantes.',
          'Quando o BALCÃO apresentar uma sugestão de estoque, preço, lançamento ou outro registro para sua confirmação, você é responsável por revisar o conteúdo que confirmar.',
        ],
      },
      {
        title: '3. Dados enviados à IA',
        paragraphs: [
          'Somente os dados necessários para executar o recurso solicitado são enviados aos provedores de inteligência artificial utilizados pela RPG.',
          'Esses provedores são contratados para prestar o serviço e não recebem autorização da RPG para usar os dados dos usuários do BALCÃO para treinar modelos próprios.',
        ],
      },
      {
        title: '4. Responsabilidade de uso',
        paragraphs: [
          'Os recursos de IA são ferramentas de apoio e não substituem julgamento humano, contador, advogado ou outro profissional quando a situação exigir orientação especializada.',
          'Não envie conteúdo ilegal ou dados de terceiros que você não esteja autorizado a tratar. O uso dos recursos de IA também está sujeito aos Termos de Uso e à Política de Privacidade do BALCÃO.',
        ],
      },
    ],
  },
]
