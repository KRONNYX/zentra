-- Zentra role permission hardening.
-- Role source assumption:
--   1. public.users.role for auth.uid() or auth email
--   2. public.bar_memberships.role for the current auth user
-- Supported app roles: owner, manager, staff, super_user.

create or replace function public.normalize_app_role(p_role text)
returns text
language sql
immutable
as $$
  select case
    when lower(replace(replace(coalesce(p_role, ''), '-', '_'), ' ', '_')) in ('super_user', 'superuser', 'admin')
      then 'super_user'
    when lower(coalesce(p_role, '')) = 'owner'
      then 'owner'
    when lower(coalesce(p_role, '')) = 'manager'
      then 'manager'
    else 'staff'
  end;
$$;

create or replace function public.get_current_user_role()
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
  v_email text := auth.jwt() ->> 'email';
begin
  select public.normalize_app_role(role)
  into v_role
  from public.users
  where id = auth.uid()
  limit 1;

  if v_role = 'super_user' then
    return v_role;
  end if;

  if v_email is not null then
    select public.normalize_app_role(role)
    into v_role
    from public.users
    where email = v_email
    limit 1;

    if v_role = 'super_user' then
      return v_role;
    end if;
  end if;

  select public.normalize_app_role(role)
  into v_role
  from public.bar_memberships
  where user_id = auth.uid()
  limit 1;

  return coalesce(v_role, 'staff');
end;
$$;

create or replace function public.is_current_user_super_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.get_current_user_role() = 'super_user';
$$;

create or replace function public.current_user_has_role(p_allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.get_current_user_role() = any(p_allowed_roles)
    or public.is_current_user_super_user();
$$;

create or replace function public.current_user_can_access_bar(p_bar_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_current_user_super_user()
    or p_bar_id = public.get_current_bar_id();
$$;

grant execute on function public.normalize_app_role(text) to authenticated;
grant execute on function public.get_current_user_role() to authenticated;
grant execute on function public.is_current_user_super_user() to authenticated;
grant execute on function public.current_user_has_role(text[]) to authenticated;
grant execute on function public.current_user_can_access_bar(uuid) to authenticated;

alter table if exists public.bars enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.inventory enable row level security;
alter table if exists public.daily_sales enable row level security;
alter table if exists public.product_sales enable row level security;
alter table if exists public.daily_product_closures enable row level security;
alter table if exists public.customer_credits enable row level security;
alter table if exists public.expenses enable row level security;
alter table if exists public.close_day_settings enable row level security;
alter table if exists public.close_day_submissions enable row level security;
alter table if exists public.bar_alerts enable row level security;
alter table if exists public.inventory_movements enable row level security;
alter table if exists public.audit_logs enable row level security;
alter table if exists public.shifts enable row level security;
alter table if exists public.bar_staff enable row level security;

-- Remove older broad member policies where they would conflict with role rules.
drop policy if exists "Members can read their bars" on public.bars;
drop policy if exists "Members can read products for their bars" on public.products;
drop policy if exists "Members can read inventory for their bars" on public.inventory;
drop policy if exists "Members can update inventory for their bars" on public.inventory;
drop policy if exists "Members can manage daily sales for their bars" on public.daily_sales;
drop policy if exists "Members can manage product sales for their bars" on public.product_sales;
drop policy if exists "Members can manage ledger rows for their bars" on public.daily_product_closures;
drop policy if exists "Members can manage credits for their bars" on public.customer_credits;
drop policy if exists "Members can manage expenses for their bars" on public.expenses;
drop policy if exists "Members can manage close day settings for their bars" on public.close_day_settings;
drop policy if exists "Members can manage close day submissions for their bars" on public.close_day_submissions;
drop policy if exists "Members can manage alerts for their bars" on public.bar_alerts;
drop policy if exists "Members can read inventory movements for their bars" on public.inventory_movements;
drop policy if exists "Members can manage inventory movements for their bars" on public.inventory_movements;
drop policy if exists "Members can manage insights for their bars" on public.intelligence_insights;
drop policy if exists "Members can manage audit logs for their bars" on public.audit_logs;
drop policy if exists "Users can manage their bar staff shifts" on public.shifts;

drop policy if exists "Role read bars" on public.bars;
create policy "Role read bars" on public.bars
for select to authenticated
using (public.current_user_can_access_bar(id));

drop policy if exists "Role manage own bars" on public.bars;
create policy "Role manage own bars" on public.bars
for update to authenticated
using (
  public.current_user_can_access_bar(id)
  and public.current_user_has_role(array['owner', 'super_user'])
)
with check (
  public.current_user_can_access_bar(id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role read products" on public.products;
create policy "Role read products" on public.products
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role create products" on public.products;
create policy "Role create products" on public.products
for insert to authenticated
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role update products" on public.products;
create policy "Role update products" on public.products
for update to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
)
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role delete products" on public.products;
create policy "Role delete products" on public.products
for delete to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role read inventory" on public.inventory;
create policy "Role read inventory" on public.inventory
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role owner manage inventory" on public.inventory;
create policy "Role owner manage inventory" on public.inventory
for all to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
)
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role read staff" on public.bar_staff;
create policy "Role read staff" on public.bar_staff
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role manage staff" on public.bar_staff;
create policy "Role manage staff" on public.bar_staff
for all to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
)
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role read shifts" on public.shifts;
create policy "Role read shifts" on public.shifts
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role manage shifts" on public.shifts;
create policy "Role manage shifts" on public.shifts
for all to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
)
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role read close day settings" on public.close_day_settings;
create policy "Role read close day settings" on public.close_day_settings
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role super user manage close day settings" on public.close_day_settings;
create policy "Role super user manage close day settings" on public.close_day_settings
for all to authenticated
using (public.is_current_user_super_user())
with check (public.is_current_user_super_user());

drop policy if exists "Role read operational records" on public.daily_sales;
create policy "Role read operational records" on public.daily_sales
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read product sales" on public.product_sales;
create policy "Role read product sales" on public.product_sales
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read daily product closures" on public.daily_product_closures;
create policy "Role read daily product closures" on public.daily_product_closures
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read customer credits" on public.customer_credits;
create policy "Role read customer credits" on public.customer_credits
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role insert customer credits" on public.customer_credits;
create policy "Role insert customer credits" on public.customer_credits
for insert to authenticated
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role owner update customer credits" on public.customer_credits;
create policy "Role owner update customer credits" on public.customer_credits
for update to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
)
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role read expenses" on public.expenses;
create policy "Role read expenses" on public.expenses
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role insert expenses" on public.expenses;
create policy "Role insert expenses" on public.expenses
for insert to authenticated
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read close day submissions" on public.close_day_submissions;
create policy "Role read close day submissions" on public.close_day_submissions
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role insert close day submissions" on public.close_day_submissions;
create policy "Role insert close day submissions" on public.close_day_submissions
for insert to authenticated
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read alerts" on public.bar_alerts;
create policy "Role read alerts" on public.bar_alerts
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read inventory movements" on public.inventory_movements;
create policy "Role read inventory movements" on public.inventory_movements
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);

drop policy if exists "Role read audit logs" on public.audit_logs;
create policy "Role read audit logs" on public.audit_logs
for select to authenticated
using (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'super_user'])
);

drop policy if exists "Role insert audit logs" on public.audit_logs;
create policy "Role insert audit logs" on public.audit_logs
for insert to authenticated
with check (
  public.current_user_can_access_bar(bar_id)
  and public.current_user_has_role(array['owner', 'manager', 'super_user'])
);
