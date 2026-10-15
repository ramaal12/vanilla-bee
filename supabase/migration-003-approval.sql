-- ============ 003: قبول/رفض الطلبات ============
alter table public.orders add column if not exists reject_reason text check (char_length(reject_reason) <= 300);
alter table public.orders add column if not exists access_token text;
alter table public.orders add column if not exists telegram_message_id bigint;
alter table public.orders add column if not exists decided_at timestamptz;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending_approval','new','preparing','ready','out_for_delivery','done','cancelled'));
alter table public.orders alter column status set default 'pending_approval';

drop policy if exists "anon insert pending orders" on public.orders;
create policy "anon insert pending orders" on public.orders
  for insert to anon
  with check (status = 'pending_approval'
              and access_token ~ '^[0-9a-f]{32,64}$'
              and moyasar_payment_id is null and paid_at is null and notified_at is null
              and cash_collected_at is null and reject_reason is null
              and telegram_message_id is null and decided_at is null
              and ((payment_method = 'online' and payment_status = 'pending')
                or (payment_method = 'cash' and payment_status = 'cash_pending')));

grant update (status, notes, payment_status, reject_reason) on public.orders to authenticated;

-- وقت القرار يُسجَّل تلقائياً عند الخروج من "بانتظار الموافقة"
create or replace function public.stamp_decision() returns trigger language plpgsql as $$
begin
  if old.status = 'pending_approval' and new.status <> 'pending_approval' then new.decided_at := now(); end if;
  if new.status <> 'cancelled' then new.reject_reason := null; end if;
  return new;
end $$;
drop trigger if exists orders_stamp_decision on public.orders;
create trigger orders_stamp_decision before update on public.orders
  for each row execute function public.stamp_decision();
