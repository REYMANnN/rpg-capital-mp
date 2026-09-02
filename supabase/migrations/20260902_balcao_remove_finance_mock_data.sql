-- Remove only Financeiro demo rows. Operational inventory/sales data is preserved.

delete from public.balcao_finance_transactions
where source = 'mock';

delete from public.balcao_finance_accounts
where source = 'mock';

delete from public.balcao_finance_daily_metrics
where source = 'mock';
