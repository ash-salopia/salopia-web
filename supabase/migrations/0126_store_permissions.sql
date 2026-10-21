-- ============================================================
-- 0126_store_permissions.sql
-- ============================================================
-- Online Store access is owner-only by default. The owner can switch
-- it on for specific coaches (Settings -> Team). Until now any coach
-- in the org could see every sale and edit listings (0124 used plain
-- my_organisation_id() policies).
--
--   coaches.can_manage_store  - set by the owner (service-role route
--                               /api/coaches/store-access)
--   can_manage_store()        - owner, or a coach with the switch on
--   store_products            - read/write: store managers only
--   programme_purchases       - read: store managers only
--   update_store_settings()   - store name/address/description, so a
--                               store manager can edit those without
--                               the owner-only organisations update
--                               (0060) being loosened.
-- Connecting Stripe (the bank account) stays owner-only.
--
-- Also closes a gap in "Coaches update own row" (0001): a coach could
-- update ANY column of their own row from the browser, including
-- role, archived and athlete_access. Every legitimate change to those
-- already goes through service-role routes, so a signed-in coach is
-- now blocked from changing them directly. Name, avatar and
-- notification preferences are unaffected.
-- ============================================================

alter table coaches add column if not exists can_manage_store boolean not null default false;

create or replace function can_manage_store()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from coaches
    where id = auth.uid() and archived = false
      and (role = 'owner' or can_manage_store)
  )
$$;
revoke execute on function public.can_manage_store() from public, anon;
grant execute on function public.can_manage_store() to authenticated;

drop policy if exists "Org members manage store products" on store_products;
drop policy if exists "Store managers manage store products" on store_products;
create policy "Store managers manage store products" on store_products
  for all using (organisation_id = my_organisation_id() and can_manage_store())
  with check (organisation_id = my_organisation_id() and can_manage_store());

drop policy if exists "Org members read programme purchases" on programme_purchases;
drop policy if exists "Store managers read programme purchases" on programme_purchases;
create policy "Store managers read programme purchases" on programme_purchases
  for select using (organisation_id = my_organisation_id() and can_manage_store());

create or replace function update_store_settings(p_slug text, p_name text, p_description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := my_organisation_id();
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if v_org is null or not can_manage_store() then
    raise exception 'You don''t have access to the online store' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'The store address can only use letters, numbers and dashes (2-40 characters).' using errcode = '22023';
  end if;
  update organisations
     set store_slug = v_slug,
         store_name = nullif(trim(coalesce(p_name, '')), ''),
         store_description = left(trim(coalesce(p_description, '')), 2000)
   where id = v_org;
end;
$$;
revoke execute on function public.update_store_settings(text, text, text) from public, anon;
grant execute on function public.update_store_settings(text, text, text) to authenticated;

-- Protected coach columns: only changeable by the service role (owner
-- routes) or the SQL editor, never by a signed-in coach directly.
create or replace function coaches_guard_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and (
       new.role is distinct from old.role
    or new.organisation_id is distinct from old.organisation_id
    or new.archived is distinct from old.archived
    or new.athlete_access is distinct from old.athlete_access
    or new.is_app_admin is distinct from old.is_app_admin
    or new.can_manage_store is distinct from old.can_manage_store
  ) then
    raise exception 'Only the account owner can change this' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists coaches_guard_protected_columns on coaches;
create trigger coaches_guard_protected_columns
  before update on coaches
  for each row execute function coaches_guard_protected_columns();
