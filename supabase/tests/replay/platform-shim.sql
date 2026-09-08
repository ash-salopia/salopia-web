-- Minimal Supabase platform shim so the app's migrations can run on a
-- vanilla Postgres. Only what the migrations actually touch.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if;
  if not exists (select from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser; end if;
end $$;

-- ── auth schema ──────────────────────────────────────────────
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;

create or replace function auth.email() returns text
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

-- ── storage schema ───────────────────────────────────────────
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb default '{}'
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

create or replace function storage.filename(name text) returns text
  language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

-- ── realtime publication ─────────────────────────────────────
do $$ begin
  if not exists (select from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema auth, storage to anon, authenticated, service_role;

-- Supabase auto-grants DML on every new public table to these roles
-- (RLS then does the actual filtering). Reproduce that.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
