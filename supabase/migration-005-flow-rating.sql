-- ============ 005: مراحل الطلب + التقييم ============
alter table public.orders add column if not exists rating smallint check (rating between 1 and 5);
alter table public.orders add column if not exists rating_comment text check (char_length(rating_comment) <= 500);
alter table public.orders add column if not exists rated_at timestamptz;

-- الانتقالات المسموحة فقط (للأدمن ولدوال السيرفر)
create or replace function public.valid_transition(t text, s_old text, s_new text) returns boolean
language sql immutable as $$
  select s_old = s_new or case s_old
    when 'pending_approval' then s_new in ('preparing','cancelled')
    when 'new'              then s_new in ('preparing','cancelled')
    when 'preparing'        then s_new in ('ready','cancelled')
    when 'ready'            then (t = 'delivery' and s_new in ('out_for_delivery','cancelled'))
                              or (t = 'pickup'   and s_new in ('done','cancelled'))
    when 'out_for_delivery' then t = 'delivery' and s_new = 'done'
    else false end;
$$;
create or replace function public.guard_status() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','service_role') and new.status is distinct from old.status
     and not public.valid_transition(old.type, old.status, new.status) then
    raise exception 'invalid status transition % -> %', old.status, new.status;
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_status on public.orders;
create trigger orders_guard_status before update on public.orders
  for each row execute function public.guard_status();

-- متوسط التقييم للأدمن
create or replace view public.rating_summary with (security_invoker = on) as
  select round(avg(rating)::numeric, 2) as avg_rating, count(rating) as ratings from public.orders where rating is not null;
grant select on public.rating_summary to authenticated;
