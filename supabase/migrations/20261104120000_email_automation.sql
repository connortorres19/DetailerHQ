-- Phase 7: email automation. Each business sends from its own mailbox (Gmail / Google Workspace or
-- Outlook / Microsoft 365 through OAuth, or its own domain through SMTP). No shared DetailerHQ
-- sender, no SMS. Businesses without a verified connection keep every feature; emails just aren't
-- queued.
--
-- Reliability: triggers queue emails in the same transaction as the change that causes them
-- (never for a change that rolled back, never missed for one that committed), with a unique
-- idempotency key per (event, recipient) so retries and repeated events can't send twice. Queueing
-- can never break the change itself (errors become warnings). A worker (role email_worker, used only
-- by the server) claims due jobs with SKIP LOCKED, sends them, and retries with backoff; failures
-- are visible to the owner with a retry button.
--
-- Secrets: OAuth refresh tokens and SMTP passwords are encrypted by the server (AES-256-GCM, key
-- only in the server environment) before they reach the database; owners can't even read the
-- ciphertext column. Only the worker role can.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.email_provider as enum ('google', 'microsoft', 'smtp');
create type public.email_connection_status as enum ('pending', 'verified', 'needs_attention');
create type public.email_status as enum ('queued', 'sending', 'sent', 'failed', 'held', 'skipped', 'cancelled');
create type public.email_template as enum (
  -- customers
  'request_received', 'booking_confirmed', 'booking_declined', 'time_proposed', 'proposal_accepted',
  'proposal_declined', 'booking_rescheduled', 'booking_cancelled', 'appointment_reminder',
  'quote_sent', 'quote_accepted', 'quote_declined', 'quote_expiring', 'quote_expired',
  -- owners
  'owner_new_request', 'owner_new_appointment', 'owner_new_lead', 'owner_customer_response',
  'owner_daily_summary', 'owner_overdue_followups',
  -- system
  'connection_test');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.email_connections (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  provider public.email_provider not null,
  from_address citext not null check (char_length(from_address) <= 254 and from_address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  from_name text check (char_length(from_name) <= 80),
  status public.email_connection_status not null default 'pending',
  secret bytea not null check (octet_length(secret) between 29 and 8192),   -- AES-GCM envelope from the server
  smtp_host text check (char_length(smtp_host) <= 253),
  smtp_port integer check (smtp_port in (465, 587, 2525)),
  smtp_username text check (char_length(smtp_username) <= 254),
  verification_hash bytea,
  verification_expires_at timestamptz,
  verification_attempts integer not null default 0,
  verified_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  last_error_at timestamptz,
  last_sent_at timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((provider = 'smtp') = (smtp_host is not null and smtp_port is not null and smtp_username is not null)),
  check (status <> 'verified' or verified_at is not null)
);

create table public.email_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  reminder_hours integer[] not null default '{24}'
    check (cardinality(reminder_hours) <= 2 and reminder_hours <@ array[2, 4, 12, 24, 48, 72]),
  daily_limit integer not null default 300 check (daily_limit between 10 and 1000),
  updated_at timestamptz not null default now()
);

create table public.email_template_settings (
  business_id uuid not null references public.businesses (id) on delete cascade,
  template public.email_template not null,
  enabled boolean not null default true,
  subject text check (char_length(subject) between 1 and 150),
  intro text check (char_length(intro) between 1 and 1000),
  signoff text check (char_length(signoff) between 1 and 300),
  updated_at timestamptz not null default now(),
  primary key (business_id, template)
);

create table public.email_owner_prefs (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}' check (jsonb_typeof(prefs) = 'object'),
  summary_hour integer not null default 7 check (summary_hour between 0 and 23),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  template public.email_template not null,
  category text not null default 'transactional' check (category in ('transactional', 'follow_up', 'owner', 'system')),
  recipient citext not null check (char_length(recipient) <= 254),
  refs jsonb not null default '{}' check (jsonb_typeof(refs) = 'object'),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  status public.email_status not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text check (char_length(last_error) <= 300),
  provider_message_id text check (char_length(provider_message_id) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status in ('queued', 'sending');
create index email_outbox_business_idx on public.email_outbox (business_id, created_at desc);

-- Customers who unsubscribed from a business's non-essential emails (quote follow-ups).
create table public.email_suppressions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  email citext not null,
  category text not null check (category in ('follow_up')),
  created_at timestamptz not null default now(),
  primary key (business_id, email, category)
);

