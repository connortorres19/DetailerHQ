-- Phase 8: DetailerHQ subscription billing (Stripe, TEST MODE during development).
--
-- DetailerHQ charges detailing businesses for the software. It never processes payments between a
-- business and its customers, and doesn't use Stripe Connect.
--
--   Founding 5   $30 once, lifetime, limited to five successful purchases across the platform.
--   Standard     $30/month. A card is required to start the 3-day free trial (authorized at Stripe
--                Checkout); nothing is charged during the trial; Stripe bills $30 at the trial end and
--                monthly after, unless cancelled. Failed payment: 7 days' grace, then read-only.
--
-- Founding protection is structural: founding_slots has exactly five rows (created here; inserts and
-- deletes are refused afterwards). Buying reserves one row atomically (FOR UPDATE SKIP LOCKED);
-- only a Stripe-confirmed payment (verified webhook → billing_api, server-checked amount/currency/
-- price) can claim it, and a claimed row can never be released, reassigned or deleted — not on
-- refund, cancellation, closure or account deletion (the business link is cleared, the claim stays).
-- A reservation is released only when Stripe reports its Checkout session expired.
--
-- Access: account_status is changed only by app.apply_billing_state (from server-verified billing
-- data) and by the existing operator/activation paths. Read-only states use the existing can_write
-- rules (RLS + every workflow function), so no business or customer data is ever deleted (D-18).
-- Existing pilot businesses are untouched until they choose a plan.

create type public.billing_plan as enum ('founding', 'standard');

-- ---------------------------------------------------------------------------
-- Founding slots: exactly five, ever.
-- ---------------------------------------------------------------------------
create table public.founding_slots (
  slot smallint primary key check (slot between 1 and 5),
  state text not null default 'available' check (state in ('available', 'reserved', 'claimed')),
  business_id uuid references public.businesses (id) on delete set null,
  checkout_session_id text unique check (char_length(checkout_session_id) <= 255),
  reserved_until timestamptz,
  claimed_at timestamptz,
  stripe_payment_intent text check (char_length(stripe_payment_intent) <= 255),
  amount_cents integer,
  currency text,
  refunded_at timestamptz,
  disputed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (state <> 'available' or (business_id is null and checkout_session_id is null and claimed_at is null)),
  check (state <> 'reserved' or (business_id is not null and reserved_until is not null and claimed_at is null)),
  check (state <> 'claimed' or (claimed_at is not null and amount_cents = 3000 and currency = 'usd' and checkout_session_id is not null))
);
-- One reservation or claim per business.
create unique index founding_slots_one_per_business on public.founding_slots (business_id) where business_id is not null;
insert into public.founding_slots (slot) select generate_series(1, 5);

create function app.tg_founding_slot_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op in ('INSERT', 'DELETE') then
    raise exception 'founding slots are fixed (exactly five)' using errcode = 'DH002';
  end if;
  if old.state = 'claimed' then
    -- A claim is permanent. Only the business link may be cleared (account deletion) and refund /
    -- dispute dates recorded.
    if new.state <> 'claimed' or new.checkout_session_id is distinct from old.checkout_session_id
       or new.claimed_at is distinct from old.claimed_at or new.amount_cents is distinct from old.amount_cents
       or new.currency is distinct from old.currency or new.stripe_payment_intent is distinct from old.stripe_payment_intent
       or (new.business_id is distinct from old.business_id and new.business_id is not null) then
      raise exception 'a claimed founding spot can never be released or reassigned' using errcode = 'DH002';
    end if;
  elsif old.state = 'reserved' and new.business_id is null and new.state = 'reserved' then
    -- The business was deleted mid-checkout: the reservation ends (a late payment is refunded).
    new.state := 'available';
    new.checkout_session_id := null;
    new.reserved_until := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;
create trigger founding_slot_guard before insert or update or delete on public.founding_slots
  for each row execute function app.tg_founding_slot_guard();

