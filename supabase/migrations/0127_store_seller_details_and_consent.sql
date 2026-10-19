-- ============================================================
-- 0127_store_seller_details_and_consent.sql
-- ============================================================
-- Selling digital programmes to the public (UK Consumer Contracts
-- Regulations 2013):
--
-- 1. Seller details + refund policy on each store, shown on the store
--    page and in the buyer's receipt email. A store can't take payments
--    until the trading name, contact email and refund policy are filled
--    in (enforced in lib/store/server.ts, canSell).
--
-- 2. Consent at checkout: buyers must tick that they want the programme
--    straight away and understand they lose the 14-day right to cancel
--    once it's delivered, and agree to the refund policy. We keep when
--    they agreed and the exact wording on the purchase.
--
-- update_store_settings() (0126) is replaced with a version that also
-- saves the new fields.
-- ============================================================

alter table organisations
  add column if not exists store_trading_name text,
  add column if not exists store_contact_email text,
  add column if not exists store_contact_phone text,
  add column if not exists store_business_address text,
  add column if not exists store_refund_policy text;

alter table programme_purchases
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_text text;

drop function if exists update_store_settings(text, text, text);

create or replace function update_store_settings(
  p_slug text,
  p_name text,
  p_description text,
  p_trading_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_business_address text default null,
  p_refund_policy text default null
)
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
         store_description = left(trim(coalesce(p_description, '')), 2000),
         store_trading_name = nullif(left(trim(coalesce(p_trading_name, '')), 120), ''),
         store_contact_email = nullif(left(lower(trim(coalesce(p_contact_email, ''))), 200), ''),
         store_contact_phone = nullif(left(trim(coalesce(p_contact_phone, '')), 40), ''),
         store_business_address = nullif(left(trim(coalesce(p_business_address, '')), 400), ''),
         store_refund_policy = nullif(left(trim(coalesce(p_refund_policy, '')), 4000), '')
   where id = v_org;
end;
$$;
revoke execute on function public.update_store_settings(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_store_settings(text, text, text, text, text, text, text, text) to authenticated;
