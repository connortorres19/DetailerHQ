-- Phase 7 follow-up: SMTP is the connection method shown to businesses (Gmail, Google Workspace,
-- Outlook / Microsoft 365 and custom domains all connect with their SMTP settings). The OAuth tables
-- and functions stay as they are (hidden in the app, not removed). This migration only adds:
--   * smtp_security  the encryption the owner chose (STARTTLS or SSL/TLS) instead of guessing it from
--                    the port. Null on older rows means "from the port" (465 → SSL/TLS, else STARTTLS).
--   * last_checked_at  when the server last logged in to the mail server successfully (Test
--                    connection, connecting, or a verified connection), shown to the owner.
--   * replacing the password (or server details) of a verified SMTP connection for the same address
--     keeps it verified: the new login was checked by the server first, and the address was already
--     proven with the emailed code. A different address still needs a new code.
-- Nothing is deleted; existing rows are only back-filled.

alter table public.email_connections
  add column smtp_security text check (smtp_security in ('starttls', 'ssl')),
  add column last_checked_at timestamptz;
alter table public.email_connections
  add constraint email_connections_smtp_security_smtp check (smtp_security is null or provider = 'smtp');

update public.email_connections
   set smtp_security = case when smtp_port = 465 then 'ssl' else 'starttls' end,
       last_checked_at = coalesce(greatest(verified_at, last_sent_at), verified_at, last_sent_at)
 where provider = 'smtp';

-- Owners can read the new columns (still never secret or verification_hash).
grant select (smtp_security, last_checked_at) on public.email_connections to authenticated;

-- ---------------------------------------------------------------------------
-- Save a connection: now with the encryption setting, and returning whether it's verified.
-- ---------------------------------------------------------------------------
drop function public.save_email_connection(public.email_provider, text, text, bytea, text, integer, text);
drop function app.save_email_connection_impl(public.email_provider, text, text, bytea, text, integer, text);

create function app.save_email_connection_impl(p_provider public.email_provider, p_from text, p_from_name text, p_secret bytea,
                                               p_smtp_host text default null, p_smtp_port integer default null,
                                               p_smtp_username text default null, p_smtp_security text default null)
returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_from text := lower(trim(p_from));
  c public.email_connections;
begin
  perform app.require_member(v_business, true);
  if p_provider is null or p_secret is null then
    raise exception 'invalid connection' using errcode = 'DH004';
  end if;
  select * into c from public.email_connections where business_id = v_business for update;

  -- New details for the same, already verified, SMTP address (e.g. a new app password).
  if p_provider = 'smtp' and c.provider = 'smtp' and c.from_address::text = v_from and c.verified_at is not null then
    update public.email_connections
       set from_name = nullif(trim(p_from_name), ''), secret = p_secret, smtp_host = lower(trim(p_smtp_host)),
           smtp_port = p_smtp_port, smtp_username = trim(p_smtp_username),
           smtp_security = coalesce(p_smtp_security, case when p_smtp_port = 465 then 'ssl' else 'starttls' end),
           last_checked_at = now(), connected_by = (select auth.uid())
     where business_id = v_business;
    -- Emails held because the old password stopped working go out again.
    perform app.email_mark_verified(v_business);
    return 'verified';
  end if;

  insert into public.email_connections (business_id, provider, from_address, from_name, secret, smtp_host, smtp_port, smtp_username,
                                        smtp_security, last_checked_at, status, connected_by)
  values (v_business, p_provider, v_from, nullif(trim(p_from_name), ''), p_secret,
          case when p_provider = 'smtp' then lower(trim(p_smtp_host)) end, case when p_provider = 'smtp' then p_smtp_port end,
          case when p_provider = 'smtp' then trim(p_smtp_username) end,
          case when p_provider = 'smtp' then coalesce(p_smtp_security, case when p_smtp_port = 465 then 'ssl' else 'starttls' end) end,
          case when p_provider = 'smtp' then now() end, 'pending', (select auth.uid()))
  on conflict (business_id) do update
     set provider = excluded.provider, from_address = excluded.from_address, from_name = excluded.from_name, secret = excluded.secret,
         smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port, smtp_username = excluded.smtp_username,
         smtp_security = excluded.smtp_security, last_checked_at = excluded.last_checked_at,
         status = 'pending', verified_at = null, verification_hash = null, verification_expires_at = null,
         verification_attempts = 0, last_error = null, last_error_at = null, connected_by = excluded.connected_by;
  return 'pending';
