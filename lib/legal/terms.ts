export type LegalTermSlug = 'pagamento' | 'dados' | 'uso'

export type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export type LegalDocument = {
  slug: LegalTermSlug
  title: string
  shortTitle: string
  version: string
  effectiveDate: string
  intro: string
  sections: LegalSection[]
}

export const PAYMENT_TERMS_VERSION = '2026-09-07-v1'
export const DATA_TERMS_VERSION = '2026-09-07-v1'
export const PLATFORM_TERMS_VERSION = '2026-09-07-v1'
export const LEGAL_CONTACT_EMAIL = 'comercial@rpgcapital.com.br'

const paymentTerms: LegalDocument = {
  slug: 'pagamento',
  title: 'Termos de Pagamento e Cobrança',
  shortTitle: 'Termos de Pagamento',
  version: PAYMENT_TERMS_VERSION,
  effectiveDate: '7 de setembro de 2026',
  intro: 'Estes Termos regulam o preço, a autorização de cobrança recorrente e as condições de pagamento da assinatura RPG para Balcões (“Balcão”), oferecida pela RPG Capital (“RPG”). Ao marcar a caixa de aceite e prosseguir, o contratante confirma que leu e aceitou estas condições.',
  sections: [
    {
      title: '1. Plano e preço',
      paragraphs: [
        'O plano Balcão custa R$ 5,99 (cinco reais e noventa e nove centavos) por mês, salvo alteração futura comunicada de forma aplicável à contratação. A assinatura é destinada ao uso empresarial ou profissional da plataforma.',
        'O valor mensal não inclui tarifas, impostos, custos bancários, encargos ou preços cobrados por serviços de terceiros que não estejam expressamente incluídos na oferta do Balcão.',
      ],
    },
    {
      title: '2. Regra de cobrança no dia 1',
      paragraphs: [
        'A cobrança mensal tem como data-base o dia 1 de cada mês e não utiliza proporcionalidade diária.',
        'Se a configuração da assinatura ocorrer no próprio dia 1, a primeira cobrança é de R$ 5,99 nessa data e as cobranças seguintes permanecem mensais no dia 1.',
        'Se a configuração ocorrer depois do dia 1, não há cobrança imediata. No próximo dia 1 será cobrado R$ 11,98, correspondente ao mês de entrada e ao mês iniciado naquela data. A partir do dia 1 do mês seguinte, a cobrança recorrente será de R$ 5,99 por mês.',
      ],
    },
    {
      title: '3. Autorização de recorrência',
      paragraphs: [
        'Ao aceitar estes Termos, o contratante autoriza a RPG e seu prestador de pagamentos a realizar as cobranças descritas acima no meio de pagamento informado, inclusive cobranças recorrentes futuras enquanto a assinatura permanecer ativa.',
        'A autorização é vinculada à assinatura contratada e não autoriza débitos fora das condições vigentes do Balcão. Caso haja alteração material de preço ou da lógica de cobrança, a RPG observará os avisos e novos aceites que forem exigidos pela legislação aplicável.',
      ],
    },
    {
      title: '4. Processamento pelo Asaas',
      paragraphs: [
        'O processamento do cartão é realizado por prestador especializado, atualmente o Asaas. Os dados completos do cartão são transmitidos ao prestador para a operação de pagamento e não são armazenados no banco de dados operacional do Balcão. A RPG poderá armazenar identificadores técnicos, status, datas e referências necessárias para administrar a assinatura.',
        'A disponibilidade, aprovação, antifraude, liquidação e regras técnicas do meio de pagamento também dependem do prestador e das instituições participantes. A RPG não garante a aprovação de qualquer transação.',
      ],
    },
    {
      title: '5. Falha de pagamento e inadimplência',
      paragraphs: [
        'Se a cobrança for recusada, não paga, estornada ou contestada, a RPG poderá realizar novas tentativas permitidas pelo prestador, solicitar atualização do meio de pagamento, limitar recursos, suspender o acesso ou manter a conta em estado de inadimplência até a regularização.',
        'A suspensão por inadimplência não elimina valores validamente vencidos antes do cancelamento ou da regularização, observadas as normas imperativas aplicáveis.',
      ],
    },
    {
      title: '6. Cancelamento',
      paragraphs: [
        `Enquanto não houver um mecanismo de cancelamento diretamente na plataforma, o contratante poderá solicitar o cancelamento pelo e-mail ${LEGAL_CONTACT_EMAIL}. O cancelamento produzirá efeitos sobre cobranças futuras após o processamento da solicitação, sem prejuízo de valores já vencidos ou de direitos que não possam ser afastados por contrato.`,
        'A RPG poderá solicitar informações razoavelmente necessárias para verificar a identidade e a autoridade de quem pede o cancelamento e para evitar fraude ou encerramento indevido de conta empresarial.',
      ],
    },
    {
      title: '7. Estornos, contestação e fraude',
      paragraphs: [
        'O uso de contestação, chargeback, dados de pagamento de terceiro sem autorização, fraude ou tentativa de obter serviço sem pagamento poderá resultar em suspensão da conta e adoção das medidas cabíveis para preservação de direitos e recuperação de valores, respeitada a legislação aplicável.',
      ],
    },
    {
      title: '8. Alterações futuras',
      paragraphs: [
        'A RPG poderá alterar preço, meios de pagamento ou condições comerciais para ciclos futuros. Alterações materiais não terão efeito retroativo sobre cobranças já realizadas e serão tratadas de acordo com a legislação e com o mecanismo de comunicação disponível à conta.',
      ],
    },
    {
      title: '9. Limites legais',
      paragraphs: [
        'Nenhuma disposição destes Termos afasta direitos ou responsabilidades que, por lei, sejam irrenunciáveis. Se uma regra contratual não puder ser aplicada em determinada situação, as demais permanecem vigentes na máxima extensão permitida.',
      ],
    },
    {
      title: '10. Contato',
      paragraphs: [`Dúvidas, solicitações de cancelamento e assuntos de cobrança: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
}

const dataTerms: LegalDocument = {
  slug: 'dados',
  title: 'Termos de Tratamento e Uso de Dados',
  shortTitle: 'Termos de Dados',
  version: DATA_TERMS_VERSION,
  effectiveDate: '7 de setembro de 2026',
  intro: 'Estes Termos explicam como a RPG trata dados necessários à operação do RPG para Balcões e quais responsabilidades cabem à RPG e ao contratante. O tratamento observará a Lei nº 13.709/2018 (LGPD) e outras normas aplicáveis.',
  sections: [
    {
      title: '1. Papéis e alcance',
      paragraphs: [
        'A função jurídica da RPG depende da operação concreta. Para dados de cadastro da conta, autenticação, relacionamento comercial, cobrança, segurança, auditoria e administração da própria plataforma, a RPG poderá atuar como controladora. Quando processar dados pessoais inseridos pelo contratante para gerir sua própria atividade, a RPG poderá atuar como operadora em nome do contratante, conforme as instruções compatíveis com a plataforma.',
        'A denominação contratual não altera a realidade do tratamento: controlador é quem toma as decisões sobre finalidades e meios essenciais, e operador é quem trata dados em nome do controlador, conforme a LGPD.',
      ],
    },
    {
      title: '2. Dados que podem ser tratados',
      bullets: [
        'dados de conta e autenticação, como nome, e-mail, identificadores da Conta Google e registros de sessão;',
        'dados do negócio, como nome da loja, CPF/CNPJ, telefone, endereço e chave Pix;',
        'dados operacionais, como produtos, estoque, custos, preços, vendas, movimentações, fornecedores e registros de equipe;',
        'dados financeiros disponibilizados por integrações autorizadas, incluindo contas, saldos e transações obtidos por Open Finance ou prestadores equivalentes;',
        'dados necessários à cobrança, como identificação do titular, status da assinatura e referências do provedor de pagamentos; os dados completos do cartão são encaminhados ao prestador de pagamentos e não ficam armazenados no banco operacional do Balcão;',
        'dados técnicos e de segurança, como endereço IP, user-agent, horários, eventos de auditoria, identificadores de dispositivo, tentativas de acesso e registros necessários à prevenção de fraude, investigação de abuso e prova de aceite contratual;',
        'mensagens e informações fornecidas voluntariamente em atendimento ou suporte.',
      ],
    },
    {
      title: '3. Finalidades',
      bullets: [
        'criar, autenticar e administrar contas e permissões;',
        'executar inventário, vendas, checkout, Pix, gestão de equipe, relatórios e demais funções contratadas;',
        'processar assinatura, cobrança, prevenção a fraude e inadimplência;',
        'viabilizar conexões financeiras solicitadas pelo usuário e apresentar informações derivadas dos dados recebidos;',
        'prestar suporte, diagnosticar falhas e manter a segurança e integridade da plataforma;',
        'cumprir obrigações legais, regulatórias e ordens válidas de autoridades;',
        'constituir, exercer ou defender direitos em processos judiciais, administrativos ou arbitrais;',
        'melhorar a plataforma com métricas técnicas e, quando aplicável, dados agregados ou anonimizados que não identifiquem pessoa natural por meios razoáveis.',
      ],
      paragraphs: [
        'Conforme a operação, o tratamento poderá se apoiar em execução de contrato, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse, prevenção a fraude, consentimento quando efetivamente exigido ou outra base legal admitida pela LGPD. Este aceite contratual não transforma consentimento em base universal para todos os tratamentos.',
      ],
    },
    {
      title: '4. Responsabilidades do contratante sobre dados de terceiros',
      paragraphs: [
        'O contratante é responsável por possuir fundamento jurídico para coletar e inserir na plataforma dados de funcionários, clientes, fornecedores ou terceiros sob sua decisão, por prestar avisos quando necessários e por limitar a coleta ao que seja adequado ao uso empresarial do Balcão.',
        'O contratante não deve inserir dados pessoais sensíveis, segredos, senhas bancárias ou informações desnecessárias às funcionalidades contratadas, salvo quando uma função específica do Balcão expressamente exigir e estiver preparada para esse tratamento.',
        'Quando o contratante atuar como controlador, ele permanece responsável por decisões sobre finalidade, legalidade, atendimento aos titulares e conteúdo inserido, sem transferir à RPG obrigações que pertençam juridicamente ao próprio contratante.',
      ],
    },
    {
      title: '5. Open Finance e dados bancários',
      paragraphs: [
        'Conexões financeiras somente são iniciadas mediante ação do usuário no fluxo do prestador autorizado. A RPG não solicita que o usuário entregue sua senha bancária diretamente ao Balcão. A autenticação e a autorização perante a instituição financeira ocorrem nos ambientes e mecanismos definidos pelos participantes do ecossistema de Open Finance ou pelo prestador contratado.',
        'A RPG pode receber e armazenar os dados que o usuário autorizou o prestador a disponibilizar ao Balcão, pelo período necessário às funcionalidades contratadas, à segurança, à auditoria e às obrigações legais aplicáveis.',
      ],
    },
    {
      title: '6. Prestadores e compartilhamento necessário',
      paragraphs: [
        'A RPG poderá utilizar operadores, suboperadores e prestadores de infraestrutura indispensáveis ao serviço. Exemplos atuais ou possíveis incluem serviços de autenticação da Google, banco de dados e autenticação da Supabase, hospedagem e infraestrutura da Vercel, cobrança pelo Asaas e integração financeira por Malvo/Celcoin. A lista pode mudar conforme a evolução técnica da plataforma.',
        'A RPG não comercializa dados pessoais como base de dados. O compartilhamento ocorre quando necessário à prestação do serviço, segurança, cobrança, integração solicitada, cumprimento legal ou defesa de direitos, sempre sujeito às regras aplicáveis.',
      ],
    },
    {
      title: '7. Transferência e localização de processamento',
      paragraphs: [
        'Prestadores de tecnologia podem processar ou armazenar dados em diferentes localidades, inclusive fora do Brasil. Quando houver transferência internacional de dados pessoais sujeita à LGPD, a RPG adotará mecanismos admitidos pela legislação aplicável conforme a operação e o prestador utilizado.',
      ],
    },
    {
      title: '8. Segurança e ausência de garantia absoluta',
      paragraphs: [
        'A RPG adota medidas técnicas e administrativas compatíveis com o porte e a natureza do serviço, mas nenhum sistema conectado à internet é absolutamente invulnerável. A RPG não garante ausência total de incidentes, ataques, falhas de terceiros ou indisponibilidade, sem prejuízo das obrigações legais de segurança e resposta a incidentes que efetivamente se apliquem.',
        'O contratante deve proteger Conta Google, PINs, dispositivos, links de acesso e permissões de equipe, encerrar acessos de pessoas que deixem o negócio e comunicar uso suspeito assim que identificado.',
      ],
    },
    {
      title: '9. Retenção, exclusão e cópias técnicas',
      paragraphs: [
        'Os dados serão mantidos enquanto necessários à prestação do serviço e poderão ser conservados posteriormente para cumprimento de obrigações legais, prevenção a fraude, auditoria, segurança, exercício de direitos e demais hipóteses permitidas pela LGPD.',
        'A exclusão de dados ativos não implica eliminação instantânea de toda cópia técnica, log ou backup. Dados residuais podem permanecer por tempo tecnicamente necessário em cópias de segurança, sujeitos a controles de acesso e ao ciclo normal de retenção, sem retorno ao uso operacional salvo necessidade legítima de restauração, segurança ou obrigação legal.',
      ],
    },
    {
      title: '10. Direitos dos titulares',
      paragraphs: [
        `Titulares podem encaminhar solicitações relacionadas aos direitos previstos na LGPD para ${LEGAL_CONTACT_EMAIL}. A RPG poderá solicitar informações razoáveis para confirmar identidade, evitar fraude e determinar se a solicitação deve ser atendida pela RPG como controladora ou encaminhada ao contratante quando ele for o controlador da operação.`,
      ],
    },
    {
      title: '11. Evidência de aceite e segurança contratual',
      paragraphs: [
        'Para demonstrar a formação do contrato, prevenir fraude e exercer direitos, a RPG poderá registrar a versão aceita, usuário, negócio, data e hora, endereço IP, user-agent e demais metadados técnicos estritamente relacionados ao evento de aceite.',
      ],
    },
    {
      title: '12. Contato',
      paragraphs: [`Assuntos de privacidade, dados e exercício de direitos: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
}

const platformTerms: LegalDocument = {
  slug: 'uso',
  title: 'Termos de Uso da Plataforma',
  shortTitle: 'Termos de Uso',
  version: PLATFORM_TERMS_VERSION,
  effectiveDate: '7 de setembro de 2026',
  intro: 'Estes Termos regulam o acesso e o uso empresarial do RPG para Balcões (“Balcão”), software da RPG Capital (“RPG”). Ao aceitar estes Termos, o contratante declara possuir capacidade e autorização para vincular o negócio informado à contratação.',
  sections: [
    {
      title: '1. Natureza do serviço',
      paragraphs: [
        'O Balcão é uma ferramenta de apoio à gestão de pequenos negócios, com recursos que podem incluir inventário, cadastro de produtos, vendas, checkout, Pix, relatórios, gestão de equipe, cobrança da assinatura e integrações financeiras.',
        'O Balcão não é instituição financeira, banco, contador, escritório jurídico, auditor, consultor tributário ou garantidor de resultados comerciais. Relatórios, classificações, saldos importados, margens, conciliações, alertas e demais informações da plataforma servem como apoio operacional e devem ser conferidos pelo contratante antes de decisões relevantes.',
      ],
    },
    {
      title: '2. Conta, autoridade e credenciais',
      paragraphs: [
        'O contratante responde pela veracidade das informações fornecidas, pela autoridade de quem cria e administra a conta, pela segurança da Conta Google associada, PINs, links de acesso, dispositivos e permissões concedidas à equipe.',
        'Atos realizados por credenciais válidas poderão ser tratados como originados do respectivo usuário até que a RPG seja informada de comprometimento ou tenha motivo razoável para bloquear o acesso. O compartilhamento indevido de credenciais é de responsabilidade de quem o realiza, sem prejuízo das medidas de segurança que cabem à RPG.',
      ],
    },
    {
      title: '3. Licença de uso',
      paragraphs: [
        'Enquanto a assinatura estiver válida e o contratante cumprir estes Termos, a RPG concede licença limitada, revogável, não exclusiva, intransferível e destinada ao uso interno do negócio para acessar as funcionalidades disponibilizadas no plano contratado.',
        'Nenhuma disposição transfere ao contratante propriedade sobre código-fonte, marcas, interfaces, modelos, documentação, banco de dados estrutural, componentes ou demais direitos da RPG ou de terceiros.',
      ],
    },
    {
      title: '4. Uso proibido',
      bullets: [
        'explorar vulnerabilidades, contornar autenticação, limites, permissões, cobrança ou controles de segurança;',
        'realizar ataque, DDoS, varredura abusiva, automação maliciosa, scraping não autorizado, fraude ou tentativa de acesso a dados de outra conta;',
        'usar a plataforma para atividade ilícita ou inserir conteúdo que viole direitos de terceiros;',
        'revender, sublicenciar, copiar, desmontar ou realizar engenharia reversa além do que a lei obrigatoriamente permita;',
        'usar credenciais, cartões, contas bancárias ou dados pessoais sem autorização adequada;',
        'interferir intencionalmente no funcionamento do serviço ou de prestadores conectados.',
      ],
    },
    {
      title: '5. Dados e registros do negócio',
      paragraphs: [
        'O contratante é responsável por conferir preços, estoque, custos, chaves Pix, dados fiscais, informações de fornecedores e demais registros que utiliza para operar seu negócio. A RPG não assume responsabilidade por prejuízo decorrente de informação incorreta inserida, importada ou mantida sem conferência pelo usuário quando a inconsistência não decorrer de violação imputável à própria RPG.',
        'A plataforma não deve ser utilizada como única fonte de registros cuja perda possa causar dano crítico ou irreversível. O contratante deve manter cópia, exportação, backup ou registros independentes quando a continuidade do seu negócio exigir recuperação garantida, obrigação fiscal, contábil ou documental específica.',
      ],
    },
    {
      title: '6. Disponibilidade, manutenção e alterações',
      paragraphs: [
        'A RPG busca manter o Balcão disponível, porém não garante funcionamento ininterrupto, ausência de falhas ou disponibilidade de 100%. O serviço pode sofrer manutenção, atualização, degradação, indisponibilidade, perda temporária de conectividade ou interrupções causadas pela própria infraestrutura, internet, energia, equipamentos do usuário, força maior, ataque cibernético ou serviços de terceiros.',
        'A RPG poderá modificar, substituir ou descontinuar funcionalidades para segurança, evolução técnica, adequação legal ou viabilidade do produto. Quando a alteração material afetar obrigação contratual essencial já paga, serão observados os direitos obrigatórios aplicáveis.',
      ],
    },
    {
      title: '7. Serviços de terceiros',
      paragraphs: [
        'O Balcão depende de serviços de terceiros para partes da operação, como hospedagem, autenticação, banco de dados, pagamento, Open Finance, comunicação e fontes externas de catálogo. A RPG não controla integralmente a disponibilidade, políticas, recusas, mudanças de API, erros ou encerramento desses serviços.',
        'A indisponibilidade ou alteração de um terceiro pode exigir adaptação, substituição ou suspensão temporária de uma funcionalidade. A RPG não assume garantia independente sobre serviços que não controla, sem prejuízo da responsabilidade que a lei eventualmente atribua à RPG por seus próprios atos ou escolhas.',
      ],
    },
    {
      title: '8. Segurança',
      paragraphs: [
        'A RPG pode bloquear sessões, rotas, dispositivos, IPs, contas ou operações quando houver indício razoável de fraude, comprometimento, abuso, ataque, violação destes Termos ou risco à plataforma ou a terceiros. Medidas preventivas podem gerar indisponibilidade temporária para o próprio contratante.',
        'Nenhum sistema é absolutamente seguro. A RPG não promete impossibilidade de invasão, vazamento ou perda, mas permanece sujeita às obrigações de segurança e responsabilidade que não possam ser afastadas pela legislação aplicável.',
      ],
    },
    {
      title: '9. Suspensão e encerramento',
      paragraphs: [
        'A RPG poderá suspender ou encerrar acesso por inadimplência, fraude, uso proibido, risco de segurança, ordem de autoridade, violação material destes Termos ou necessidade de proteger a plataforma e outros usuários. Sempre que razoavelmente possível e compatível com a urgência do caso, poderão ser fornecidas informações sobre a medida.',
        'A eventual descontinuação comercial da plataforma não cria obrigação de manter o serviço indefinidamente. Quando juridicamente exigível e tecnicamente possível, a RPG adotará medidas razoáveis de transição ou disponibilização de dados antes do encerramento definitivo, sem assumir obrigação de operação perpétua.',
      ],
    },
    {
      title: '10. Limitação de responsabilidade',
      paragraphs: [
        'Na máxima extensão permitida pela legislação aplicável, a RPG não responderá por danos indiretos, consequenciais, especiais ou punitivos, lucros cessantes, perda de receita, perda de oportunidade, paralisação do negócio, dano reputacional ou perda de dados que poderia ter sido evitada mediante cópia ou backup razoavelmente exigível do contratante, quando tais danos não decorrerem de responsabilidade que a lei proíba excluir ou limitar.',
        'Quando juridicamente válida a limitação e inexistir regra imperativa em sentido contrário, a responsabilidade agregada da RPG por danos diretos decorrentes do contrato ficará limitada ao total efetivamente pago pelo contratante à RPG nos 12 meses anteriores ao evento que originou a reclamação.',
        'As limitações deste item não pretendem excluir responsabilidade por dolo, fraude da própria RPG ou outras hipóteses em que a legislação aplicável proíba exclusão ou limitação. Se determinada limitação for inválida em uma situação concreta, ela será reduzida ao máximo permitido sem invalidar automaticamente as demais cláusulas.',
      ],
    },
    {
      title: '11. Responsabilidade do contratante perante terceiros',
      paragraphs: [
        'Na medida em que uma reclamação, prejuízo, sanção ou custo decorra de ato ou omissão imputável ao contratante, como uso ilícito, ausência de autorização para dados inseridos, violação de direitos de terceiros ou fraude praticada por sua equipe, o contratante será responsável pelas consequências que juridicamente lhe couberem e deverá cooperar para evitar que a RPG suporte obrigação causada exclusivamente por sua conduta.',
      ],
    },
    {
      title: '12. Ausência de garantias não expressas',
      paragraphs: [
        'Fora das garantias que a legislação torne obrigatórias e das obrigações expressamente assumidas nestes Termos, o Balcão é fornecido conforme as funcionalidades disponibilizadas no momento. A RPG não garante aumento de vendas, redução de perdas, aprovação de crédito, precisão absoluta de dados de terceiros, continuidade de integração externa ou adequação a obrigação contábil, fiscal ou regulatória específica de cada negócio.',
      ],
    },
    {
      title: '13. Alterações dos Termos',
      paragraphs: [
        'A RPG poderá atualizar estes Termos para refletir mudanças legais, técnicas ou comerciais. Alterações materiais serão aplicadas prospectivamente e, quando exigido, dependerão de novo aceite. O sistema poderá exigir aceite da nova versão antes da continuidade do uso de funcionalidades relevantes.',
      ],
    },
    {
      title: '14. Solução de conflitos e lei aplicável',
      paragraphs: [
        `Estes Termos são regidos pelas leis da República Federativa do Brasil. Sempre que juridicamente possível e sem impedir tutela urgente ou direito indisponível, as partes buscarão primeiro uma solução de boa-fé pelo canal ${LEGAL_CONTACT_EMAIL}. O foro competente será determinado pelas normas legais aplicáveis ao caso concreto.`,
      ],
    },
    {
      title: '15. Contato',
      paragraphs: [`Dúvidas contratuais, comunicações e notificações para a RPG: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
}

const DOCUMENTS: Record<LegalTermSlug, LegalDocument> = {
  pagamento: paymentTerms,
  dados: dataTerms,
  uso: platformTerms,
}

export const LEGAL_DOCUMENTS = Object.values(DOCUMENTS)

export function getLegalDocument(slug: string): LegalDocument | null {
  return DOCUMENTS[slug as LegalTermSlug] ?? null
}
