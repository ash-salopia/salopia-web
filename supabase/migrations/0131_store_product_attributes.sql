-- ============================================================
-- 0131_store_product_attributes.sql
-- ============================================================
-- Lets buyers filter the public Programme Store and use the "Find your
-- ideal programme" questions. Each listed programme can say who it's
-- for. All optional - a product with none of these set still shows,
-- it just can't be matched on them.
--
-- Values are fixed keys from lib/store/match.ts (the labels live in
-- code so wording can change without a migration):
--   level      beginner | intermediate | advanced
--   equipment  what the programme NEEDS: none, bands, dumbbells,
--              kettlebells, barbell, gym
--   goals      strength, muscle, power, fitness, weight, sport,
--              rehab, mobility
--   tags       "suitable for": back, knee, shoulder, low_impact
-- ============================================================

alter table store_products
  add column if not exists age_min int check (age_min between 5 and 100),
  add column if not exists age_max int check (age_max between 5 and 100),
  add column if not exists level text check (level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists equipment text[] not null default '{}',
  add column if not exists goals text[] not null default '{}',
  add column if not exists tags text[] not null default '{}';
