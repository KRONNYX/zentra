-- Zentra MVP phase 1: POS sales, tabs and blind Close Day.
-- Captures the objects the mvp-reset app relies on (previously only in the live
-- zentra-dev database) and hardens them so shift numbers can be trusted.
-- Run after the existing scripts. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Schema used by the MVP
-- ---------------------------------------------------------------------------

alter table public.bar_memberships add column if not exists is_active boolean not null default true;

alter table public.users add column if not exists name text;

alter table public.audit_logs add column if not exists entity_id uuid;

alter table public.products add column if not exists purchase_price numeric;
alter table public.products add column if not exists opening_stock numeric;
alter table public.products add column if not exists current_stock numeric;
alter table public.products add column if not exists updated_at timestamptz default now();

alter table public.sales add column if not exists staff_id uuid references public.users(id);
alter table public.sales add column if not exists notes text;
alter table public.sales add column if not exists status varchar not null default 'paid';

alter table public.sale_items add column if not exists total_price numeric not null default 0;

alter table public.customer_credits add column if not exists settled_date date;

alter table public.mpesa_transactions add column if not exists sale_id uuid references public.sales(id);
alter table public.mpesa_transactions add column if not exists staff_id uuid references public.users(id);
alter table public.mpesa_transactions add column if not exists phone_number varchar not null default 'MANUAL';
alter table public.mpesa_transactions add column if not exists transaction_type varchar not null default 'manual_c2b';
alter table public.mpesa_transactions add column if not exists transaction_code varchar;

alter table public.inventory_movements add column if not exists product_id uuid references public.products(id);
alter table public.inventory_movements add column if not exists sale_id uuid;
alter table public.inventory_movements add column if not exists notes text;
alter table public.inventory_movements add column if not exists created_by uuid references auth.users(id);
alter table public.inventory_movements add column if not exists business_date date not null default current_date;

alter table public.expenses add column if not exists paid_from text not null default 'cash_drawer';

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id),
  business_date date not null,
  cash_sales numeric default 0,
  mpesa_sales numeric default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  top_product text,
  units_sold integer,
  opening_cash numeric,
  profit_total numeric,
  status text,
  expected_cash numeric not null default 0,
  actual_cash numeric not null default 0,
  expected_mpesa numeric not null default 0,
  actual_mpesa numeric not null default 0,
  total_expenses_cash numeric not null default 0,
  stock_variance_value numeric not null default 0,
  closed_at timestamptz
);

create table if not exists public.daily_closure_items (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.daily_closures(id),
  product_id uuid not null references public.products(id),
  opening_stock numeric not null,
  purchased_stock numeric not null default 0,
  closing_stock numeric not null,
  quantity_sold numeric not null,
  revenue_generated numeric,
  profit_generated numeric,
  created_at timestamptz default now(),
  selling_price numeric,
  purchase_price numeric,
  wastage_stock numeric not null default 0,
  expected_closing_stock numeric not null default 0,
  variance_stock numeric not null default 0
);

create unique index if not exists idx_daily_closures_unique_bar_date on public.daily_closures (bar_id, business_date);
create unique index if not exists idx_mpesa_unique_receipt_per_bar on public.mpesa_transactions (bar_id, transaction_code)
  where transaction_code is not null and transaction_code <> '';
create index if not exists idx_customer_credits_bar_status on public.customer_credits (bar_id, status);

alter table public.daily_closures enable row level security;
alter table public.daily_closure_items enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.has_bar_role(p_bar_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bar_memberships bm
    where bm.bar_id = p_bar_id
      and bm.user_id = auth.uid()
      and bm.is_active = true
      and bm.role = any(p_roles)
  );
$$;

