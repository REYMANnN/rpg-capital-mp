-- Detalhes brutos da movimentação (loja, pagador/recebedor, cartão) vindos do open finance.
alter table public.balcao_finance_transactions add column if not exists details jsonb not null default '{}'::jsonb;

-- Contraparte do histórico de Pix a partir da descrição ("Pix enviado para X", MEI "00.000.000 NOME").
update public.balcao_finance_transactions
set counterparty_name = initcap(lower(trim(regexp_replace(
      regexp_replace(description, '^(devol recebida pix de|pix enviado para|pix recebido( c[0-9])?( de)?)\s+', '', 'i'),
      '^[0-9]{2}\.[0-9]{3}\.[0-9]{3}\s+', ''))))
where (counterparty_name is null or counterparty_name = '')
  and transaction_type = 'PIX'
  and description !~* '^\s*(pix recebido( c[0-9])?|pix enviado|transf enviada pix)\s*$';