do $$
declare t text;
begin
  foreach t in array array['email_connections', 'email_settings', 'email_template_settings', 'email_owner_prefs', 'email_outbox'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.tg_touch_updated_at()', t);
  end loop;
  foreach t in array array['email_connections', 'email_settings', 'email_template_settings', 'email_owner_prefs', 'email_outbox', 'email_suppressions'] loop
    execute format('create trigger immutable_business_id before update on public.%I for each row execute function app.tg_immutable_business_id()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end
$$;

-- Owners read their business's rows; the credential ciphertext and verification hash are never readable.
create policy members_select on public.email_connections for select to authenticated using (app.is_member(business_id));
create policy members_select on public.email_settings for select to authenticated using (app.is_member(business_id));
create policy members_select on public.email_template_settings for select to authenticated using (app.is_member(business_id));
create policy members_select on public.email_outbox for select to authenticated using (app.is_member(business_id));
create policy members_select on public.email_suppressions for select to authenticated using (app.is_member(business_id));
create policy own_select on public.email_owner_prefs for select to authenticated
  using (user_id = (select auth.uid()) and app.is_member(business_id));
grant select (business_id, provider, from_address, from_name, status, smtp_host, smtp_port, smtp_username, verification_expires_at,
              verified_at, last_error, last_error_at, last_sent_at, connected_by, created_at, updated_at)
  on public.email_connections to authenticated;
grant select on public.email_settings, public.email_template_settings, public.email_owner_prefs, public.email_outbox,
               public.email_suppressions to authenticated;

-- ---------------------------------------------------------------------------
-- Queueing
-- ---------------------------------------------------------------------------
-- Queue one email. Silently does nothing when the business has no connection (emails disabled), the
-- template is off, there's no usable address, the address unsubscribed from this category, or the
-- same email was already queued (idempotency key). A connection that needs attention holds the email
-- until it's fixed.
create function app.email_enqueue(p_business uuid, p_template public.email_template, p_recipient text, p_refs jsonb,
                                  p_key text, p_send_at timestamptz default now(), p_category text default 'transactional')
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_status public.email_connection_status;
  v_enabled boolean;
  v_to text := nullif(lower(trim(p_recipient)), '');
begin
  if v_to is null or v_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_to) > 254 then
    return;
  end if;
  select status into v_status from public.email_connections where business_id = p_business;
  if v_status is null or v_status = 'pending' then
    return;
  end if;
  if p_category <> 'owner' then
    select enabled into v_enabled from public.email_template_settings where business_id = p_business and template = p_template;
    if not coalesce(v_enabled, true) then
      return;
    end if;
  end if;
  if p_category = 'follow_up' and exists (select 1 from public.email_suppressions s
                                           where s.business_id = p_business and s.email::text = v_to and s.category = 'follow_up') then
    return;
  end if;
  insert into public.email_outbox (business_id, template, category, recipient, refs, idempotency_key, status, next_attempt_at)
  values (p_business, p_template, p_category, v_to, coalesce(p_refs, '{}'), p_key,
          case when v_status = 'needs_attention' then 'held' else 'queued' end::public.email_status, greatest(p_send_at, now()))
  -- A reminder the system withdrew (the appointment moved, then moved back) comes back; anything
  -- else already queued or sent stays as it is, and an owner's own cancellation stands.
  on conflict (idempotency_key) do update
     set status = excluded.status, next_attempt_at = excluded.next_attempt_at, last_error = null, attempts = 0
   where public.email_outbox.status = 'cancelled' and public.email_outbox.last_error = 'appointment changed';
end
$$;

-- Owner notifications: one per member who wants this kind, to the member's sign-in address.
create function app.email_enqueue_owners(p_business uuid, p_template public.email_template, p_refs jsonb, p_key text,
                                         p_except uuid default null)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare m record;
begin
  for m in select ms.user_id, u.email, coalesce((p.prefs ->> p_template::text)::boolean, true) as wanted
             from public.memberships ms
             join auth.users u on u.id = ms.user_id
             left join public.email_owner_prefs p on p.business_id = ms.business_id and p.user_id = ms.user_id
            where ms.business_id = p_business and ms.user_id is distinct from p_except loop
    if m.wanted then
      perform app.email_enqueue(p_business, p_template, m.email, p_refs || jsonb_build_object('user_id', m.user_id),
                                p_key || ':' || m.user_id, now(), 'owner');
    end if;
  end loop;
end
$$;

-- Never let email queueing break a booking, quote or lead change.
create function app.email_safely(p_sql text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  execute p_sql;
exception when others then
  raise warning 'email queueing skipped: % (%)', sqlerrm, sqlstate;
end
$$;

-- Appointment reminders for the business's chosen times (future ones only).
create function app.email_schedule_reminders(p_appointment uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  a public.appointments;
  h integer;
  v_to text;
begin
  select * into a from public.appointments where id = p_appointment;
  update public.email_outbox set status = 'cancelled', last_error = 'appointment changed'
   where business_id = a.business_id and template = 'appointment_reminder' and status in ('queued', 'held')
     and refs ->> 'appointment_id' = p_appointment::text;
  if a.id is null or a.status <> 'scheduled' then
    return;
  end if;
  v_to := app.email_appointment_recipient(a);
  for h in select unnest(coalesce((select reminder_hours from public.email_settings where business_id = a.business_id), '{24}')) loop
    if a.starts_at - make_interval(hours => h) > now() + interval '5 minutes' then
      perform app.email_enqueue(a.business_id, 'appointment_reminder', v_to,
                                jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'hours', h),
                                format('reminder:%s:%s:%s', a.id, extract(epoch from a.starts_at)::bigint, h),
                                a.starts_at - make_interval(hours => h));
    end if;
  end loop;
end
$$;

-- The customer address for an appointment: the customer record, else the booking request.
create function app.email_appointment_recipient(a public.appointments) returns text
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select coalesce((select c.email::text from public.customers c where c.id = a.customer_id and c.anonymized_at is null),
                  (select r.contact_email::text from public.booking_requests r where r.id = a.booking_request_id))
$$;

-- ---------------------------------------------------------------------------
-- Triggers: what queues which email
-- ---------------------------------------------------------------------------
-- Booking requests. New requests are handled at commit (deferred) so an instant booking — inserted
-- pending and approved in the same transaction — sends a confirmation, not "request received".
create function app.tg_email_request_insert() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare r public.booking_requests;
begin
  select * into r from public.booking_requests where id = new.id;
  if r.id is null then
    return null;
  end if;
  if r.status = 'pending' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', r.business_id, 'request_received', r.contact_email,
                                    jsonb_build_object('request_id', r.id), 'request_received:' || r.id));
    perform app.email_safely(format('select app.email_enqueue_owners(%L, %L, %L, %L)', r.business_id, 'owner_new_request',
                                    jsonb_build_object('request_id', r.id), 'owner_new_request:' || r.id));
  end if;
  return null;
end
$$;
create constraint trigger email_request_insert after insert on public.booking_requests
  deferrable initially deferred for each row execute function app.tg_email_request_insert();

create function app.tg_email_request_update() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_refs jsonb := jsonb_build_object('request_id', new.id);
  v_appt uuid;
