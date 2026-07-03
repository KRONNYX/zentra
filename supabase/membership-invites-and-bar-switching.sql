-- Zentra membership invites and super-user bar switching support.
-- Run after role-permissions-rls.sql.
--
-- Role model:
--   public.users.role is global/system only. Use 'super_user' here.
--   public.bar_memberships.role is operational per-bar access:
--     'owner', 'manager', 'staff'.
--   public.bar_staff is the operational staff directory, not login access.

alter table public.users
add column if not exists role text not null default 'staff',
add column if not exists email text;

alter table public.bar_memberships
add column if not exists role text not null default 'staff',
add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bar_memberships_bar_id_user_id_key'
      and conrelid = 'public.bar_memberships'::regclass
  ) then
    alter table public.bar_memberships
    add constraint bar_memberships_bar_id_user_id_key unique (bar_id, user_id);
  end if;
end $$;

alter table public.bar_memberships
drop constraint if exists bar_memberships_role_check;

alter table public.bar_memberships
add constraint bar_memberships_role_check
check (role in ('owner', 'manager', 'staff'));

create or replace function public.is_super_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users app_user
    where (app_user.id = auth.uid() or app_user.email = auth.jwt() ->> 'email')
      and public.normalize_app_role(app_user.role) = 'super_user'
  );
$$;

create or replace function public.user_has_bar_role(
  p_bar_id uuid,
  p_roles text[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_super_user()
    or exists (
      select 1
      from public.bar_memberships membership
      where membership.bar_id = p_bar_id
        and membership.user_id = auth.uid()
        and membership.role = any(p_roles)
    );
$$;

grant execute on function public.is_super_user() to authenticated;
grant execute on function public.user_has_bar_role(uuid, text[]) to authenticated;

alter table public.users enable row level security;
alter table public.bar_memberships enable row level security;

drop policy if exists "Users can read their global profile" on public.users;
create policy "Users can read their global profile" on public.users
for select to authenticated
using (
  id = auth.uid()
  or email = auth.jwt() ->> 'email'
  or public.is_super_user()
);

drop policy if exists "Users can read their own memberships" on public.bar_memberships;
create policy "Users can read their own memberships" on public.bar_memberships
for select to authenticated
using (
  user_id = auth.uid()
  or public.user_has_bar_role(bar_id, array['owner', 'manager'])
);

drop policy if exists "Owners and super users can insert memberships" on public.bar_memberships;
create policy "Owners and super users can insert memberships" on public.bar_memberships
for insert to authenticated
with check (public.user_has_bar_role(bar_id, array['owner']));

drop policy if exists "Owners and super users can update memberships" on public.bar_memberships;
create policy "Owners and super users can update memberships" on public.bar_memberships
for update to authenticated
using (public.user_has_bar_role(bar_id, array['owner']))
with check (public.user_has_bar_role(bar_id, array['owner']));

drop policy if exists "Owners and super users can delete memberships" on public.bar_memberships;
create policy "Owners and super users can delete memberships" on public.bar_memberships
for delete to authenticated
using (public.user_has_bar_role(bar_id, array['owner']));
