-- ============ 002: الدفع كاش ============
alter table public.orders add column if not exists payment_method text not null default 'online';
alter table public.orders add column if not exists notified_at timestamptz;
alter table public.orders add column if not exists cash_collected_at timestamptz;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('online','cash'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('pending','paid','failed','test','cash_pending','cash_collected'));
alter table public.orders drop constraint if exists payment_method_status_match;
alter table public.orders add constraint payment_method_status_match check (
  (payment_method = 'online' and payment_status in ('pending','paid','failed','test')) or
  (payment_method = 'cash'   and payment_status in ('cash_pending','cash_collected')));

-- العميل: أونلاين = pending، كاش = cash_pending فقط
drop policy if exists "anon insert pending orders" on public.orders;
create policy "anon insert pending orders" on public.orders
  for insert to anon
  with check (status = 'new' and moyasar_payment_id is null and paid_at is null
              and notified_at is null and cash_collected_at is null
              and ((payment_method = 'online' and payment_status = 'pending')
                or (payment_method = 'cash' and payment_status = 'cash_pending')));

-- الأدمن: يقدر يغيّر payment_status فقط من cash_pending إلى cash_collected (والعكس للتصحيح)
grant update (status, notes, payment_status) on public.orders to authenticated;
create or replace function public.guard_admin_payment() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and new.payment_status is distinct from old.payment_status then
    if not (old.payment_method = 'cash' and old.payment_status in ('cash_pending','cash_collected')
            and new.payment_status in ('cash_pending','cash_collected')) then
      raise exception 'only cash orders can be marked collected';
    end if;
    new.cash_collected_at := case when new.payment_status = 'cash_collected' then now() else null end;
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_payment on public.orders;
create trigger orders_guard_payment before update on public.orders
  for each row execute function public.guard_admin_payment();
