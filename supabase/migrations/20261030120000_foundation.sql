-- DetailerHQ — Phase 1, migration 1: schemas, default privileges, extensions, enums, roles.
-- Decisions: D-21 (restricted public endpoint), D-22 (explicit privileges), REC-25 (no
-- SECURITY DEFINER functions in exposed schemas). Evidence: docs/verification/PHASE0_DOCUMENTATION_REVIEW.md.

-- ---------------------------------------------------------------------------
-- Default privileges (D-22)
-- Supabase grants table/sequence/function privileges in `public` to anon,
-- authenticated and service_role by default, and PostgreSQL grants EXECUTE on
-- new functions to PUBLIC through a global default. Revoke all of it so every
-- object must be granted explicitly.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Schemas
--   public      exposed through the Data API: tables (RLS) + SECURITY INVOKER wrappers
--   app         not exposed: helpers, triggers, SECURITY DEFINER implementations
--   public_api  not exposed: functions for the restricted public booking role
-- ---------------------------------------------------------------------------
create schema if not exists app;
create schema if not exists public_api;
revoke all on schema app from public;
revoke all on schema public_api from public;

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Restricted public booking role (D-21, REC-13)
-- Created without LOGIN. Each environment enables login and sets a password out
-- of band (never committed), e.g.:
--   alter role booking_api with login password '<generated>';
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'booking_api') then
    create role booking_api nologin noinherit nobypassrls connection limit 10;
  end if;
end
$$;
alter role booking_api set statement_timeout = '5s';
alter role booking_api set search_path = '';
grant usage on schema public_api to booking_api;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.service_mode as enum ('mobile', 'shop', 'both');
create type public.account_status as enum (
  'pending_activation', 'pilot', 'trialing', 'active', 'past_due',
  'trial_expired', 'inactive', 'cancelled', 'suspended', 'closing'
);
create type public.membership_role as enum ('owner');
create type public.price_type as enum ('fixed', 'starting_at', 'quote_required');
create type public.resource_kind as enum ('general', 'bay', 'staff', 'equipment');
create type public.block_kind as enum ('appointment', 'hold', 'proposal');
create type public.request_status as enum (
  'pending', 'time_proposed', 'approved', 'declined', 'proposal_declined',
  'withdrawn', 'expired', 'closed_duplicate'
);
create type public.appointment_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.location_type as enum ('mobile', 'shop');
create type public.contact_preference as enum ('call', 'text', 'email');
create type public.lead_status as enum ('new', 'contacted', 'quote_sent', 'follow_up_due', 'booked', 'lost');
create type public.lead_source as enum (
  'booking_page', 'phone', 'text', 'instagram', 'facebook', 'google',
  'referral', 'walk_in', 'repeat', 'other'
);
create type public.lost_reason as enum ('price', 'timing', 'went_elsewhere', 'no_response', 'not_a_fit', 'other');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type public.cancelled_by as enum ('customer', 'business');
create type public.payment_note as enum ('not_recorded', 'unpaid', 'paid_cash', 'paid_card', 'paid_transfer', 'paid_other');
create type public.actor_type as enum ('owner', 'customer', 'system', 'operator');

-- ---------------------------------------------------------------------------
-- Small immutable helpers used by check constraints
-- ---------------------------------------------------------------------------
create function app.is_us_timezone(tz text) returns boolean
language sql immutable parallel safe set search_path = ''
as $$
  select tz = any (array[
    'America/New_York', 'America/Detroit', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello',
    'America/Indiana/Indianapolis', 'America/Indiana/Vincennes', 'America/Indiana/Winamac',
    'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay',
    'America/Chicago', 'America/Indiana/Tell_City', 'America/Indiana/Knox', 'America/Menominee',
    'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/North_Dakota/Beulah',
    'America/Denver', 'America/Boise', 'America/Phoenix', 'America/Los_Angeles',
    'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla',
    'America/Yakutat', 'America/Nome', 'America/Adak', 'Pacific/Honolulu'
  ])
$$;

create function app.is_valid_us_phone(p text) returns boolean
language sql immutable parallel safe set search_path = ''
as $$ select p ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' $$;

create function app.is_valid_email(e text) returns boolean
language sql immutable parallel safe set search_path = ''
as $$ select char_length(e) <= 254 and e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' $$;

create function app.is_valid_block_range(r tstzrange) returns boolean
language sql immutable parallel safe set search_path = ''
as $$
  select not isempty(r) and lower_inc(r) and not upper_inc(r)
     and not lower_inf(r) and not upper_inf(r)
     and upper(r) - lower(r) between interval '15 minutes' and interval '72 hours'
$$;
