-- Phase 5 follow-up: the database makes quote link tokens; owners never choose them.
--
-- Before: public.send_quote(id, nonce, hash) stored whatever the caller passed. The app always passed
-- a random nonce and the hash of HMAC(server secret, nonce), but an owner calling the function
-- directly could have set a guessable token for their own quote.
--
-- Now: public.send_quote(id, link_key) — the database draws the nonce from its CSPRNG
-- (gen_random_uuid, backed by pg_strong_random) and derives
--   token = base64url(HMAC-SHA256(link_key, 'quote-link:v2:' || nonce))   (43 chars, 256 bits)
-- storing only the nonce and sha256(token). link_key is a 32-byte subkey the server derives from
-- its secret and never stores; the server re-derives the same token from the nonce to show the
-- link again. The randomness always comes from the database, so even a caller who passes a key of
-- their own only learns their own quote's link — they can't make it guessable to anyone else (the
-- nonce is readable only by that business). A database copy alone can't produce links (no key).
--
-- Also: answering a quote is refused while the business can't operate (suspended/closing), as
-- for booking status links.

-- Which derivation made a stored link: 1 = the earlier app-side nonce (kept working for quotes
-- already sent), 2 = database nonce. Null when there is no link.
alter table public.quotes add column link_version smallint check (link_version in (1, 2));
update public.quotes set link_version = 1 where token_hash is not null;
alter table public.quotes add constraint quotes_link_version_present check ((token_hash is null) = (link_version is null));

create function app.quote_link_token(p_nonce uuid, p_link_key bytea) returns text
language sql immutable strict set search_path = pg_catalog, pg_temp
as $$
  select translate(rtrim(encode(extensions.hmac(convert_to('quote-link:v2:' || p_nonce::text, 'UTF8'), p_link_key, 'sha256'), 'base64'), '='), '+/', '-_')
$$;

drop function public.send_quote(uuid, uuid, bytea);
drop function app.send_quote_impl(uuid, uuid, bytea);

create function app.send_quote_impl(p_quote_id uuid, p_link_key bytea) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  q public.quotes;
  v_today date;
  v_nonce uuid;
  v_attempt integer := 0;
begin
  perform app.require_member(v_business, true);
  if p_link_key is null or octet_length(p_link_key) <> 32 then
    raise exception 'invalid link key' using errcode = 'DH004';
  end if;
  select * into q from public.quotes where id = p_quote_id and business_id = v_business for update;
  if q.id is null then
    raise exception 'quote not found' using errcode = 'DH003';
  end if;
  if q.status = 'sent' then
    return q.token_nonce;  -- sending again keeps the same link
  end if;
  if q.status <> 'draft' then
    raise exception 'only draft quotes can be sent' using errcode = 'DH002';
  end if;
  select (now() at time zone b.timezone)::date into v_today from public.businesses b where b.id = v_business;
  if q.valid_until is null or q.valid_until < v_today then
    raise exception 'set an expiry date from today on' using errcode = 'DH004', detail = 'valid_until';
  end if;
  if not exists (select 1 from public.quote_items i where i.quote_id = q.id and i.business_id = v_business) then
    raise exception 'add at least one line item' using errcode = 'DH004';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  loop
    v_nonce := gen_random_uuid();
    begin
      update public.quotes
         set status = 'sent', sent_at = now(), decided_at = null, token_nonce = v_nonce, link_version = 2,
             token_hash = sha256(convert_to(app.quote_link_token(v_nonce, p_link_key), 'UTF8'))
       where id = q.id;
      exit;
    exception when unique_violation then
      -- A nonce or hash collision (astronomically unlikely): draw again.
      v_attempt := v_attempt + 1;
      if v_attempt >= 3 then
        raise;
      end if;
    end;
  end loop;
  update public.leads set status = 'quote_sent' where id = q.lead_id and business_id = v_business and status in ('new', 'contacted');
  return v_nonce;
end
$$;

create function public.send_quote(p_quote_id uuid, p_link_key bytea) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.send_quote_impl(p_quote_id, p_link_key) $$;

-- Withdrawing clears the whole link (hash, nonce and version).
create or replace function app.withdraw_quote_impl(p_quote_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  q public.quotes;
begin
  perform app.require_member(v_business, true);
  select * into q from public.quotes where id = p_quote_id and business_id = v_business for update;
  if q.id is null then
    raise exception 'quote not found' using errcode = 'DH003';
  end if;
  if q.status <> 'sent' then
    raise exception 'only sent quotes can be withdrawn' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.quotes set status = 'draft', token_hash = null, token_nonce = null, link_version = null where id = q.id;
end
$$;

-- Answers: as migration 14, plus refused while the business can't operate.
create or replace function app.quote_action_core(p_action text, p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  q public.quotes := app.quote_by_token(p_token_hash, p_ip_hash, p_action <> 'view');
  v_today date;
begin
  if p_action = 'view' then
    return app.quote_json(q);
  end if;
  select (now() at time zone b.timezone)::date into v_today from public.businesses b where b.id = q.business_id;
  -- Already decided: the same answer again is a no-op (no duplicate acceptance); anything else is refused.
  if (p_action = 'accept' and q.status in ('accepted', 'converted')) or (p_action = 'decline' and q.status = 'declined') then
    return app.quote_json(q) || jsonb_build_object('already', true);
  end if;
  if q.status <> 'sent' then
    raise exception 'this quote can no longer be answered' using errcode = 'DH002';
  end if;
  if not app.can_write(q.business_id) then
    raise exception 'this business is not taking answers right now' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'customer', true);
  if q.valid_until < v_today then
    update public.quotes set status = 'expired' where id = q.id returning * into q;
    return app.quote_json(q);
  end if;
  update public.quotes set status = case p_action when 'accept' then 'accepted' else 'declined' end::public.quote_status,
                           decided_at = now()
   where id = q.id returning * into q;
  return app.quote_json(q);
end
$$;

revoke all on function app.quote_link_token(uuid, bytea), app.send_quote_impl(uuid, bytea), public.send_quote(uuid, bytea)
  from public, anon, authenticated, service_role;
grant execute on function app.send_quote_impl(uuid, bytea), public.send_quote(uuid, bytea) to authenticated;
