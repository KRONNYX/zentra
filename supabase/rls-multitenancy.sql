-- ZentraOps full-ledger schema and RLS policies.
-- Run this in the Supabase SQL Editor after reviewing existing production data.

create extension if not exists "pgcrypto";

create table if not exists public.bars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  bar_id uuid references public.bars(id) on delete set null,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists public.bar_memberships (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (bar_id, user_id)
);

create table if not exists public.bar_staff (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  name text not null,
  email text,
  staff_code text,
  role text not null default 'Staff',
  phone text,
  is_active boolean not null default true,
  permissions text[] not null default array['close_day']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.get_current_bar_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select bar_id
  from (
    select memberships.bar_id, 1 as priority
    from public.bar_memberships memberships
    where memberships.user_id = auth.uid()

    union all

    select app_users.bar_id, 2 as priority
    from public.users app_users
    where app_users.id = auth.uid()

    union all

    select app_users.bar_id, 3 as priority
    from public.users app_users
    where app_users.email = auth.jwt() ->> 'email'
  ) linked_bars
  order by priority
  limit 1
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  name text not null,
  category text,
  unit text,
  cost_price numeric(12, 2) not null default 0,
  selling_price numeric(12, 2) not null default 0,
  minimum_stock_level numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  barcode text,
  brand text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  opening_stock numeric(12, 2) not null default 0,
  current_stock numeric(12, 2) not null default 0,
  quantity numeric(12, 2) not null default 0,
  reorder_level numeric(12, 2) not null default 0,
  purchase_price numeric(12, 2) not null default 0,
  selling_price numeric(12, 2) not null default 0,
  last_counted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  total_amount numeric(12, 2) not null default 0,
  mpesa_amount numeric(12, 2) not null default 0,
  cash_amount numeric(12, 2) not null default 0,
  payment_method text not null default 'other' check (payment_method in ('cash', 'mpesa', 'card', 'other')),
  sale_date date not null default current_date,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  inventory_id uuid references public.inventory(id) on delete set null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_sales (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  business_date date not null default current_date,
  revenue_total numeric(12, 2) not null default 0,
  mpesa_total numeric(12, 2) not null default 0,
  cash_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (bar_id, business_date)
);

create table if not exists public.product_sales (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  business_date date not null default current_date,
  product_name text not null,
  units_sold integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_product_closures (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  business_date date not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  opening_stock numeric(12, 2) not null default 0,
  purchased_stock numeric(12, 2) not null default 0,
  closing_stock numeric(12, 2) not null default 0,
  units_sold numeric(12, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  business_date date not null,
  billing_month date not null default date_trunc('month', current_date)::date,
  customer_name text not null,
  staff_name text not null,
  staff_id uuid references public.bar_staff(id) on delete set null,
  amount numeric(12, 2) not null default 0,
  notes text,
  status text not null default 'unpaid' check (status in ('unpaid', 'settled')),
  settled_at timestamptz,
  settled_business_date date,
  settled_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  business_date date not null,
  expense_type text not null,
  description text,
  amount numeric(12, 2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.close_day_settings (
  bar_id uuid primary key references public.bars(id) on delete cascade,
  show_top_product boolean not null default false,
  show_bills boolean not null default true,
  show_daily_expenses boolean not null default true,
  show_ledger_photo boolean not null default true,
  expense_options text[] not null default array['Lunch', 'Transport', 'Restock', 'Cleaning', 'Repairs']::text[],
  updated_at timestamptz not null default now()
);

create table if not exists public.close_day_submissions (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  business_date date not null,
  cash_sales numeric(12, 2) not null default 0,
  mpesa_sales numeric(12, 2) not null default 0,
  notes text,
  ledger_photo_path text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (bar_id, business_date)
);

create table if not exists public.bar_alerts (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  inventory_id uuid references public.inventory(id) on delete set null,
  product_name text,
  movement_type text not null check (movement_type in ('sale', 'restock', 'loss', 'wastage', 'shrinkage', 'adjustment')),
  quantity_change numeric(12, 2) not null default 0,
  quantity numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  amount numeric(12, 2) not null default 0,
  status text not null default 'completed',
  transaction_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_insights (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  insight_type text not null,
  insight_text text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  staff_name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Existing database compatibility migrations.
-- CREATE TABLE IF NOT EXISTS does not add columns to existing tables, so keep
-- these ALTER statements when applying this file to an existing Supabase DB.
alter table public.products
add column if not exists category text,
add column if not exists unit text,
add column if not exists cost_price numeric(12, 2) not null default 0,
add column if not exists selling_price numeric(12, 2) not null default 0,
add column if not exists minimum_stock_level numeric(12, 2) not null default 0,
add column if not exists is_active boolean not null default true,
add column if not exists barcode text,
add column if not exists brand text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'purchase_price'
  ) then
    execute 'update public.products set cost_price = coalesce(cost_price, purchase_price, 0) where cost_price = 0';
  end if;
end $$;

alter table public.inventory
add column if not exists product_id uuid references public.products(id) on delete set null,
add column if not exists name text not null default 'Inventory item',
add column if not exists opening_stock numeric(12, 2) not null default 0,
add column if not exists current_stock numeric(12, 2) not null default 0,
add column if not exists quantity numeric(12, 2) not null default 0,
add column if not exists reorder_level numeric(12, 2) not null default 0,
add column if not exists purchase_price numeric(12, 2) not null default 0,
add column if not exists selling_price numeric(12, 2) not null default 0,
add column if not exists last_counted_at timestamptz,
add column if not exists updated_at timestamptz not null default now();

alter table public.bar_staff
add column if not exists name text not null default 'Unnamed staff',
add column if not exists email text,
add column if not exists staff_code text,
add column if not exists role text not null default 'Staff',
add column if not exists phone text,
add column if not exists is_active boolean not null default true,
add column if not exists permissions text[] not null default array['close_day']::text[],
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table public.bars
add column if not exists address text,
add column if not exists phone text,
add column if not exists email text,
add column if not exists image_url text;

alter table public.sales
add column if not exists mpesa_amount numeric(12, 2) not null default 0,
add column if not exists cash_amount numeric(12, 2) not null default 0,
add column if not exists sale_date date not null default current_date,
add column if not exists sold_at timestamptz not null default now();

alter table public.sale_items
add column if not exists product_id uuid references public.products(id) on delete set null,
add column if not exists inventory_id uuid references public.inventory(id) on delete set null,
add column if not exists unit_price numeric(12, 2) not null default 0;

alter table public.inventory_movements
add column if not exists product_name text,
add column if not exists quantity_change numeric(12, 2) not null default 0,
add column if not exists quantity numeric(12, 2) not null default 0;

alter table public.daily_sales
add column if not exists business_date date not null default current_date,
add column if not exists revenue_total numeric(12, 2) not null default 0,
add column if not exists mpesa_total numeric(12, 2) not null default 0,
add column if not exists cash_total numeric(12, 2) not null default 0;

alter table public.product_sales
add column if not exists business_date date not null default current_date,
add column if not exists product_name text not null default 'Unnamed product',
add column if not exists units_sold integer not null default 0;

alter table public.daily_product_closures
add column if not exists business_date date not null default current_date,
add column if not exists product_id uuid references public.products(id) on delete set null,
add column if not exists product_name text,
add column if not exists opening_stock numeric(12, 2) not null default 0,
add column if not exists purchased_stock numeric(12, 2) not null default 0,
add column if not exists closing_stock numeric(12, 2) not null default 0,
add column if not exists units_sold numeric(12, 2) not null default 0,
add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.customer_credits
add column if not exists business_date date not null default current_date,
add column if not exists billing_month date,
add column if not exists customer_name text not null default 'Unknown customer',
add column if not exists staff_name text not null default 'Unknown staff',
add column if not exists staff_id uuid references public.bar_staff(id) on delete set null,
add column if not exists amount numeric(12, 2) not null default 0,
add column if not exists notes text,
add column if not exists status text not null default 'unpaid',
add column if not exists settled_at timestamptz,
add column if not exists settled_business_date date,
add column if not exists settled_by uuid references auth.users(id) on delete set null,
add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.customer_credits
set billing_month = date_trunc('month', business_date)::date
where billing_month is null;

alter table public.customer_credits
alter column billing_month set default date_trunc('month', current_date)::date;

alter table public.expenses
add column if not exists business_date date not null default current_date,
add column if not exists expense_type text not null default 'Other',
add column if not exists description text,
add column if not exists amount numeric(12, 2) not null default 0,
add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.close_day_submissions
add column if not exists business_date date not null default current_date,
add column if not exists cash_sales numeric(12, 2) not null default 0,
add column if not exists mpesa_sales numeric(12, 2) not null default 0,
add column if not exists notes text,
add column if not exists ledger_photo_path text,
add column if not exists submitted_by uuid references auth.users(id) on delete restrict,
add column if not exists submitted_at timestamptz not null default now();

update public.inventory inventory_item
set name = coalesce(product.name, inventory_item.name, 'Inventory item')
from public.products product
where inventory_item.product_id = product.id
  and (inventory_item.name is null or inventory_item.name = 'Inventory item');

insert into storage.buckets (id, name, public)
values ('ledger-proofs', 'ledger-proofs', false)
on conflict (id) do nothing;

create index if not exists idx_daily_sales_bar_date on public.daily_sales (bar_id, business_date);
create index if not exists idx_products_bar_name on public.products (bar_id, name);
create index if not exists idx_inventory_bar_product on public.inventory (bar_id, product_id);
create index if not exists idx_bar_staff_bar_active on public.bar_staff (bar_id, is_active);
create index if not exists idx_product_sales_bar_date on public.product_sales (bar_id, business_date);
create index if not exists idx_daily_product_closures_bar_date on public.daily_product_closures (bar_id, business_date);
create index if not exists idx_customer_credits_bar_date on public.customer_credits (bar_id, business_date);
create index if not exists idx_customer_credits_bar_status on public.customer_credits (bar_id, status);
create index if not exists idx_customer_credits_bar_month_status on public.customer_credits (bar_id, billing_month, status);
create index if not exists idx_customer_credits_bar_settled_date on public.customer_credits (bar_id, settled_business_date);
create index if not exists idx_expenses_bar_date on public.expenses (bar_id, business_date);
create index if not exists idx_close_day_submissions_bar_date on public.close_day_submissions (bar_id, business_date);
create index if not exists idx_bar_alerts_bar_created on public.bar_alerts (bar_id, created_at);
create index if not exists idx_inventory_movements_bar_created on public.inventory_movements (bar_id, created_at);
create index if not exists idx_mpesa_transactions_bar_created on public.mpesa_transactions (bar_id, created_at);

alter table public.bars enable row level security;
alter table public.users enable row level security;
alter table public.bar_memberships enable row level security;
alter table public.bar_staff enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.daily_sales enable row level security;
alter table public.product_sales enable row level security;
alter table public.daily_product_closures enable row level security;
alter table public.customer_credits enable row level security;
alter table public.expenses enable row level security;
alter table public.close_day_settings enable row level security;
alter table public.close_day_submissions enable row level security;
alter table public.bar_alerts enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.intelligence_insights enable row level security;
alter table public.audit_logs enable row level security;
alter table public.shifts enable row level security;

alter table public.shifts
add column if not exists staff_id uuid references public.bar_staff(id) on delete set null,
add column if not exists role text,
add column if not exists notes text;

drop policy if exists "Members can read their bars" on public.bars;
create policy "Members can read their bars" on public.bars
for select to authenticated
using (id = public.get_current_bar_id());

drop policy if exists "Members can update their bars" on public.bars;
create policy "Members can update their bars" on public.bars
for update to authenticated
using (id = public.get_current_bar_id())
with check (id = public.get_current_bar_id());

drop policy if exists "Users can read their own user row" on public.users;
create policy "Users can read their own user row" on public.users
for select to authenticated
using (id = auth.uid() or bar_id = public.get_current_bar_id());

drop policy if exists "Users can read their own memberships" on public.bar_memberships;
create policy "Users can read their own memberships" on public.bar_memberships
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Members can manage staff for their bars" on public.bar_staff;
create policy "Members can manage staff for their bars" on public.bar_staff
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage close day settings for their bars" on public.close_day_settings;
create policy "Members can manage close day settings for their bars" on public.close_day_settings
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage close day submissions for their bars" on public.close_day_submissions;
drop policy if exists "Members can read close day submissions for their bars" on public.close_day_submissions;
create policy "Members can read close day submissions for their bars" on public.close_day_submissions
for select to authenticated
using (bar_id = public.get_current_bar_id());

drop policy if exists "Members can insert close day submissions for their bars" on public.close_day_submissions;
create policy "Members can insert close day submissions for their bars" on public.close_day_submissions
for insert to authenticated
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage daily sales for their bars" on public.daily_sales;
create policy "Members can manage daily sales for their bars" on public.daily_sales
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage product sales for their bars" on public.product_sales;
create policy "Members can manage product sales for their bars" on public.product_sales
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage ledger rows for their bars" on public.daily_product_closures;
create policy "Members can manage ledger rows for their bars" on public.daily_product_closures
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage credits for their bars" on public.customer_credits;
create policy "Members can manage credits for their bars" on public.customer_credits
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage expenses for their bars" on public.expenses;
create policy "Members can manage expenses for their bars" on public.expenses
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage alerts for their bars" on public.bar_alerts;
create policy "Members can manage alerts for their bars" on public.bar_alerts
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can read products for their bars" on public.products;
drop policy if exists "Members can manage products for their bars" on public.products;
create policy "Members can manage products for their bars" on public.products
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can read inventory for their bars" on public.inventory;
drop policy if exists "Members can update inventory for their bars" on public.inventory;
drop policy if exists "Members can manage inventory for their bars" on public.inventory;
create policy "Members can manage inventory for their bars" on public.inventory
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can read sales for their bars" on public.sales;
create policy "Members can read sales for their bars" on public.sales
for select to authenticated
using (bar_id = public.get_current_bar_id());

drop policy if exists "Members can read sale items for their bars" on public.sale_items;
create policy "Members can read sale items for their bars" on public.sale_items
for select to authenticated
using (
  exists (
    select 1 from public.sales sale
    where sale.id = sale_items.sale_id
      and sale.bar_id = public.get_current_bar_id()
  )
);

drop policy if exists "Members can read inventory movements for their bars" on public.inventory_movements;
drop policy if exists "Members can manage inventory movements for their bars" on public.inventory_movements;
create policy "Members can manage inventory movements for their bars" on public.inventory_movements
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can read mpesa transactions for their bars" on public.mpesa_transactions;
create policy "Members can read mpesa transactions for their bars" on public.mpesa_transactions
for select to authenticated
using (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage insights for their bars" on public.intelligence_insights;
create policy "Members can manage insights for their bars" on public.intelligence_insights
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can manage audit logs for their bars" on public.audit_logs;
drop policy if exists "Members can read audit logs for their bars" on public.audit_logs;
create policy "Members can read audit logs for their bars" on public.audit_logs
for select to authenticated
using (bar_id = public.get_current_bar_id());

drop policy if exists "Members can insert audit logs for their bars" on public.audit_logs;
create policy "Members can insert audit logs for their bars" on public.audit_logs
for insert to authenticated
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Users can manage their bar staff shifts" on public.shifts;
create policy "Users can manage their bar staff shifts" on public.shifts
for all to authenticated
using (bar_id = public.get_current_bar_id())
with check (bar_id = public.get_current_bar_id());

drop policy if exists "Members can upload ledger proofs for their bars" on storage.objects;
create policy "Members can upload ledger proofs for their bars" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ledger-proofs'
  and (storage.foldername(name))[1] = public.get_current_bar_id()::text
);

drop policy if exists "Members can read ledger proofs for their bars" on storage.objects;
create policy "Members can read ledger proofs for their bars" on storage.objects
for select to authenticated
using (
  bucket_id = 'ledger-proofs'
  and (storage.foldername(name))[1] = public.get_current_bar_id()::text
);