begin
  if old.status = new.status and old.proposed_start is not distinct from new.proposed_start then
    return null;
  end if;
  if new.status = 'approved' and old.status in ('pending', 'time_proposed') then
    select id into v_appt from public.appointments where booking_request_id = new.id;
    v_refs := v_refs || jsonb_build_object('appointment_id', v_appt);
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id,
                                    case when old.status = 'time_proposed' then 'proposal_accepted' else 'booking_confirmed' end,
                                    new.contact_email, v_refs, 'booking_confirmed:request:' || new.id));
    -- The owner hears about bookings they didn't approve themselves (instant booking, accepted proposals).
    if new.decided_by is null or old.status = 'time_proposed' then
      perform app.email_safely(format('select app.email_enqueue_owners(%L, %L, %L, %L)', new.business_id,
                                      case when old.status = 'time_proposed' then 'owner_customer_response' else 'owner_new_appointment' end,
                                      v_refs || jsonb_build_object('response', 'proposal_accepted'), 'owner_booked:request:' || new.id));
    end if;
  elsif new.status = 'declined' and old.status = 'pending' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id, 'booking_declined',
                                    new.contact_email, v_refs, 'booking_declined:' || new.id));
  elsif new.status = 'time_proposed' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id, 'time_proposed',
                                    new.contact_email, v_refs || jsonb_build_object('proposed_start', new.proposed_start),
                                    format('time_proposed:%s:%s', new.id, extract(epoch from new.proposed_start)::bigint)));
  elsif new.status = 'proposal_declined' and old.status = 'time_proposed' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id, 'proposal_declined',
                                    new.contact_email, v_refs, format('proposal_declined:%s:%s', new.id, extract(epoch from old.proposed_start)::bigint)));
    perform app.email_safely(format('select app.email_enqueue_owners(%L, %L, %L, %L)', new.business_id, 'owner_customer_response',
                                    v_refs || jsonb_build_object('response', 'proposal_declined'),
                                    format('owner_response:proposal:%s:%s', new.id, extract(epoch from old.proposed_start)::bigint)));
  end if;
  return null;
end
$$;
create trigger email_request_update after update of status, proposed_start on public.booking_requests
  for each row execute function app.tg_email_request_update();

-- Appointments: confirmations for bookings not made from a request (phone, walk-in, accepted
-- quote), reschedules, cancellations and reminders.
create function app.tg_email_appointment_insert() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = new.id;
  if a.id is null then
    return null;
  end if;
  if a.booking_request_id is null and a.status = 'scheduled' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', a.business_id, 'booking_confirmed',
                                    app.email_appointment_recipient(a), jsonb_build_object('appointment_id', a.id),
                                    'booking_confirmed:appt:' || a.id));
  end if;
  perform app.email_safely(format('select app.email_schedule_reminders(%L)', a.id));
  return null;
end
$$;
create constraint trigger email_appointment_insert after insert on public.appointments
  deferrable initially deferred for each row execute function app.tg_email_appointment_insert();

create function app.tg_email_appointment_update() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_refs jsonb := jsonb_build_object('appointment_id', new.id);
begin
  if new.status = 'scheduled' and old.status = 'scheduled' and new.starts_at <> old.starts_at then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id, 'booking_rescheduled',
                                    app.email_appointment_recipient(new), v_refs || jsonb_build_object('previous_start', old.starts_at),
                                    format('rescheduled:%s:%s', new.id, extract(epoch from new.starts_at)::bigint)));
    perform app.email_safely(format('select app.email_schedule_reminders(%L)', new.id));
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id, 'booking_cancelled',
                                    app.email_appointment_recipient(new), v_refs, 'cancelled:' || new.id));
    if new.cancelled_by = 'customer' then
      perform app.email_safely(format('select app.email_enqueue_owners(%L, %L, %L, %L)', new.business_id, 'owner_customer_response',
                                      v_refs || jsonb_build_object('response', 'appointment_cancelled'), 'owner_response:cancelled:' || new.id));
    end if;
    perform app.email_safely(format('select app.email_schedule_reminders(%L)', new.id));
  elsif new.status <> old.status then
    perform app.email_safely(format('select app.email_schedule_reminders(%L)', new.id));
  end if;
  return null;
end
$$;
create trigger email_appointment_update after update of status, starts_at on public.appointments
  for each row execute function app.tg_email_appointment_update();

-- Quotes: sent (with a follow-up the day before it expires), answered, expired.
create function app.tg_email_quote_update() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_to text := (select c.email::text from public.customers c where c.id = new.customer_id and c.anonymized_at is null);
  v_refs jsonb := jsonb_build_object('quote_id', new.id);
  v_tz text := (select timezone from public.businesses where id = new.business_id);
  v_follow timestamptz;
begin
  if new.status = old.status then
    return null;
  end if;
  if new.status = 'sent' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id, 'quote_sent', v_to, v_refs,
                                    format('quote_sent:%s:%s', new.id, extract(epoch from new.sent_at)::bigint)));
    v_follow := ((new.valid_until - 1) + time '09:00') at time zone v_tz;
    if new.valid_until is not null and v_follow > now() + interval '1 hour' then
      perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L, %L, %L)', new.business_id, 'quote_expiring', v_to,
                                      v_refs || jsonb_build_object('valid_until', new.valid_until),
                                      format('quote_expiring:%s:%s', new.id, extract(epoch from new.sent_at)::bigint), v_follow, 'follow_up'));
    end if;
  elsif new.status in ('accepted', 'declined') and old.status = 'sent' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L)', new.business_id,
                                    'quote_' || new.status::text, v_to, v_refs, format('quote_%s:%s', new.status, new.id)));
    perform app.email_safely(format('select app.email_enqueue_owners(%L, %L, %L, %L)', new.business_id, 'owner_customer_response',
                                    v_refs || jsonb_build_object('response', 'quote_' || new.status::text),
                                    format('owner_response:quote:%s:%s', new.id, new.status)));
  elsif new.status = 'expired' then
    perform app.email_safely(format('select app.email_enqueue(%L, %L, %L, %L, %L, now(), %L)', new.business_id, 'quote_expired', v_to,
                                    v_refs, 'quote_expired:' || new.id, 'follow_up'));
  end if;
  if new.status <> 'sent' then
    update public.email_outbox set status = 'cancelled', last_error = 'quote answered or withdrawn'
     where business_id = new.business_id and template = 'quote_expiring' and status in ('queued', 'held')
       and refs ->> 'quote_id' = new.id::text;
  end if;
  return null;
end
$$;
create trigger email_quote_update after update of status on public.quotes
  for each row execute function app.tg_email_quote_update();

