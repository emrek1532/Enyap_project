-- Haftalık özet bildirimini yalnız zamanlanmış görev (cron, postgres rolü) çağırır: API'den çağrılamasın
revoke execute on function public.send_weekly_summary() from public, anon, authenticated;
-- Fiyat listesi eşleştirme fonksiyonları yalnız giriş yapmış kullanıcılar için (içlerinde ayrıca yetki kontrolü var)
revoke execute on function public.supplier_learn(bigint) from public, anon;
revoke execute on function public.supplier_ai_apply(jsonb) from public, anon;
revoke execute on function public.supplier_ai_batch(text, integer) from public, anon;
grant execute on function public.supplier_learn(bigint) to authenticated;
grant execute on function public.supplier_ai_apply(jsonb) to authenticated;
grant execute on function public.supplier_ai_batch(text, integer) to authenticated;
