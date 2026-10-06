-- Internal trigger helper: it must not be directly callable through the Data API.
revoke execute on function public.guard_balcao_business_phone() from public;
revoke execute on function public.guard_balcao_business_phone() from anon;
revoke execute on function public.guard_balcao_business_phone() from authenticated;
