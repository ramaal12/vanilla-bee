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
