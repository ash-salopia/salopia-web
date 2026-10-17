-- ============================================================
-- 0124_programme_store.sql
-- ============================================================
-- Online Programme Store: coaches sell programmes (e.g. "12-week
-- rugby S&C") through their own Stripe account (Stripe Connect,
-- Express). VIS BUILD takes no fee for now.
--
-- Flow: buyer pays on the coach's public store page (or inside their
-- athlete app) -> Stripe Checkout on the coach's connected account ->
-- on payment we find or create the athlete (new buyers DO use a seat),
-- record the purchase and add the programme to their library
-- (athlete_programmes). The athlete starts it from their app when
-- ready, which puts the sessions on their calendar from that date.
--
-- All buyer-facing reads/writes go through service-role API routes
-- (no login for buyers/athletes); RLS below is for the coach side.
-- ============================================================

alter table organisations
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists store_slug text,
  add column if not exists store_name text,
  add column if not exists store_description text not null default '',
  add column if not exists store_seat_warned_at timestamptz,
  add column if not exists store_seat_warn_level int; -- 90 = "nearly full" sent, 100 = "full" sent

create unique index if not exists organisations_store_slug_key on organisations (lower(store_slug)) where store_slug is not null;
create unique index if not exists organisations_connect_account_key on organisations (stripe_connect_account_id) where stripe_connect_account_id is not null;

create table if not exists store_products (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  programme_id    uuid not null references programmes(id) on delete restrict,
  created_by      uuid references coaches(id) on delete set null,
  title           text not null,
  description     text not null default '',
  price_pence     int  not null check (price_pence >= 50),
  currency        text not null default 'gbp',
  active          boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists store_products_org_idx on store_products(organisation_id);

create table if not exists programme_purchases (
  id                         uuid primary key default gen_random_uuid(),
  organisation_id            uuid not null references organisations(id) on delete cascade,
  product_id                 uuid references store_products(id) on delete set null,
  programme_id               uuid references programmes(id) on delete set null,
  athlete_id                 uuid references athletes(id) on delete set null,
  buyer_name                 text not null default '',
  buyer_email                text not null default '',
  amount_pence               int  not null,
  currency                   text not null default 'gbp',
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id   text,
  status                     text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  failure_reason             text,
  created_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  refunded_at                timestamptz
);
create index if not exists programme_purchases_org_idx on programme_purchases(organisation_id, created_at desc);

-- The athlete's programme library. One row per programme they own;
-- 'ready' until they press Start, then 'active' with a start_date.
create table if not exists athlete_programmes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  athlete_id      uuid not null references athletes(id) on delete cascade,
  programme_id    uuid not null references programmes(id) on delete restrict,
  purchase_id     uuid references programme_purchases(id) on delete set null,
  title           text not null,
  source          text not null default 'purchase' check (source in ('purchase', 'coach')),
  status          text not null default 'ready' check (status in ('ready', 'active', 'completed')),
  start_date      date,
  started_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists athlete_programmes_athlete_idx on athlete_programmes(athlete_id);
create unique index if not exists athlete_programmes_purchase_key on athlete_programmes(purchase_id) where purchase_id is not null;

alter table store_products enable row level security;
alter table programme_purchases enable row level security;
alter table athlete_programmes enable row level security;

drop policy if exists "Org members manage store products" on store_products;
create policy "Org members manage store products" on store_products
  for all using (organisation_id = my_organisation_id())
  with check (organisation_id = my_organisation_id());

-- Sales are written by the payment webhook (service role) only.
drop policy if exists "Org members read programme purchases" on programme_purchases;
create policy "Org members read programme purchases" on programme_purchases
  for select using (organisation_id = my_organisation_id());

drop policy if exists "Coaches manage athlete programmes" on athlete_programmes;
create policy "Coaches manage athlete programmes" on athlete_programmes
  for all using (coach_can_access_athlete(athlete_id))
  with check (coach_can_access_athlete(athlete_id) and organisation_id = my_organisation_id());
