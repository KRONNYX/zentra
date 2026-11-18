-- Apply after membership-invites-and-bar-switching.sql.
begin;

create table if not exists public.bar_orders (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars(id) on delete cascade,
  created_by uuid not null,
  request_id uuid not null,
  note text not null default '' check (char_length(note) <= 120),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  status text not null default 'new' check (status in ('new', 'ready', 'served')),
  created_at timestamptz not null default now(),
  unique (bar_id, created_by, request_id)
);

create index if not exists bar_orders_open_queue_idx
on public.bar_orders (bar_id, created_at, id) where status in ('new', 'ready');

alter table public.bar_orders enable row level security;
revoke all on public.bar_orders from public, anon, authenticated;
grant select on public.bar_orders to authenticated;

drop policy if exists "Read permitted bar orders" on public.bar_orders;
create policy "Read permitted bar orders" on public.bar_orders
for select to authenticated using (
  public.user_has_bar_role(bar_id, array['owner', 'manager'])
  or (created_by = (select auth.uid()) and public.user_has_bar_role(bar_id, array['staff']))
);

create or replace function public.get_order_menu(p_bar_id uuid)
returns table (id uuid, name text, category text, unit text, selling_price numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.user_has_bar_role(p_bar_id, array['staff', 'manager', 'owner']) then
    raise exception 'You do not have access to this menu.' using errcode = '42501';
  end if;

  return query
    select p.id, p.name, p.category, p.unit, p.selling_price
    from public.products p
    where p.bar_id = p_bar_id and p.is_active and p.selling_price >= 0
    order by p.name, p.id;
end;
$$;

create or replace function public.submit_bar_order(
  p_bar_id uuid, p_request_id uuid, p_note text, p_items jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_count int;
  v_unique_count int;
  v_items jsonb;
begin
  if v_user_id is null or not public.user_has_bar_role(p_bar_id, array['staff', 'manager', 'owner']) then
    raise exception 'You do not have access to place orders for this bar.' using errcode = '42501';
  end if;

  -- Serialize retries before reading the menu, including when the first response was lost.
  if p_request_id is null then
    raise exception 'Order request ID is required.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_bar_id::text || ':' || v_user_id::text || ':' || p_request_id::text, 0
  ));

  select id into v_order_id from public.bar_orders
  where bar_id = p_bar_id and created_by = v_user_id and request_id = p_request_id;
  if found then
    return v_order_id;
  end if;

  if char_length(trim(coalesce(p_note, ''))) > 120
    or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid order items or note.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'An order needs 1 to 50 distinct items.' using errcode = '22023';
  end if;

  select count(*), count(distinct p.id), jsonb_agg(jsonb_build_object(
    'product_id', p.id, 'name', p.name, 'unit', p.unit,
    'unit_price', p.selling_price, 'quantity', item.quantity
  ) order by p.name, p.id)
  into v_count, v_unique_count, v_items
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.products p on p.id = item.product_id and p.bar_id = p_bar_id
  where p.is_active and p.selling_price >= 0 and item.quantity between 1 and 99;

  if v_count <> jsonb_array_length(p_items) or v_count <> v_unique_count then
    raise exception 'Some items are unavailable or have invalid quantities.' using errcode = '22023';
  end if;

  insert into public.bar_orders (bar_id, created_by, request_id, note, items)
  values (p_bar_id, v_user_id, p_request_id, trim(coalesce(p_note, '')), v_items)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.advance_bar_order(p_bar_id uuid, p_order_id uuid, p_status text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_previous text;
  v_status text;
begin
  if auth.uid() is null or not public.user_has_bar_role(p_bar_id, array['owner', 'manager']) then
    raise exception 'You do not have access to manage orders for this bar.' using errcode = '42501';
  end if;

  v_previous := case p_status when 'ready' then 'new' when 'served' then 'ready' end;
  if v_previous is null then
    raise exception 'Invalid order status.' using errcode = '22023';
  end if;

  update public.bar_orders set status = p_status
  where bar_id = p_bar_id and id = p_order_id and status = v_previous
  returning status into v_status;

  if v_status is null then
    select status into v_status from public.bar_orders where bar_id = p_bar_id and id = p_order_id;
  end if;

  if v_status is distinct from p_status then
    raise exception 'This order is no longer at the expected stage.' using errcode = '22023';
  end if;
  return v_status;
end;
$$;

revoke all on function public.get_order_menu(uuid) from public, anon, authenticated;
revoke all on function public.submit_bar_order(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.advance_bar_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_order_menu(uuid) to authenticated;
grant execute on function public.submit_bar_order(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.advance_bar_order(uuid, uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bar_orders'
  ) then
    alter publication supabase_realtime add table public.bar_orders;
  end if;
end;
$$;

commit;