-- Leads that arrive on their own (the booking page's inquiry form), not ones the owner typed in.
create function app.tg_email_lead_insert() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    perform app.email_safely(format('select app.email_enqueue_owners(%L, %L, %L, %L)', new.business_id, 'owner_new_lead',
                                    jsonb_build_object('lead_id', new.id), 'owner_new_lead:' || new.id));
  end if;
  return null;
end
$$;
create trigger email_lead_insert after insert on public.leads for each row execute function app.tg_email_lead_insert();

-- ---------------------------------------------------------------------------
-- Owner functions (Settings → Notifications)
-- ---------------------------------------------------------------------------
-- Save a new connection (or replace the current one). It starts unverified: nothing is queued or sent
-- until it's verified (OAuth: a successful test send; SMTP: the emailed code).
create function app.save_email_connection_impl(p_provider public.email_provider, p_from text, p_from_name text, p_secret bytea,
                                               p_smtp_host text default null, p_smtp_port integer default null,
                                               p_smtp_username text default null)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  if p_provider is null or p_secret is null then
    raise exception 'invalid connection' using errcode = 'DH004';
  end if;
  insert into public.email_connections (business_id, provider, from_address, from_name, secret, smtp_host, smtp_port, smtp_username,
                                        status, connected_by)
  values (v_business, p_provider, lower(trim(p_from)), nullif(trim(p_from_name), ''), p_secret,
          case when p_provider = 'smtp' then lower(trim(p_smtp_host)) end, case when p_provider = 'smtp' then p_smtp_port end,
          case when p_provider = 'smtp' then trim(p_smtp_username) end, 'pending', (select auth.uid()))
  on conflict (business_id) do update
     set provider = excluded.provider, from_address = excluded.from_address, from_name = excluded.from_name, secret = excluded.secret,
         smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port, smtp_username = excluded.smtp_username,
         status = 'pending', verified_at = null, verification_hash = null, verification_expires_at = null,
         verification_attempts = 0, last_error = null, last_error_at = null, connected_by = excluded.connected_by;
exception
  when check_violation or not_null_violation then
    raise exception 'invalid connection details' using errcode = 'DH004';
end
$$;

-- Disconnect: the credentials are deleted and queued emails are skipped (nothing waits for a
-- connection that's gone).
create function app.disconnect_email_impl() returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  delete from public.email_connections where business_id = v_business;
  update public.email_outbox set status = 'skipped', last_error = 'email disconnected'
   where business_id = v_business and status in ('queued', 'held');
end
$$;

-- SMTP: check the code that was emailed to the sending address.
create function app.verify_email_code_impl(p_code text) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  c public.email_connections;
begin
  perform app.require_member(v_business, true);
  select * into c from public.email_connections where business_id = v_business for update;
  if c.business_id is null or c.status <> 'pending' or c.verification_hash is null then
    raise exception 'no verification in progress' using errcode = 'DH002';
  end if;
  if c.verification_expires_at < now() or c.verification_attempts >= 5 then
    raise exception 'the code expired — send a new one' using errcode = 'DH002';
  end if;
  if extensions.digest(c.business_id::text || ':' || coalesce(trim(p_code), ''), 'sha256') <> c.verification_hash then
    update public.email_connections set verification_attempts = verification_attempts + 1 where business_id = v_business;
    return false;
  end if;
  perform app.email_mark_verified(v_business);
  return true;
end
$$;

create function app.email_mark_verified(p_business uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.email_connections
     set status = 'verified', verified_at = now(), verification_hash = null, verification_expires_at = null,
         verification_attempts = 0, last_error = null, last_error_at = null
   where business_id = p_business;
  -- Emails held while the connection needed attention go out if they're still timely.
  update public.email_outbox set status = 'queued', next_attempt_at = now(), last_error = null
   where business_id = p_business and status = 'held' and (created_at > now() - interval '24 hours' or template = 'appointment_reminder');
  update public.email_outbox set status = 'skipped', last_error = 'held too long while email needed attention'
   where business_id = p_business and status = 'held';
end
$$;

create function app.save_email_settings_impl(p_reminder_hours integer[], p_templates jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  e record;
  a uuid;
begin
  perform app.require_member(v_business, true);
  insert into public.email_settings (business_id, reminder_hours) values (v_business, coalesce(p_reminder_hours, '{}'))
  on conflict (business_id) do update set reminder_hours = excluded.reminder_hours;
  for e in select key, value from jsonb_each(coalesce(p_templates, '{}')) loop
    if e.key::public.email_template >= 'owner_new_request' or jsonb_typeof(e.value) <> 'boolean' then
      raise exception 'invalid template' using errcode = 'DH004';
    end if;
    insert into public.email_template_settings (business_id, template, enabled) values (v_business, e.key::public.email_template, e.value::boolean)
    on conflict (business_id, template) do update set enabled = excluded.enabled;
  end loop;
  -- New reminder times apply to upcoming appointments too.
  for a in select id from public.appointments where business_id = v_business and status = 'scheduled' and starts_at > now() loop
    perform app.email_schedule_reminders(a);
  end loop;
exception
  when invalid_text_representation then raise exception 'invalid template' using errcode = 'DH004';
  when check_violation then raise exception 'choose reminder times from the list' using errcode = 'DH004';
end
$$;

create function app.save_email_template_impl(p_template public.email_template, p_subject text, p_intro text, p_signoff text)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  if p_template >= 'owner_new_request' then
    raise exception 'invalid template' using errcode = 'DH004';
  end if;
  insert into public.email_template_settings (business_id, template, subject, intro, signoff)
  values (v_business, p_template, nullif(trim(p_subject), ''), nullif(trim(p_intro), ''), nullif(trim(p_signoff), ''))
  on conflict (business_id, template) do update set subject = excluded.subject, intro = excluded.intro, signoff = excluded.signoff;
exception
  when check_violation then raise exception 'too long' using errcode = 'DH004';
end
$$;

create function app.save_owner_email_prefs_impl(p_prefs jsonb, p_summary_hour integer) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  bad text;
begin
  perform app.require_member(v_business, false);
  select string_agg(key, ',') into bad from jsonb_each(coalesce(p_prefs, '{}'))
   where key <> all (array['owner_new_request', 'owner_new_appointment', 'owner_new_lead', 'owner_customer_response',
                           'owner_daily_summary', 'owner_overdue_followups']) or jsonb_typeof(value) <> 'boolean';
  if bad is not null then
    raise exception 'invalid preferences' using errcode = 'DH004';
  end if;
  insert into public.email_owner_prefs (business_id, user_id, prefs, summary_hour)
  values (v_business, (select auth.uid()), coalesce(p_prefs, '{}'), coalesce(p_summary_hour, 7))
  on conflict (business_id, user_id) do update set prefs = excluded.prefs, summary_hour = excluded.summary_hour;
exception
  when check_violation then raise exception 'invalid preferences' using errcode = 'DH004';
end
$$;

-- Retry a failed or held email now; or stop one that's waiting.
create function app.retry_email_impl(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  if not exists (select 1 from public.email_connections where business_id = v_business and status = 'verified') then
    raise exception 'connect and verify your email first' using errcode = 'DH002';
  end if;
  update public.email_outbox set status = 'queued', next_attempt_at = now(), attempts = least(attempts, 3), last_error = null
   where id = p_id and business_id = v_business and status in ('failed', 'held');
  if not found then
    raise exception 'only failed or waiting emails can be retried' using errcode = 'DH002';
  end if;
end
$$;

create function app.cancel_email_impl(p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  update public.email_outbox set status = 'cancelled', last_error = 'cancelled by you'
   where id = p_id and business_id = v_business and status in ('queued', 'held', 'failed');
  if not found then
    raise exception 'this email can no longer be cancelled' using errcode = 'DH002';
  end if;
end
$$;

-- A test email to the signed-in owner (rate-limited: 5 an hour per business).
create function app.queue_test_email_impl() returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_id uuid;
  v_to text := (select email from auth.users where id = (select auth.uid()));
begin
  perform app.require_member(v_business, true);
  if not exists (select 1 from public.email_connections where business_id = v_business and status in ('verified', 'pending')) then
    raise exception 'connect your email first' using errcode = 'DH002';
  end if;
  if (select count(*) from public.email_outbox where business_id = v_business and template = 'connection_test'
        and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many test emails — try again later' using errcode = 'DH005';
  end if;
  insert into public.email_outbox (business_id, template, category, recipient, idempotency_key)
  values (v_business, 'connection_test', 'system', v_to, 'test:' || gen_random_uuid())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Worker API (role email_worker: the server's background sender; never owners or the public)
-- ---------------------------------------------------------------------------
create schema email_api;
revoke all on schema email_api from public;

-- Claim due emails (optionally one specific job). Respects each business's hourly and daily limits;
-- stuck "sending" rows (a crashed worker) are picked up again after their lock expires.
create function email_api.claim(p_limit integer, p_only uuid default null)
returns table (id uuid, business_id uuid, template public.email_template, category text, recipient text, attempts integer,
               provider public.email_provider, connection_status public.email_connection_status, from_address text, from_name text,
               secret bytea, smtp_host text, smtp_port integer, smtp_username text)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  with due as (
    select o.id from public.email_outbox o
     where (o.status = 'queued' or (o.status = 'sending' and o.locked_until < now()))
       and o.next_attempt_at <= now() and (p_only is null or o.id = p_only)
       and (select count(*) from public.email_outbox s where s.business_id = o.business_id and s.status = 'sent'
             and s.sent_at > now() - interval '1 hour') < 100
       and (select count(*) from public.email_outbox s where s.business_id = o.business_id and s.status = 'sent'
             and s.sent_at > now() - interval '24 hours') < coalesce((select daily_limit from public.email_settings e where e.business_id = o.business_id), 300)
     order by o.next_attempt_at
     limit greatest(1, least(p_limit, 50))
     for update skip locked
  ), claimed as (
    update public.email_outbox o set status = 'sending', attempts = o.attempts + 1, locked_until = now() + interval '5 minutes'
      from due where o.id = due.id
    returning o.*
  )
  select c.id, c.business_id, c.template, c.category, c.recipient::text, c.attempts, k.provider, k.status, k.from_address::text,
         k.from_name, k.secret, k.smtp_host, k.smtp_port, k.smtp_username
    from claimed c left join public.email_connections k on k.business_id = c.business_id;
end
$$;

-- Record the outcome. retry_at: try again then (status back to queued); otherwise sent/failed/held/skipped.
create function email_api.finish(p_id uuid, p_status public.email_status, p_error text default null, p_message_id text default null,
                                 p_retry_at timestamptz default null)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.email_outbox
     set status = case when p_retry_at is not null then 'queued' else p_status end,
         next_attempt_at = coalesce(p_retry_at, next_attempt_at), locked_until = null,
         last_error = left(p_error, 300), provider_message_id = left(p_message_id, 300),
         sent_at = case when p_status = 'sent' then now() else sent_at end
   where id = p_id and status = 'sending';
  if p_status = 'sent' then
    update public.email_connections k set last_sent_at = now()
      from public.email_outbox o where o.id = p_id and k.business_id = o.business_id;
  end if;
end
$$;

-- The provider refused the credentials (revoked, expired, wrong password): hold this business's
-- emails until the owner reconnects.
create function email_api.connection_failed(p_business uuid, p_error text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.email_connections set status = 'needs_attention', last_error = left(p_error, 300), last_error_at = now()
   where business_id = p_business and status = 'verified';
  update public.email_outbox set status = 'held', locked_until = null
   where business_id = p_business and status in ('queued', 'sending') and template <> 'connection_test';
end
$$;

-- OAuth providers may rotate refresh tokens.
create function email_api.update_secret(p_business uuid, p_secret bytea) returns void
language sql security definer set search_path = pg_catalog, pg_temp
as $$ update public.email_connections set secret = p_secret where business_id = p_business $$;

-- The connection for a server-side action (test send, SMTP code) — the server has already checked
-- the signed-in owner's membership.
create function email_api.connection(p_business uuid)
returns table (provider public.email_provider, status public.email_connection_status, from_address text, from_name text, secret bytea,
               smtp_host text, smtp_port integer, smtp_username text)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select provider, status, from_address::text, from_name, secret, smtp_host, smtp_port, smtp_username
    from public.email_connections where business_id = p_business
$$;

-- OAuth: verified once a real send through it succeeded (the test email).
create function email_api.mark_verified(p_business uuid) returns void
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.email_mark_verified(p_business) $$;

-- SMTP: a one-time code (made here, so the owner can't choose it), stored only as a hash.
create function email_api.start_verification(p_business uuid) returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_rand bytea := extensions.gen_random_bytes(4);
  v_code text := lpad((((get_byte(v_rand, 0)::bigint << 24) | (get_byte(v_rand, 1)::bigint << 16) | (get_byte(v_rand, 2)::bigint << 8)
                        | get_byte(v_rand, 3)::bigint) % 1000000)::text, 6, '0');
begin
  update public.email_connections
     set verification_hash = extensions.digest(business_id::text || ':' || v_code, 'sha256'),
         verification_expires_at = now() + interval '30 minutes', verification_attempts = 0
   where business_id = p_business and status = 'pending' and provider = 'smtp';
  if not found then
    raise exception 'no SMTP connection waiting for verification' using errcode = 'DH002';
  end if;
  return v_code;
end
$$;

-- Unsubscribe from a business's follow-up emails (the server checked the signed link first).
create function email_api.suppress(p_business uuid, p_email text, p_category text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  insert into public.email_suppressions (business_id, email, category) values (p_business, lower(trim(p_email)), p_category)
  on conflict do nothing;
  update public.email_outbox set status = 'cancelled', last_error = 'recipient unsubscribed'
   where business_id = p_business and recipient::text = lower(trim(p_email)) and category = p_category and status in ('queued', 'held');
end
$$;

-- Everything a template may show, allow-listed — never internal notes or other customers' data.
-- {"skip": reason} when the email is no longer relevant (e.g. a reminder for a moved appointment).
create function email_api.context(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  o public.email_outbox;
  b public.businesses;
  bb public.business_branding;
  ts public.email_template_settings;
  r public.booking_requests;
  a public.appointments;
  q public.quotes;
  l public.leads;
  v_data jsonb := '{}'::jsonb;
  v_tz text;
  v_today date;
begin
  select * into o from public.email_outbox where id = p_id;
  select * into b from public.businesses where id = o.business_id;
  select * into bb from public.business_branding where business_id = b.id;
  select * into ts from public.email_template_settings where business_id = b.id and template = o.template;
  v_tz := b.timezone;
  v_today := (now() at time zone v_tz)::date;

  if o.refs ? 'request_id' then
    select * into r from public.booking_requests where id = (o.refs ->> 'request_id')::uuid and business_id = b.id;
  end if;
  if o.refs ? 'appointment_id' and o.refs ->> 'appointment_id' is not null then
    select * into a from public.appointments where id = (o.refs ->> 'appointment_id')::uuid and business_id = b.id;
  end if;
  if o.refs ? 'quote_id' then
    select * into q from public.quotes where id = (o.refs ->> 'quote_id')::uuid and business_id = b.id;
  end if;
  if o.refs ? 'lead_id' then
    select * into l from public.leads where id = (o.refs ->> 'lead_id')::uuid and business_id = b.id;
  end if;

  -- No longer relevant?
  if o.template = 'appointment_reminder' and (a.id is null or a.status <> 'scheduled' or a.starts_at <> (o.refs ->> 'starts_at')::timestamptz
                                              or a.starts_at < now()) then
    return jsonb_build_object('skip', 'the appointment changed or already started');
  end if;
  if o.template = 'quote_expiring' and (q.id is null or q.status <> 'sent' or q.valid_until::text <> o.refs ->> 'valid_until') then
    return jsonb_build_object('skip', 'the quote was answered, withdrawn or changed');
  end if;
  if o.template = 'time_proposed' and (r.id is null or r.status <> 'time_proposed') then
    return jsonb_build_object('skip', 'the proposed time was withdrawn or answered');
  end if;
  if o.template = 'quote_sent' and (q.id is null or q.status <> 'sent') then
    return jsonb_build_object('skip', 'the quote was withdrawn');
  end if;

  if r.id is not null then
    v_data := v_data || jsonb_build_object('request', jsonb_build_object(
      'number', r.number, 'status', r.status, 'first_name', r.contact_first_name, 'requested_start', r.requested_start,
      'requested_end', r.requested_end, 'proposed_start', r.proposed_start, 'proposed_end', r.proposed_end,
      'proposal_message', r.proposal_message, 'decline_message', r.decline_message,
      'estimated_total_cents', r.estimated_total_cents, 'estimate_is_minimum', r.estimate_is_minimum,
      'services', coalesce((select jsonb_agg(i.name order by i.is_addon, i.name) from public.booking_request_items i where i.booking_request_id = r.id), '[]'),
      'vehicle', concat_ws(' ', r.vehicle_year::text, r.vehicle_make, r.vehicle_model),
      'location', case when r.location_type = 'mobile' then concat_ws(', ', r.service_address_line1, r.service_city) end,
      'link_key', r.idempotency_key));
  end if;
  if a.id is not null then
    v_data := v_data || jsonb_build_object('appointment', jsonb_build_object(
      'number', a.number, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'previous_start', o.refs ->> 'previous_start',
      'first_name', coalesce((select c.first_name from public.customers c where c.id = a.customer_id), r.contact_first_name),
      'services', coalesce((select jsonb_agg(i.name order by i.name) from public.appointment_items i where i.appointment_id = a.id), '[]'),
      'estimated_total_cents', a.estimated_total_cents, 'customer_message', a.customer_message, 'cancelled_by', a.cancelled_by,
      'location', case when a.location_type = 'mobile' then concat_ws(', ', a.service_address_line1, a.service_city)
                       else concat_ws(', ', b.shop_address_line1, b.shop_city) end,
      'link_key', (select br.idempotency_key from public.booking_requests br where br.id = a.booking_request_id),
      'customer_name', (select concat_ws(' ', c.first_name, c.last_name) from public.customers c where c.id = a.customer_id)));
  end if;
  if q.id is not null then
    v_data := v_data || jsonb_build_object('quote', jsonb_build_object(
      'number', q.number, 'status', q.status, 'total_cents', q.total_cents, 'valid_until', q.valid_until,
      'first_name', (select c.first_name from public.customers c where c.id = q.customer_id),
      'customer_name', (select concat_ws(' ', c.first_name, c.last_name) from public.customers c where c.id = q.customer_id),
      'vehicle', q.vehicle_text, 'nonce', q.token_nonce, 'link_version', q.link_version,
      'items', coalesce((select jsonb_agg(i.name order by i.created_at) from public.quote_items i where i.quote_id = q.id), '[]')));
  end if;
  if l.id is not null and o.category = 'owner' then
    v_data := v_data || jsonb_build_object('lead', jsonb_build_object(
      'name', concat_ws(' ', l.contact_first_name, l.contact_last_name), 'phone', l.contact_phone_e164, 'email', l.contact_email,
      'request', l.request_text, 'vehicle', concat_ws(' ', l.vehicle_year::text, l.vehicle_make, l.vehicle_model)));
  end if;
  -- Owner-only details for owner emails (the business's own customer contact details).
  if o.category = 'owner' and r.id is not null then
    v_data := jsonb_set(v_data, '{request}', (v_data -> 'request') || jsonb_build_object(
      'customer_name', concat_ws(' ', r.contact_first_name, r.contact_last_name), 'phone', r.contact_phone_e164, 'email', r.contact_email,
      'customer_notes', r.customer_notes));
  end if;
  if o.template = 'owner_daily_summary' then
    v_data := v_data || jsonb_build_object('summary', coalesce((select jsonb_agg(jsonb_build_object(
        'starts_at', x.starts_at, 'customer', concat_ws(' ', c.first_name, c.last_name),
        'services', (select string_agg(i.name, ', ' order by i.name) from public.appointment_items i where i.appointment_id = x.id),
        'location', case when x.location_type = 'mobile' then x.service_city else 'Shop' end) order by x.starts_at)
      from public.appointments x left join public.customers c on c.id = x.customer_id
     where x.business_id = b.id and x.status = 'scheduled' and (x.starts_at at time zone v_tz)::date = v_today), '[]'),
      'pending_requests', (select count(*) from public.booking_requests x where x.business_id = b.id and x.status = 'pending'));
  end if;
  if o.template = 'owner_overdue_followups' then
    v_data := v_data || jsonb_build_object('overdue', coalesce((select jsonb_agg(f order by f ->> 'due') from (
        select jsonb_build_object('kind', 'lead', 'name', concat_ws(' ', contact_first_name, contact_last_name), 'due', next_follow_up_at, 'note', follow_up_note) f
          from public.leads where business_id = b.id and next_follow_up_at < now()
        union all
        select jsonb_build_object('kind', 'quote', 'name', 'Quote #' || number, 'due', next_follow_up_at, 'note', follow_up_note)
          from public.quotes where business_id = b.id and next_follow_up_at < now()) t), '[]'));
  end if;

  return v_data || jsonb_build_object(
    'id', o.id, 'template', o.template, 'category', o.category, 'recipient', o.recipient::text, 'response', o.refs ->> 'response',
    'hours', o.refs ->> 'hours',
    'business', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', case when b.published_at is not null then b.slug end, 'timezone', v_tz,
      'phone', b.phone_e164, 'email', case when bb.show_email then b.email end,
      'logo', case when bb.logo_asset_id is not null and app.media_is_public(b.id, bb.logo_asset_id) then bb.logo_asset_id end,
      'primary_color', bb.primary_color, 'website', bb.website_url),
    'custom', jsonb_build_object('subject', ts.subject, 'intro', ts.intro, 'signoff', ts.signoff));
end
$$;

-- Daily owner emails, at each owner's chosen hour (business time zone): today's appointments and
-- overdue follow-ups — only when there's something to say, once a day.
create function email_api.schedule_daily() returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  x record;
  v_n integer := 0;
begin
  for x in
    select ms.business_id, ms.user_id, u.email, b.timezone, (now() at time zone b.timezone)::date as today,
           coalesce(p.summary_hour, 7) as hour, coalesce((p.prefs ->> 'owner_daily_summary')::boolean, true) as summary,
           coalesce((p.prefs ->> 'owner_overdue_followups')::boolean, true) as overdue
      from public.memberships ms
      join public.businesses b on b.id = ms.business_id
      join auth.users u on u.id = ms.user_id
      join public.email_connections k on k.business_id = b.id and k.status = 'verified'
      left join public.email_owner_prefs p on p.business_id = ms.business_id and p.user_id = ms.user_id
     where extract(hour from now() at time zone b.timezone) >= coalesce(p.summary_hour, 7)
  loop
    if x.summary and exists (select 1 from public.appointments a where a.business_id = x.business_id and a.status = 'scheduled'
                               and (a.starts_at at time zone x.timezone)::date = x.today) then
      perform app.email_enqueue(x.business_id, 'owner_daily_summary', x.email, jsonb_build_object('user_id', x.user_id, 'date', x.today),
                                format('summary:%s:%s:%s', x.business_id, x.user_id, x.today), now(), 'owner');
      v_n := v_n + 1;
    end if;
    if x.overdue and (exists (select 1 from public.leads where business_id = x.business_id and next_follow_up_at < now())
                      or exists (select 1 from public.quotes where business_id = x.business_id and next_follow_up_at < now())) then
      perform app.email_enqueue(x.business_id, 'owner_overdue_followups', x.email, jsonb_build_object('user_id', x.user_id, 'date', x.today),
                                format('overdue:%s:%s:%s', x.business_id, x.user_id, x.today), now(), 'owner');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end
$$;

-- ---------------------------------------------------------------------------
-- Invoker wrappers, roles and privileges
-- ---------------------------------------------------------------------------
create function public.save_email_connection(p_provider public.email_provider, p_from text, p_from_name text, p_secret bytea,
                                             p_smtp_host text default null, p_smtp_port integer default null, p_smtp_username text default null)
returns void language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.save_email_connection_impl(p_provider, p_from, p_from_name, p_secret, p_smtp_host, p_smtp_port, p_smtp_username) $$;
create function public.disconnect_email() returns void language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.disconnect_email_impl() $$;
create function public.verify_email_code(p_code text) returns boolean language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.verify_email_code_impl(p_code) $$;
create function public.save_email_settings(p_reminder_hours integer[], p_templates jsonb) returns void
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.save_email_settings_impl(p_reminder_hours, p_templates) $$;
create function public.save_email_template(p_template public.email_template, p_subject text, p_intro text, p_signoff text) returns void
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.save_email_template_impl(p_template, p_subject, p_intro, p_signoff) $$;
create function public.save_owner_email_prefs(p_prefs jsonb, p_summary_hour integer) returns void
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.save_owner_email_prefs_impl(p_prefs, p_summary_hour) $$;
create function public.retry_email(p_id uuid) returns void language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.retry_email_impl(p_id) $$;
create function public.cancel_email(p_id uuid) returns void language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.cancel_email_impl(p_id) $$;
create function public.queue_test_email() returns uuid language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.queue_test_email_impl() $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'email_worker') then
    create role email_worker nologin noinherit;
  end if;
end
$$;
grant usage on schema email_api to email_worker;

revoke all on function
  app.email_enqueue(uuid, public.email_template, text, jsonb, text, timestamptz, text),
  app.email_enqueue_owners(uuid, public.email_template, jsonb, text, uuid), app.email_safely(text), app.email_schedule_reminders(uuid),
  app.email_appointment_recipient(public.appointments), app.tg_email_request_insert(), app.tg_email_request_update(),
  app.tg_email_appointment_insert(), app.tg_email_appointment_update(), app.tg_email_quote_update(), app.tg_email_lead_insert(),
  app.save_email_connection_impl(public.email_provider, text, text, bytea, text, integer, text), app.disconnect_email_impl(),
  app.verify_email_code_impl(text), app.email_mark_verified(uuid), app.save_email_settings_impl(integer[], jsonb),
  app.save_email_template_impl(public.email_template, text, text, text), app.save_owner_email_prefs_impl(jsonb, integer),
  app.retry_email_impl(uuid), app.cancel_email_impl(uuid), app.queue_test_email_impl(),
  email_api.claim(integer, uuid), email_api.finish(uuid, public.email_status, text, text, timestamptz), email_api.connection_failed(uuid, text),
  email_api.update_secret(uuid, bytea), email_api.connection(uuid), email_api.mark_verified(uuid), email_api.start_verification(uuid),
  email_api.suppress(uuid, text, text), email_api.context(uuid), email_api.schedule_daily(),
  public.save_email_connection(public.email_provider, text, text, bytea, text, integer, text), public.disconnect_email(),
  public.verify_email_code(text), public.save_email_settings(integer[], jsonb), public.save_email_template(public.email_template, text, text, text),
  public.save_owner_email_prefs(jsonb, integer), public.retry_email(uuid), public.cancel_email(uuid), public.queue_test_email()
from public, anon, authenticated, service_role;

grant execute on function
  app.save_email_connection_impl(public.email_provider, text, text, bytea, text, integer, text), app.disconnect_email_impl(),
  app.verify_email_code_impl(text), app.save_email_settings_impl(integer[], jsonb), app.save_email_template_impl(public.email_template, text, text, text),
  app.save_owner_email_prefs_impl(jsonb, integer), app.retry_email_impl(uuid), app.cancel_email_impl(uuid), app.queue_test_email_impl(),
  public.save_email_connection(public.email_provider, text, text, bytea, text, integer, text), public.disconnect_email(),
  public.verify_email_code(text), public.save_email_settings(integer[], jsonb), public.save_email_template(public.email_template, text, text, text),
  public.save_owner_email_prefs(jsonb, integer), public.retry_email(uuid), public.cancel_email(uuid), public.queue_test_email()
to authenticated;

grant execute on function
  email_api.claim(integer, uuid), email_api.finish(uuid, public.email_status, text, text, timestamptz), email_api.connection_failed(uuid, text),
  email_api.update_secret(uuid, bytea), email_api.connection(uuid), email_api.mark_verified(uuid), email_api.start_verification(uuid),
  email_api.suppress(uuid, text, text), email_api.context(uuid), email_api.schedule_daily()
to email_worker;

-- The business name for the unsubscribe page (the server checked the signed link first).
create function email_api.business_name(p_business uuid) returns text
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$ select name from public.businesses where id = p_business $$;
revoke all on function email_api.business_name(uuid) from public, anon, authenticated, service_role;
grant execute on function email_api.business_name(uuid) to email_worker;

-- ---------------------------------------------------------------------------
-- Schedule: every minute pg_cron asks the app's worker route to send due emails (reminders,
-- retries, daily summaries). pg_net makes the HTTP call; the URL and shared secret live in
-- Supabase Vault (set with app.configure_email_worker — scripts/email-role.mjs locally, once by an
-- operator in production). Until configured, the tick does nothing; the app also sends right after
-- each change.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;

create function app.email_worker_tick() returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'detailerhq_email_worker_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'detailerhq_email_worker_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  if not exists (select 1 from public.email_outbox where status in ('queued', 'sending') and next_attempt_at <= now())
     and extract(minute from now()) <> 0 then
    return;  -- nothing due (and the hourly daily-summary check runs on the hour)
  end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
                        headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_secret),
                        timeout_milliseconds := 55000);
end
$$;

create function app.configure_email_worker(p_url text, p_secret text) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_id uuid;
begin
  if p_url !~ '^https?://' or char_length(p_secret) < 32 then
    raise exception 'invalid worker configuration';
  end if;
  select id into v_id from vault.secrets where name = 'detailerhq_email_worker_url';
  if v_id is null then perform vault.create_secret(p_url, 'detailerhq_email_worker_url'); else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'detailerhq_email_worker_secret';
  if v_id is null then perform vault.create_secret(p_secret, 'detailerhq_email_worker_secret'); else perform vault.update_secret(v_id, p_secret); end if;
end
$$;

revoke all on function app.email_worker_tick(), app.configure_email_worker(text, text) from public, anon, authenticated, service_role;
select cron.schedule('detailerhq-email-worker', '* * * * *', 'select app.email_worker_tick()');