create function app.tg_founding_no_truncate() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp
as $$ begin raise exception 'founding slots are fixed (exactly five)' using errcode = 'DH002'; end $$;
create trigger founding_slot_no_truncate before truncate on public.founding_slots
  for each statement execute function app.tg_founding_no_truncate();

-- ---------------------------------------------------------------------------
-- Per-business billing (written only by billing_api; owners read their own).
-- ---------------------------------------------------------------------------
create table public.business_billing (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan public.billing_plan,
  stripe_customer_id text unique check (char_length(stripe_customer_id) <= 255),
  stripe_subscription_id text unique check (char_length(stripe_subscription_id) <= 255),
  subscription_status text check (subscription_status in
    ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  has_payment_method boolean not null default false,
  past_due_since timestamptz,
  trial_used boolean not null default false,
  ever_paid boolean not null default false,
  founding_slot smallint unique references public.founding_slots (slot),
  founding_access_revoked_at timestamptz,
  founding_revoked_reason text check (char_length(founding_revoked_reason) <= 300),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (plan is distinct from 'founding' or founding_slot is not null)
);

-- Every Stripe event, once (idempotency) — with the outcome for support.
create table public.billing_events (
  id text primary key check (char_length(id) <= 255),
  type text not null check (char_length(type) <= 100),
  stripe_created timestamptz,
  business_id uuid references public.businesses (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text check (char_length(outcome) <= 100),
  error text check (char_length(error) <= 500),
  attempts integer not null default 0
);

alter table public.founding_slots enable row level security;
alter table public.business_billing enable row level security;
alter table public.billing_events enable row level security;
create policy members_select on public.business_billing for select to authenticated using (app.is_member(business_id));
grant select on public.business_billing to authenticated;
-- founding_slots and billing_events: no owner access at all (counts via functions below).

-- ---------------------------------------------------------------------------
-- Access rules: the one place billing sets account_status.
-- ---------------------------------------------------------------------------
create function app.billing_account_status(p_business uuid) returns public.account_status
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  b public.businesses;
  k public.business_billing;
begin
  select * into b from public.businesses where id = p_business;
  if b.id is null then return null; end if;
  -- Onboarding, operator suspension and closure are never changed by billing.
  if b.account_status in ('pending_activation', 'suspended', 'closing') then return b.account_status; end if;
  select * into k from public.business_billing where business_id = p_business;
  if k.business_id is null or k.plan is null then return b.account_status; end if;  -- e.g. pilot: unchanged
  if k.plan = 'founding' then
    return (case when k.founding_access_revoked_at is null then 'active' else 'inactive' end)::public.account_status;
  end if;
  return case k.subscription_status
    when 'trialing' then case when k.trial_ends_at is null or k.trial_ends_at > now() then 'trialing'
                              when k.has_payment_method then 'active' else 'trial_expired' end
    when 'active' then case when not k.cancel_at_period_end then 'active'
                            when k.current_period_end > now() then 'cancelled' else 'inactive' end
    when 'past_due' then case when k.past_due_since > now() - interval '7 days' then 'past_due' else 'inactive' end
    when 'incomplete' then case when k.ever_paid then 'inactive' else b.account_status::text end
    else case when k.ever_paid then 'inactive' else 'trial_expired' end  -- canceled, unpaid, incomplete_expired, paused
  end::public.account_status;
end
$$;

create function app.apply_billing_state(p_business uuid) returns public.account_status
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_new public.account_status := app.billing_account_status(p_business);
  k public.business_billing;
begin
  if v_new is null then return null; end if;
  select * into k from public.business_billing where business_id = p_business;
  -- Operator and onboarding states, and businesses without a plan (pilots), are left exactly as they are.
  if k.plan is null or v_new in ('pending_activation', 'suspended', 'closing') then return v_new; end if;
  update public.businesses
     set account_status = v_new,
         access_restricted_at = case when v_new in ('trial_expired', 'inactive') then coalesce(access_restricted_at, now()) else null end,
         trial_ends_at = case when k.plan = 'standard' and k.trial_ends_at is not null then k.trial_ends_at else trial_ends_at end,
         trial_started_at = case when k.plan = 'standard' and k.trial_ends_at is not null
                                 then coalesce(trial_started_at, now()) else trial_started_at end
   where id = p_business
     and (account_status is distinct from v_new
          or (k.plan = 'standard' and k.trial_ends_at is not null and trial_ends_at is distinct from k.trial_ends_at)
          or (v_new not in ('trial_expired', 'inactive') and access_restricted_at is not null));
  return v_new;
end
$$;

-- Time-based changes (grace period over, paid period over, trial over) without waiting for Stripe.
create function app.billing_tick() returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_id uuid; v_n integer := 0;
begin
  for v_id in select k.business_id from public.business_billing k join public.businesses b on b.id = k.business_id
               where k.plan is not null and b.account_status is distinct from app.billing_account_status(k.business_id) loop
    perform app.apply_billing_state(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;
select cron.schedule('detailerhq-billing-tick', '*/15 * * * *', 'select app.billing_tick()');

-- Remaining founding spots — real counts from the five rows.
create function app.founding_availability_impl() returns jsonb
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'total', 5,
    'claimed', count(*) filter (where state = 'claimed'),
    'in_checkout', count(*) filter (where state = 'reserved'),
    'remaining', 5 - count(*) filter (where state = 'claimed'),
    'open', count(*) filter (where state = 'available'))
  from public.founding_slots
$$;
create function public.founding_availability() returns jsonb language sql stable security invoker set search_path = pg_catalog, pg_temp
as $$ select app.founding_availability_impl() $$;
create function public_api.founding_availability() returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp
as $$ select app.founding_availability_impl() $$;

-- ---------------------------------------------------------------------------
-- Owner: reserve a founding spot (before the server creates the Stripe Checkout session).
-- Allowed for read-only accounts too (buying is how they regain access).
-- ---------------------------------------------------------------------------
create function app.start_founding_reservation_impl() returns smallint
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_slot smallint;
  k public.business_billing;
begin
  perform app.require_member(v_business, false);
  select * into k from public.business_billing where business_id = v_business;
  if k.founding_slot is not null or exists (select 1 from public.founding_slots where business_id = v_business and state = 'claimed') then
    raise exception 'this business already has a founding membership' using errcode = 'DH002', detail = 'already_founding';
  end if;
  -- Already reserved (e.g. a second click): keep the same spot; the server replaces the session.
  select slot into v_slot from public.founding_slots where business_id = v_business and state = 'reserved' for update;
  if v_slot is not null then
    update public.founding_slots set reserved_until = greatest(reserved_until, now() + interval '10 minutes') where slot = v_slot;
    return v_slot;
  end if;
  -- An open spot — or one whose reservation never got a Checkout session (server failed before
  -- creating it). A reservation with a session is released only when Stripe says it expired.
  select slot into v_slot from public.founding_slots
   where state = 'available' or (state = 'reserved' and checkout_session_id is null and reserved_until < now())
   order by slot limit 1 for update skip locked;
  if v_slot is null then
    raise exception 'no founding spots are available' using errcode = 'DH002',
      detail = case when exists (select 1 from public.founding_slots where state = 'reserved') then 'in_checkout' else 'sold_out' end;
  end if;
  update public.founding_slots
     set state = 'reserved', business_id = v_business, checkout_session_id = null, reserved_until = now() + interval '10 minutes'
   where slot = v_slot;
  return v_slot;
exception when unique_violation then
  raise exception 'a founding checkout is already in progress' using errcode = 'DH002', detail = 'in_progress';
end
$$;
create function public.start_founding_reservation() returns smallint language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.start_founding_reservation_impl() $$;

-- ---------------------------------------------------------------------------
-- Operator only (no grants): founding access is removed or restored only by an explicit
-- administrative decision. The spot itself is never reopened.
-- ---------------------------------------------------------------------------
create function app.revoke_founding_access(p_business uuid, p_reason text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required'; end if;
  update public.business_billing set founding_access_revoked_at = now(), founding_revoked_reason = left(p_reason, 300), updated_at = now()
   where business_id = p_business and plan = 'founding';
  if not found then raise exception 'not a founding member'; end if;
  perform app.apply_billing_state(p_business);
end
$$;
create function app.restore_founding_access(p_business uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.business_billing set founding_access_revoked_at = null, founding_revoked_reason = null, plan = 'founding', updated_at = now()
   where business_id = p_business and founding_slot is not null;
  if not found then raise exception 'not a founding member'; end if;
  perform app.apply_billing_state(p_business);
end
$$;

-- ---------------------------------------------------------------------------
-- Billing API (role billing_worker: the server's Stripe code; never owners or the public).
-- Every call is made after the server verified the Stripe webhook signature or re-fetched the
-- object from Stripe with its secret key.
-- ---------------------------------------------------------------------------
create schema billing_api;
revoke all on schema billing_api from public;

create function billing_api.billing_for(p_business uuid)
returns table (plan public.billing_plan, stripe_customer_id text, stripe_subscription_id text, subscription_status text,
               trial_used boolean, founding_slot smallint, founding_access_revoked_at timestamptz, account_status public.account_status,
               business_name text, business_email text)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select k.plan, k.stripe_customer_id, k.stripe_subscription_id, k.subscription_status, coalesce(k.trial_used, false), k.founding_slot,
         k.founding_access_revoked_at, b.account_status, b.name, b.email::text
    from public.businesses b left join public.business_billing k on k.business_id = b.id
   where b.id = p_business
$$;

create function billing_api.business_for_customer(p_customer text) returns uuid
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$ select business_id from public.business_billing where stripe_customer_id = p_customer $$;

-- The Stripe customer made for a business (once; never moved to another business).
create function billing_api.set_customer(p_business uuid, p_customer text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_current text;
begin
  insert into public.business_billing (business_id, stripe_customer_id) values (p_business, p_customer)
  on conflict (business_id) do update set stripe_customer_id = coalesce(business_billing.stripe_customer_id, excluded.stripe_customer_id), updated_at = now()
  returning stripe_customer_id into v_current;
  if v_current <> p_customer then
    raise exception 'business already has a different Stripe customer' using errcode = 'DH002';
  end if;
end
$$;

create function billing_api.attach_founding_session(p_business uuid, p_slot smallint, p_session text, p_expires timestamptz) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.founding_slots set checkout_session_id = p_session, reserved_until = p_expires
   where slot = p_slot and business_id = p_business and state = 'reserved';
  if not found then raise exception 'reservation not found' using errcode = 'DH002'; end if;
end
$$;

-- Release only when Stripe confirms the session can no longer be paid (expired), or when no
-- session was ever created (p_session null).
create function billing_api.release_founding(p_slot smallint, p_session text) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.founding_slots set state = 'available', business_id = null, checkout_session_id = null, reserved_until = null
   where slot = p_slot and state = 'reserved'
     and (checkout_session_id = p_session or (p_session is null and checkout_session_id is null));
  return found;
end
$$;

create function billing_api.founding_reservation(p_session text)
returns table (slot smallint, state text, business_id uuid)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$ select slot, state, business_id from public.founding_slots where checkout_session_id = p_session $$;

-- The business's current reservation (to replace its Checkout session on a second click).
create function billing_api.founding_reservation_for(p_business uuid)
returns table (slot smallint, checkout_session_id text)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$ select slot, checkout_session_id from public.founding_slots where business_id = p_business and state = 'reserved' $$;

-- Reservations whose Checkout session should have expired (webhook missed): the server asks Stripe.
create function billing_api.stale_founding_reservations()
returns table (slot smallint, checkout_session_id text, business_id uuid)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select slot, checkout_session_id, business_id from public.founding_slots
   where state = 'reserved' and checkout_session_id is not null and reserved_until < now()
$$;

-- Claim after Stripe confirmed payment. Outcomes: claimed | already_claimed | not_reserved
-- (the server refunds a payment that has no matching reservation).
create function billing_api.claim_founding(p_session text, p_business uuid, p_payment_intent text, p_amount integer, p_currency text)
returns table (outcome text, slot smallint, cancel_subscription text)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.founding_slots;
begin
  select * into s from public.founding_slots f where f.checkout_session_id = p_session for update;
  if s.slot is not null and s.state = 'claimed' then
    return query select 'already_claimed'::text, s.slot, null::text; return;
  end if;
  if s.slot is null or s.state <> 'reserved' or s.business_id is distinct from p_business
     or p_amount <> 3000 or lower(p_currency) <> 'usd' then
    return query select 'not_reserved'::text, s.slot, null::text; return;
  end if;
  update public.founding_slots
     set state = 'claimed', claimed_at = now(), stripe_payment_intent = p_payment_intent, amount_cents = p_amount,
         currency = lower(p_currency), reserved_until = null
   where founding_slots.slot = s.slot;
  insert into public.business_billing (business_id, plan, founding_slot) values (p_business, 'founding', s.slot)
  on conflict (business_id) do update set plan = 'founding', founding_slot = excluded.founding_slot,
    founding_access_revoked_at = null, founding_revoked_reason = null, updated_at = now();
  -- A founding member is never billed again: any trial/subscription is cancelled by the server.
  perform app.apply_billing_state(p_business);
  return query select 'claimed'::text, s.slot,
    (select stripe_subscription_id from public.business_billing k where k.business_id = p_business
      and k.subscription_status in ('trialing', 'active', 'past_due', 'incomplete', 'unpaid', 'paused'));
end
$$;

-- The latest subscription state, re-fetched from Stripe. Outcomes:
--   ok | cancel_founding (business is a founding member: cancel it, never charge)
--   | duplicate (another live subscription exists: cancel this one) | ignored (an old one ended)
create function billing_api.sync_subscription(p_business uuid, p_customer text, p_subscription text, p_status text,
                                              p_trial_end timestamptz, p_period_end timestamptz, p_cancel_at_period_end boolean,
                                              p_has_payment_method boolean)
returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  k public.business_billing;
  v_live boolean := p_status in ('trialing', 'active', 'past_due', 'incomplete', 'unpaid', 'paused');
begin
  select * into k from public.business_billing where business_id = p_business for update;
  if k.business_id is null or k.stripe_customer_id is distinct from p_customer then
    raise exception 'subscription does not belong to this business' using errcode = 'DH002';
  end if;
  if k.plan = 'founding' and k.founding_access_revoked_at is null then
    return case when v_live then 'cancel_founding' else 'ignored' end;
  end if;
  if k.stripe_subscription_id is not null and k.stripe_subscription_id <> p_subscription then
    if k.subscription_status in ('trialing', 'active', 'past_due') and v_live then return 'duplicate'; end if;
    if not v_live then return 'ignored'; end if;
  end if;
  update public.business_billing
     set plan = 'standard', stripe_subscription_id = p_subscription, subscription_status = p_status,
         trial_ends_at = p_trial_end, current_period_end = p_period_end, cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
         has_payment_method = coalesce(p_has_payment_method, false),
         past_due_since = case when p_status = 'past_due' then coalesce(past_due_since, now()) else null end,
         trial_used = trial_used or p_trial_end is not null,
         ever_paid = ever_paid or p_status in ('active', 'past_due') and (p_trial_end is null or p_trial_end <= now()),
         last_synced_at = now(), updated_at = now()
   where business_id = p_business;
  perform app.apply_billing_state(p_business);
  return 'ok';
end
$$;

-- A paid invoice proves a successful charge (also ends past-due).
create function billing_api.mark_paid(p_business uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.business_billing set ever_paid = true, updated_at = now() where business_id = p_business and plan = 'standard';
  perform app.apply_billing_state(p_business);
end
$$;

-- Refunds and disputes are recorded only: they never reopen a spot or remove access automatically.
create function billing_api.record_founding_refund(p_payment_intent text, p_disputed boolean) returns smallint
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_slot smallint;
begin
  update public.founding_slots
     set refunded_at = case when p_disputed then refunded_at else coalesce(refunded_at, now()) end,
         disputed_at = case when p_disputed then coalesce(disputed_at, now()) else disputed_at end
   where stripe_payment_intent = p_payment_intent and state = 'claimed'
  returning slot into v_slot;
  return v_slot;
end
$$;

-- Event idempotency: true = process it (new, or an earlier attempt failed).
create function billing_api.begin_event(p_id text, p_type text, p_created timestamptz) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_done timestamptz;
begin
  insert into public.billing_events (id, type, stripe_created, attempts) values (p_id, left(p_type, 100), p_created, 1)
  on conflict (id) do update set attempts = billing_events.attempts + 1
  returning processed_at into v_done;
  return v_done is null;
end
$$;

create function billing_api.finish_event(p_id text, p_business uuid, p_outcome text, p_error text) returns void
language sql security definer set search_path = pg_catalog, pg_temp
as $$
  update public.billing_events
     set business_id = coalesce(p_business, business_id), outcome = left(p_outcome, 100), error = left(p_error, 500),
         processed_at = case when p_error is null then now() end
   where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Roles and privileges
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'billing_worker') then
    create role billing_worker nologin noinherit;
  end if;
end
$$;
grant usage on schema billing_api to billing_worker;

revoke all on function
  app.tg_founding_slot_guard(), app.tg_founding_no_truncate(), app.billing_account_status(uuid), app.apply_billing_state(uuid),
  app.billing_tick(), app.founding_availability_impl(), public.founding_availability(), public_api.founding_availability(),
  app.start_founding_reservation_impl(), public.start_founding_reservation(),
  app.revoke_founding_access(uuid, text), app.restore_founding_access(uuid),
  billing_api.billing_for(uuid), billing_api.business_for_customer(text), billing_api.set_customer(uuid, text),
  billing_api.attach_founding_session(uuid, smallint, text, timestamptz), billing_api.release_founding(smallint, text),
  billing_api.founding_reservation(text), billing_api.founding_reservation_for(uuid), billing_api.stale_founding_reservations(),
  billing_api.claim_founding(text, uuid, text, integer, text),
  billing_api.sync_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean),
  billing_api.mark_paid(uuid), billing_api.record_founding_refund(text, boolean),
  billing_api.begin_event(text, text, timestamptz), billing_api.finish_event(text, uuid, text, text)
from public, anon, authenticated, service_role;

grant execute on function app.founding_availability_impl(), public.founding_availability(),
  app.start_founding_reservation_impl(), public.start_founding_reservation() to authenticated;
grant execute on function public_api.founding_availability() to booking_api;
grant execute on function
  billing_api.billing_for(uuid), billing_api.business_for_customer(text), billing_api.set_customer(uuid, text),
  billing_api.attach_founding_session(uuid, smallint, text, timestamptz), billing_api.release_founding(smallint, text),
  billing_api.founding_reservation(text), billing_api.founding_reservation_for(uuid), billing_api.stale_founding_reservations(),
  billing_api.claim_founding(text, uuid, text, integer, text),
  billing_api.sync_subscription(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean),
  billing_api.mark_paid(uuid), billing_api.record_founding_refund(text, boolean),
  billing_api.begin_event(text, text, timestamptz), billing_api.finish_event(text, uuid, text, text)
to billing_worker;
