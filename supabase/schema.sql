-- ============ Vanilla Bee: جدول الطلبات ============
-- شغّل هذا الملف كاملاً في Supabase > SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            text not null unique,
  created_at          timestamptz not null default now(),
  customer_name       text not null check (char_length(customer_name) between 2 and 80),
  phone               text not null check (phone ~ '^(05[0-9]{8}|\+?9665[0-9]{8})$'),
  type                text not null check (type in ('delivery','pickup')),
  district            text,
  address             text,
  map_link            text,
  branch              text,
  pickup_time         text,
  items               jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  subtotal            numeric(10,2) not null check (subtotal >= 0),
  delivery_fee        numeric(10,2) not null default 0 check (delivery_fee >= 0),
  total               numeric(10,2) not null check (total > 0),
  payment_status      text not null default 'pending'
                      check (payment_status in ('pending','paid','failed','test')),
  moyasar_payment_id  text unique,
  paid_at             timestamptz,
  status              text not null default 'new'
                      check (status in ('new','preparing','ready','out_for_delivery','done','cancelled')),
  notes               text,
  updated_at          timestamptz not null default now(),
  constraint delivery_needs_address check (type <> 'delivery' or (district is not null and address is not null)),
  constraint total_matches check (total = subtotal + delivery_fee)
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- تحديث updated_at تلقائياً
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ============ أصحاب المتجر (من يحق له رؤية الطلبات) ============
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ============ RLS ============
alter table public.orders enable row level security;

-- العميل (anon): إدخال فقط، وبحالة "جديد/غير مدفوع" فقط. لا يقدر يقرأ أو يعدّل.
drop policy if exists "anon insert pending orders" on public.orders;
create policy "anon insert pending orders" on public.orders
  for insert to anon
  with check (payment_status = 'pending' and status = 'new'
              and moyasar_payment_id is null and paid_at is null);

-- صاحب المتجر (مستخدم مسجل ومضاف في جدول admins): قراءة وتعديل
drop policy if exists "admin select" on public.orders;
create policy "admin select" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "admin update" on public.orders;
create policy "admin update" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- صلاحيات الأعمدة: anon يدخل فقط، والأدمن يعدّل الحالة والملاحظات فقط
revoke all on public.orders from anon, authenticated;
grant insert on public.orders to anon;
grant select on public.orders to authenticated;
grant update (status, notes) on public.orders to authenticated;

-- ============ Realtime لصفحة الإدارة ============
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
alter table public.orders replica identity full;

-- ============ بعد إنشاء حساب صاحب المتجر من Authentication > Users ============
-- insert into public.admins (user_id) select id from auth.users where email = 'YOUR_EMAIL@example.com';
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
-- ============ 004: رمز الطلب تلقائي (يحمي من نسخ JS قديمة في كاش المتصفح) ============
alter table public.orders alter column access_token set default encode(extensions.gen_random_bytes(24), 'hex');