exception
  when check_violation or not_null_violation then
    raise exception 'invalid connection details' using errcode = 'DH004';
end
$$;

create function public.save_email_connection(p_provider public.email_provider, p_from text, p_from_name text, p_secret bytea,
                                             p_smtp_host text default null, p_smtp_port integer default null, p_smtp_username text default null,
                                             p_smtp_security text default null)
returns text language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.save_email_connection_impl(p_provider, p_from, p_from_name, p_secret, p_smtp_host, p_smtp_port, p_smtp_username, p_smtp_security) $$;

-- A verified connection records when the server last logged in successfully.
create or replace function app.email_mark_verified(p_business uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  update public.email_connections
     set status = 'verified', verified_at = coalesce(verified_at, now()), verification_hash = null, verification_expires_at = null,
         verification_attempts = 0, last_error = null, last_error_at = null,
         last_checked_at = case when provider = 'smtp' then now() else last_checked_at end
   where business_id = p_business;
  -- Emails held while the connection needed attention go out if they're still timely.
  update public.email_outbox set status = 'queued', next_attempt_at = now(), last_error = null
   where business_id = p_business and status = 'held' and (created_at > now() - interval '24 hours' or template = 'appointment_reminder');
  update public.email_outbox set status = 'skipped', last_error = 'held too long while email needed attention'
   where business_id = p_business and status = 'held';
end
$$;

-- ---------------------------------------------------------------------------
-- Worker API: the encryption setting travels with the connection.
-- ---------------------------------------------------------------------------
drop function email_api.claim(integer, uuid);
create function email_api.claim(p_limit integer, p_only uuid default null)
returns table (id uuid, business_id uuid, template public.email_template, category text, recipient text, attempts integer,
               provider public.email_provider, connection_status public.email_connection_status, from_address text, from_name text,
               secret bytea, smtp_host text, smtp_port integer, smtp_username text, smtp_security text)
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
         k.from_name, k.secret, k.smtp_host, k.smtp_port, k.smtp_username, k.smtp_security
    from claimed c left join public.email_connections k on k.business_id = c.business_id;
end
$$;

drop function email_api.connection(uuid);
create function email_api.connection(p_business uuid)
returns table (provider public.email_provider, status public.email_connection_status, from_address text, from_name text, secret bytea,
               smtp_host text, smtp_port integer, smtp_username text, smtp_security text, verified_at timestamptz)
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select provider, status, from_address::text, from_name, secret, smtp_host, smtp_port, smtp_username, smtp_security, verified_at
    from public.email_connections where business_id = p_business
$$;

-- "Test connection" on the saved connection logged in successfully. A connection that needed
-- attention (and was verified before) is back to normal, and its held emails go out.
create function email_api.connection_ok(p_business uuid) returns public.email_connection_status
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare c public.email_connections;
begin
  select * into c from public.email_connections where business_id = p_business for update;
  if c.business_id is null then
    raise exception 'no connection' using errcode = 'DH002';
  end if;
  update public.email_connections set last_checked_at = now() where business_id = p_business;
  if c.status = 'needs_attention' and c.verified_at is not null then
    perform app.email_mark_verified(p_business);
    return 'verified'::public.email_connection_status;
  end if;
  return c.status;
end
$$;

revoke all on function
  app.save_email_connection_impl(public.email_provider, text, text, bytea, text, integer, text, text),
  public.save_email_connection(public.email_provider, text, text, bytea, text, integer, text, text),
  email_api.claim(integer, uuid), email_api.connection(uuid), email_api.connection_ok(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  app.save_email_connection_impl(public.email_provider, text, text, bytea, text, integer, text, text),
  public.save_email_connection(public.email_provider, text, text, bytea, text, integer, text, text)
to authenticated;
grant execute on function email_api.claim(integer, uuid), email_api.connection(uuid), email_api.connection_ok(uuid) to email_worker;