create or replace function public.is_bar_member(p_bar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_bar_role(p_bar_id, array['owner', 'manager', 'staff']);
$$;

-- A bar's business day runs on Nairobi time and rolls over at 06:00, so a
-- shift that runs past midnight is recorded as one night.
create or replace function public.current_business_date()
returns date
language sql
stable
as $$
  select ((now() at time zone 'Africa/Nairobi') - interval '6 hours')::date;
$$;

create or replace function public.is_business_day_closed(p_bar_id uuid, p_business_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_closures
    where bar_id = p_bar_id and business_date = p_business_date and status = 'closed'
  );
$$;

create or replace function public.lock_business_day(p_bar_id uuid, p_business_date date)
returns void
language sql
as $$
  select pg_advisory_xact_lock(hashtextextended(p_bar_id::text || ':' || p_business_date::text, 0));
$$;

-- ---------------------------------------------------------------------------
-- POS sale: prices come from products, never from the phone.
-- ---------------------------------------------------------------------------

drop function if exists public.record_pos_sale(uuid, date, jsonb, numeric, numeric, text, text, boolean, text, text);

create or replace function public.record_pos_sale(
  p_bar_id uuid,
  p_items jsonb,
  p_cash_amount numeric default 0,
  p_mpesa_amount numeric default 0,
  p_mpesa_code text default null,
  p_mpesa_phone text default null,
  p_is_tab boolean default false,
  p_customer_name text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_date date := public.current_business_date();
  v_sale_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_prod_id uuid;
  v_qty numeric;
  v_price numeric;
  v_prod_name text;
  v_staff_name text;
  v_clean_code text;
  v_cash numeric := coalesce(p_cash_amount, 0);
  v_mpesa numeric := coalesce(p_mpesa_amount, 0);
begin
  if not public.is_bar_member(p_bar_id) then
    raise exception 'Unauthorized: Not an active member of this bar.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one drink to the order.';
  end if;

  perform public.lock_business_day(p_bar_id, v_business_date);

  if public.is_business_day_closed(p_bar_id, v_business_date) then
    raise exception 'ERR_PERIOD_LOCKED: Business date % is already closed.', v_business_date;
  end if;

  if p_is_tab then
    if trim(coalesce(p_customer_name, '')) = '' then
      raise exception 'Customer name is required to open a tab.';
    end if;
    v_cash := 0;
    v_mpesa := 0;
  elsif v_cash < 0 or v_mpesa < 0 then
    raise exception 'Payment amounts cannot be negative.';
  end if;

  -- Validate every line and price it from the products table first.
  create temporary table if not exists pg_temp.pos_lines (
    product_id uuid, product_name text, quantity numeric, unit_price numeric
  ) on commit drop;
  truncate pg_temp.pos_lines;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_prod_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    if v_qty is null or v_qty <= 0 or v_qty > 1000 then
      raise exception 'Invalid quantity for one of the drinks.';
    end if;

    select name, selling_price into v_prod_name, v_price
    from public.products
    where id = v_prod_id and bar_id = p_bar_id and is_active = true;

    if not found or v_price is null or v_price <= 0 then
      raise exception 'A drink in this order is not on this bar''s active menu.';
    end if;

    insert into pg_temp.pos_lines values (v_prod_id, v_prod_name, v_qty, v_price);
    v_total := v_total + v_qty * v_price;
  end loop;

  if not p_is_tab and v_cash + v_mpesa <> v_total then
    raise exception 'Payment mismatch: Cash (%) + M-PESA (%) does not equal total (%).', v_cash, v_mpesa, v_total;
  end if;

  if v_mpesa > 0 then
    v_clean_code := upper(regexp_replace(coalesce(p_mpesa_code, ''), '[^A-Za-z0-9]', '', 'g'));
    if v_clean_code !~ '^[A-Z0-9]{10}$' then
      raise exception 'Enter a valid 10-character M-PESA confirmation code.';
    end if;
  end if;

  insert into public.sales (
    bar_id, staff_id, sale_date, sold_at, total_amount, cash_amount, mpesa_amount, status, notes
  ) values (
    p_bar_id, auth.uid(), v_business_date, now(), v_total, v_cash, v_mpesa,
    case when p_is_tab then 'open_tab' else 'paid' end,
    nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_sale_id;

  insert into public.sale_items (sale_id, product_id, quantity, unit_price, total_price)
  select v_sale_id, product_id, quantity, unit_price, quantity * unit_price from pg_temp.pos_lines;

  insert into public.inventory_movements (
    bar_id, product_id, product_name, sale_id, quantity, quantity_change, movement_type, business_date, created_by
  )
  select p_bar_id, product_id, product_name, v_sale_id, quantity, -quantity, 'sale', v_business_date, auth.uid()
  from pg_temp.pos_lines;

  update public.products p
  set current_stock = coalesce(p.current_stock, 0) - l.qty,
      updated_at = now()
  from (select product_id, sum(quantity) qty from pg_temp.pos_lines group by product_id) l
  where p.id = l.product_id and p.bar_id = p_bar_id;

  if v_mpesa > 0 then
    insert into public.mpesa_transactions (
      bar_id, sale_id, staff_id, phone_number, amount, transaction_type, transaction_code, status
    ) values (
      p_bar_id, v_sale_id, auth.uid(), coalesce(nullif(trim(p_mpesa_phone), ''), 'MANUAL'), v_mpesa,
      'manual_c2b', v_clean_code, 'matched'
    );
  end if;

  if p_is_tab then
    select name into v_staff_name from public.users where id = auth.uid();

    -- staff_id references bar_staff (a roster), not the signed-in user; created_by records who opened it.
    insert into public.customer_credits (
      bar_id, business_date, customer_name, amount, staff_id, staff_name, status, notes, created_by
    ) values (
      p_bar_id, v_business_date, trim(p_customer_name), v_total,
      null, coalesce(v_staff_name, 'Staff'), 'unpaid', nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
    );
  end if;

  return v_sale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tab settlement: one transaction, amount taken from the tab itself.
-- ---------------------------------------------------------------------------

create or replace function public.settle_customer_tab(
  p_bar_id uuid,
  p_tab_id uuid,
  p_method text,
  p_mpesa_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_date date := public.current_business_date();
  v_tab public.customer_credits%rowtype;
  v_sale_id uuid;
  v_clean_code text;
begin
  if not public.is_bar_member(p_bar_id) then
    raise exception 'Unauthorized: Not an active member of this bar.';
  end if;

  if p_method not in ('cash', 'mpesa') then
    raise exception 'Choose Cash or M-PESA to settle the tab.';
  end if;

  perform public.lock_business_day(p_bar_id, v_business_date);

  if public.is_business_day_closed(p_bar_id, v_business_date) then
    raise exception 'ERR_PERIOD_LOCKED: Business date % is already closed.', v_business_date;
  end if;

  select * into v_tab
  from public.customer_credits
  where id = p_tab_id and bar_id = p_bar_id
  for update;

  if not found then
    raise exception 'Tab not found for this bar.';
  end if;

  if v_tab.status <> 'unpaid' then
    raise exception 'This tab has already been settled.';
  end if;

  if p_method = 'mpesa' then
    v_clean_code := upper(regexp_replace(coalesce(p_mpesa_code, ''), '[^A-Za-z0-9]', '', 'g'));
    if v_clean_code !~ '^[A-Z0-9]{10}$' then
      raise exception 'Enter a valid 10-character M-PESA confirmation code.';
    end if;
  end if;

  insert into public.sales (
    bar_id, staff_id, sale_date, sold_at, total_amount, cash_amount, mpesa_amount, status, notes
  ) values (
    p_bar_id, auth.uid(), v_business_date, now(), v_tab.amount,
    case when p_method = 'cash' then v_tab.amount else 0 end,
    case when p_method = 'mpesa' then v_tab.amount else 0 end,
    'paid',
    'Tab Settlement (' || v_tab.id || ')'
  ) returning id into v_sale_id;

  if p_method = 'mpesa' then
    insert into public.mpesa_transactions (
      bar_id, sale_id, staff_id, phone_number, amount, transaction_type, transaction_code, status
    ) values (
      p_bar_id, v_sale_id, auth.uid(), 'TAB_SETTLEMENT', v_tab.amount, 'tab_settlement', v_clean_code, 'matched'
    );
  end if;

  update public.customer_credits
  set status = 'settled',
      settled_date = v_business_date,
      settled_business_date = v_business_date,
      settled_at = now(),
      settled_by = auth.uid()
  where id = v_tab.id;

  return v_sale_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Close Day: blind stock count + cash/M-PESA reconciliation.
-- ---------------------------------------------------------------------------

-- Older 9-argument version; the app uses the 7-argument one below.
drop function if exists public.close_business_day(uuid, date, numeric, numeric, text, text, jsonb, jsonb, jsonb);

create or replace function public.close_business_day(
  p_bar_id uuid,
  p_business_date date,
  p_opening_cash numeric,
  p_actual_cash numeric,
  p_actual_mpesa numeric,
  p_blind_counts jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closure_id uuid;
  v_expected_cash_sales numeric(12,2) := 0;
  v_expected_mpesa_sales numeric(12,2) := 0;
  v_cash_expenses numeric(12,2) := 0;
  v_expected_cash_drawer numeric(12,2) := 0;
  v_total_profit numeric(12,2) := 0;
  v_total_units_sold int := 0;
  v_stock_variance_kes numeric(12,2) := 0;
  v_prod_id uuid;
  v_prod_selling numeric(12,2);
  v_prod_cost numeric(12,2);
  v_prod_sys_stock numeric(12,2);
  v_count_item jsonb;
  v_actual_close numeric(12,2);
  v_opening_qty numeric(12,2);
  v_restock_qty numeric(12,2);
  v_sold_qty numeric(12,2);
  v_wastage_qty numeric(12,2);
  v_expected_close numeric(12,2);
  v_variance_qty numeric(12,2);
  v_rev numeric(12,2);
  v_prof numeric(12,2);
begin
  if not public.has_bar_role(p_bar_id, array['owner', 'manager']) then
    raise exception 'Unauthorized: Only a Manager or Owner can close the business day.';
  end if;

  if p_business_date > public.current_business_date() then
    raise exception 'Cannot close a business date that has not started yet.';
  end if;

  if coalesce(p_opening_cash, 0) < 0 or coalesce(p_actual_cash, 0) < 0 or coalesce(p_actual_mpesa, 0) < 0 then
    raise exception 'Cash and M-PESA amounts cannot be negative.';
  end if;

  perform public.lock_business_day(p_bar_id, p_business_date);

  if public.is_business_day_closed(p_bar_id, p_business_date) then
    raise exception 'Business date % is already closed.', p_business_date;
  end if;

  select coalesce(sum(cash_amount), 0), coalesce(sum(mpesa_amount), 0)
  into v_expected_cash_sales, v_expected_mpesa_sales
  from public.sales
  where bar_id = p_bar_id and sale_date = p_business_date and status = 'paid';

  select coalesce(sum(amount), 0)
  into v_cash_expenses
  from public.expenses
  where bar_id = p_bar_id and business_date = p_business_date and paid_from = 'cash_drawer';

  v_expected_cash_drawer := coalesce(p_opening_cash, 0) + v_expected_cash_sales - v_cash_expenses;

  insert into public.daily_closures (
    bar_id, business_date, opening_cash, cash_sales, mpesa_sales,
    expected_cash, actual_cash, expected_mpesa, actual_mpesa,
    total_expenses_cash, notes, status, created_by, closed_at
  ) values (
    p_bar_id, p_business_date, p_opening_cash, v_expected_cash_sales, v_expected_mpesa_sales,
    v_expected_cash_drawer, p_actual_cash, v_expected_mpesa_sales, p_actual_mpesa,
    v_cash_expenses, p_notes, 'closed', auth.uid(), now()
  ) returning id into v_closure_id;

  for v_prod_id, v_prod_selling, v_prod_cost, v_prod_sys_stock in
    select id, coalesce(selling_price, 0), coalesce(cost_price, 0), coalesce(current_stock, 0)
    from public.products
    where bar_id = p_bar_id and is_active = true
  loop
    v_actual_close := 0;
    for v_count_item in select * from jsonb_array_elements(p_blind_counts) loop
      if (v_count_item->>'product_id')::uuid = v_prod_id then
        v_actual_close := coalesce((v_count_item->>'actual_closing_stock')::numeric, 0);
        exit;
      end if;
    end loop;

    select closing_stock into v_opening_qty
    from public.daily_closure_items dci
    join public.daily_closures dc on dc.id = dci.closure_id
    where dc.bar_id = p_bar_id
      and dci.product_id = v_prod_id
      and dc.business_date < p_business_date
      and dc.status = 'closed'
    order by dc.business_date desc
    limit 1;

    select
      coalesce(sum(case when movement_type = 'restock' then quantity_change else 0 end), 0),
      coalesce(sum(case when movement_type = 'sale' then abs(quantity_change) else 0 end), 0),
      coalesce(sum(case when movement_type = 'wastage' then abs(quantity_change) else 0 end), 0)
    into v_restock_qty, v_sold_qty, v_wastage_qty
    from public.inventory_movements
    where bar_id = p_bar_id and product_id = v_prod_id and business_date = p_business_date;

    if v_opening_qty is null then
      v_opening_qty := v_prod_sys_stock - v_restock_qty + v_sold_qty + v_wastage_qty;
    end if;

    v_expected_close := v_opening_qty + v_restock_qty - v_sold_qty - v_wastage_qty;
    v_variance_qty := v_actual_close - v_expected_close;

    v_rev := v_sold_qty * v_prod_selling;
    v_prof := v_sold_qty * (v_prod_selling - v_prod_cost);

    v_total_profit := v_total_profit + v_prof;
    v_total_units_sold := v_total_units_sold + v_sold_qty::int;
    v_stock_variance_kes := v_stock_variance_kes + (v_variance_qty * v_prod_selling);

    insert into public.daily_closure_items (
      closure_id, product_id, opening_stock, purchased_stock, wastage_stock,
      quantity_sold, expected_closing_stock, closing_stock, variance_stock,
      selling_price, purchase_price, revenue_generated, profit_generated
    ) values (
      v_closure_id, v_prod_id, v_opening_qty, v_restock_qty, v_wastage_qty,
      v_sold_qty, v_expected_close, v_actual_close, v_variance_qty,
      v_prod_selling, v_prod_cost, v_rev, v_prof
    );

    update public.products
    set current_stock = v_actual_close, updated_at = now()
    where id = v_prod_id;
  end loop;

  update public.daily_closures
  set profit_total = v_total_profit,
      units_sold = v_total_units_sold,
      stock_variance_value = v_stock_variance_kes
  where id = v_closure_id;

  insert into public.audit_logs (bar_id, user_id, action, entity_type, entity_id, new_values)
  values (
    p_bar_id, auth.uid(), 'CLOSE_BUSINESS_DAY', 'daily_closures', v_closure_id,
    jsonb_build_object(
      'business_date', p_business_date,
      'cash_variance', p_actual_cash - v_expected_cash_drawer,
      'mpesa_variance', p_actual_mpesa - v_expected_mpesa_sales,
      'stock_variance_kes', v_stock_variance_kes
    )
  );

  return v_closure_id;
end;
$$;

revoke all on function public.record_pos_sale(uuid, jsonb, numeric, numeric, text, text, boolean, text, text) from public, anon;
revoke all on function public.settle_customer_tab(uuid, uuid, text, text) from public, anon;
revoke all on function public.close_business_day(uuid, date, numeric, numeric, numeric, jsonb, text) from public, anon;
grant execute on function public.record_pos_sale(uuid, jsonb, numeric, numeric, text, text, boolean, text, text) to authenticated;
grant execute on function public.settle_customer_tab(uuid, uuid, text, text) to authenticated;
grant execute on function public.close_business_day(uuid, date, numeric, numeric, numeric, jsonb, text) to authenticated;
grant execute on function public.current_business_date() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: staff record money only through the functions above, so they cannot
-- write sales, tabs or M-PESA rows directly to hide a shortage. Takings and
-- M-PESA receipts are visible to owners and managers only.
-- Existing policies on these tables are replaced, whatever their names.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sales', 'sale_items', 'mpesa_transactions', 'customer_credits',
                        'inventory_movements', 'daily_closures', 'daily_closure_items')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end;
$$;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.customer_credits enable row level security;
alter table public.inventory_movements enable row level security;

create policy sales_select on public.sales
  for select to authenticated
  using (public.has_bar_role(bar_id, array['owner', 'manager']));
create policy sales_insert on public.sales
  for insert to authenticated
  with check (public.has_bar_role(bar_id, array['owner', 'manager']));

create policy sale_items_select on public.sale_items
  for select to authenticated
  using (exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id and public.has_bar_role(s.bar_id, array['owner', 'manager'])
  ));
create policy sale_items_insert on public.sale_items
  for insert to authenticated
  with check (exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id and public.has_bar_role(s.bar_id, array['owner', 'manager'])
  ));

create policy mpesa_select on public.mpesa_transactions
  for select to authenticated
  using (public.has_bar_role(bar_id, array['owner', 'manager']));
create policy mpesa_insert on public.mpesa_transactions
  for insert to authenticated
  with check (public.has_bar_role(bar_id, array['owner', 'manager']));

-- Staff need to see open tabs at the counter.
create policy credits_select on public.customer_credits
  for select to authenticated
  using (public.is_bar_member(bar_id));
create policy credits_insert on public.customer_credits
  for insert to authenticated
  with check (public.has_bar_role(bar_id, array['owner', 'manager']));
create policy credits_update on public.customer_credits
  for update to authenticated
  using (public.has_bar_role(bar_id, array['owner', 'manager']))
  with check (public.has_bar_role(bar_id, array['owner', 'manager']));

create policy inv_movements_select on public.inventory_movements
  for select to authenticated
  using (public.is_bar_member(bar_id));
create policy inv_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (public.has_bar_role(bar_id, array['owner', 'manager']));

create policy closures_select on public.daily_closures
  for select to authenticated
  using (public.has_bar_role(bar_id, array['owner', 'manager']));

create policy closure_items_select on public.daily_closure_items
  for select to authenticated
  using (exists (
    select 1 from public.daily_closures dc
    where dc.id = daily_closure_items.closure_id and public.has_bar_role(dc.bar_id, array['owner', 'manager'])
  ));
