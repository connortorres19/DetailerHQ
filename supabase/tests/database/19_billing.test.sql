-- Phase 8: subscription billing — exactly five founding spots (reserve, claim, never reopen),
-- Standard access rules (trial, read-only, cancel at period end, past-due grace), pilots unchanged,
-- event idempotency, privileges and isolation. One transaction, rolled back.
begin;
\ir _helpers.psql
select plan(81);
grant billing_worker to postgres;
-- pgTAP callable while acting as the worker role (rolled back).
grant usage on schema extensions to billing_worker;
grant execute on all functions in schema extensions to billing_worker;

select pg_temp.make_business('bill-a@example.com', 'bill-a', 'mobile') as a \gset
select pg_temp.make_business('bill-b@example.com', 'bill-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select account_status::text as start_status from public.businesses where id = :'a' \gset
create function pg_temp.status(p uuid) returns text language sql as $$ select account_status::text from public.businesses where id = p $$;
create function pg_temp.remaining() returns int language sql as $$ select (app.founding_availability_impl() ->> 'remaining')::int $$;
-- Reserve as a business owner; returns the slot or the refusal detail.
create function pg_temp.reserve(p_owner uuid) returns text language plpgsql as $$
declare v text; v_detail text;
begin
  perform pg_temp.as_user(p_owner);
  begin
    v := public.start_founding_reservation()::text;
  exception when sqlstate 'DH002' then
    get stacked diagnostics v_detail = pg_exception_detail;
    v := 'refused:' || v_detail;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- ---- Exactly five spots, fixed --------------------------------------------------------------
select is((select count(*)::int from public.founding_slots), 5, 'exactly five founding spots exist');
select is((select array_agg(slot order by slot) from public.founding_slots), array[1,2,3,4,5]::smallint[], 'numbered 1–5');
select throws_ok($$insert into public.founding_slots (slot) values (6)$$, null, null, 'a sixth spot can''t be added');
select throws_ok($$delete from public.founding_slots where slot = 1$$, 'DH002', null, 'a spot can''t be deleted');
select throws_ok($$truncate public.founding_slots$$, null, null, 'the spots can''t be truncated');
select is((select count(*)::int from public.founding_slots), 5, 'all five spots are still there');
select is(pg_temp.remaining(), 5, 'five remaining at the start');

-- ---- Owners: no direct access to spots or billing state ------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok($$select * from public.founding_slots$$, '42501', null, 'owners can''t read the spots table');
select throws_ok($$update public.founding_slots set state = 'claimed'$$, '42501', null, 'owners can''t claim a spot directly');
select throws_ok(format($$insert into public.business_billing (business_id, plan, founding_slot) values (%L, 'founding', 1)$$, :'a'), '42501', null, 'owners can''t write their billing row');
select throws_ok($$update public.businesses set account_status = 'active'$$, '42501', null, 'owners can''t change their account status');
select throws_ok(format($$select billing_api.claim_founding('cs_x', %L, 'pi_x', 3000, 'usd')$$, :'a'), '42501', null, 'owners can''t call the billing API');
select throws_ok(format($$select app.revoke_founding_access(%L, 'x')$$, :'a'), '42501', null, 'owners can''t revoke founding access');
select is((public.founding_availability() ->> 'remaining')::int, 5, 'owners can see how many spots remain');
reset role;

-- ---- Reserve → claim ------------------------------------------------------------------------
select pg_temp.reserve(:'owner_a') as slot_a \gset
select ok(:'slot_a' ~ '^[1-5]$', 'A reserves a spot');
select is(pg_temp.reserve(:'owner_a'), :'slot_a', 'a second click keeps the same spot (no double reservation)');
select is((app.founding_availability_impl() ->> 'in_checkout')::int, 1, 'shown as in checkout');
select is(pg_temp.remaining(), 5, 'a reservation doesn''t consume a spot');
set local role billing_worker;
select billing_api.attach_founding_session(:'a', :'slot_a'::smallint, 'cs_test_a', now() + interval '30 minutes');
select is(billing_api.release_founding(:'slot_a'::smallint, 'cs_test_other'), false, 'a different session can''t release the spot');
select is((select outcome from billing_api.claim_founding('cs_test_a', :'a', 'pi_a', 2900, 'usd')), 'not_reserved', 'a wrong amount never claims');
select is((select outcome from billing_api.claim_founding('cs_test_a', :'b', 'pi_a', 3000, 'usd')), 'not_reserved', 'another business can''t claim A''s reservation');
select is((select outcome from billing_api.claim_founding('cs_test_unknown', :'a', 'pi_a', 3000, 'usd')), 'not_reserved', 'an unknown session never claims');
select is((select outcome from billing_api.claim_founding('cs_test_a', :'a', 'pi_a', 3000, 'usd')), 'claimed', 'a confirmed $30 payment claims the spot');
select is((select outcome from billing_api.claim_founding('cs_test_a', :'a', 'pi_a', 3000, 'usd')), 'already_claimed', 'a repeated webhook is harmless');
reset role;
select is(pg_temp.remaining(), 4, 'four remaining');
select is(pg_temp.status(:'a'), 'active', 'a founding member has full access');
select is((select plan::text || ':' || founding_slot from public.business_billing where business_id = :'a'), 'founding:' || :'slot_a', 'plan founding, with its spot number');
select is(pg_temp.reserve(:'owner_a'), 'refused:already_founding', 'a founding member can''t buy again');

-- A claimed spot is permanent.
set local role billing_worker;
select is(billing_api.release_founding(:'slot_a'::smallint, 'cs_test_a'), false, 'a claimed spot can''t be released');
reset role;
select throws_ok(format($$update public.founding_slots set state = 'available', business_id = null, checkout_session_id = null, claimed_at = null where slot = %s$$, :'slot_a'),
  'DH002', null, 'not even directly (by the database owner)');
select throws_ok(format($$update public.founding_slots set business_id = %L where slot = %s$$, :'b', :'slot_a'), 'DH002', null, 'a claimed spot can''t be reassigned');

-- Refunds and disputes are recorded only.
set local role billing_worker;
select is(billing_api.record_founding_refund('pi_a', false), :'slot_a'::smallint, 'a refund is recorded');
select billing_api.record_founding_refund('pi_a', true);
reset role;
select is(pg_temp.status(:'a'), 'active', 'a refund doesn''t remove access automatically');
select is((select state from public.founding_slots where slot = :'slot_a'::smallint), 'claimed', 'a refund never reopens the spot');
select ok((select refunded_at is not null and disputed_at is not null from public.founding_slots where slot = :'slot_a'::smallint), 'refund and dispute dates kept');
select is(pg_temp.remaining(), 4, 'still four remaining');

-- Removing founding access is an explicit administrative decision (and reversible); the spot stays claimed.
select throws_ok(format($$select app.revoke_founding_access(%L, '')$$, :'a'), null, null, 'a reason is required');
select app.revoke_founding_access(:'a', 'chargeback lost — decided by support');
select is(pg_temp.status(:'a'), 'inactive', 'revoked: read-only');
select is(app.can_write(:'a'), false, 'writes refused');
select is(pg_temp.remaining(), 4, 'revoking never reopens the spot');
select app.restore_founding_access(:'a');
select is(pg_temp.status(:'a'), 'active', 'restored');

-- A founding member is never billed: a live subscription for it is to be cancelled.
set local role billing_worker;
select billing_api.set_customer(:'a', 'cus_a');
select is(billing_api.sync_subscription(:'a', 'cus_a', 'sub_a', 'trialing', now() + interval '3 days', now() + interval '3 days', false, false),
  'cancel_founding', 'a founding member''s subscription is cancelled, never charged');
reset role;
select is(pg_temp.status(:'a'), 'active', 'and access is unchanged');

-- ---- The other four spots, then sold out ---------------------------------------------------
do $$
declare i int; v_biz uuid; v_slot text;
begin
  for i in 1..4 loop
    v_biz := pg_temp.make_business(format('bill-f%s@example.com', i), format('bill-f%s', i), 'mobile');
    v_slot := pg_temp.reserve(pg_temp.owner_of(v_biz));
    perform billing_api.attach_founding_session(v_biz, v_slot::smallint, 'cs_test_f' || i, now() + interval '30 minutes');
    if i < 4 then perform billing_api.claim_founding('cs_test_f' || i, v_biz, 'pi_f' || i, 3000, 'usd'); end if;
  end loop;
end $$;
select is(pg_temp.remaining(), 1, 'one remaining (one in checkout)');
select is(pg_temp.reserve(:'owner_b'), 'refused:in_checkout', 'a sixth buyer is told the last spot is in checkout');
-- The last checkout expires (Stripe says so): the spot opens again.
select slot as slot_f4, business_id as biz_f4 from public.founding_slots where checkout_session_id = 'cs_test_f4' \gset
set local role billing_worker;
select is(billing_api.release_founding(:'slot_f4'::smallint, 'cs_test_f4'), true, 'an expired checkout releases its spot');
reset role;
select is((app.founding_availability_impl() ->> 'open')::int, 1, 'one open spot');
select pg_temp.reserve(:'owner_b') as slot_b \gset
select ok(:'slot_b' ~ '^[1-5]$', 'the next buyer gets it');
set local role billing_worker;
select billing_api.attach_founding_session(:'b', :'slot_b'::smallint, 'cs_test_b', now() + interval '30 minutes');
select is((select outcome from billing_api.claim_founding('cs_test_b', :'b', 'pi_b', 3000, 'usd')), 'claimed', 'fifth spot claimed');
-- A late payment for the expired session finds no reservation (the server refunds it).
select is((select outcome from billing_api.claim_founding('cs_test_f4', :'biz_f4', 'pi_f4', 3000, 'usd')), 'not_reserved', 'a payment for an expired session never takes a spot');
reset role;
select is(pg_temp.remaining(), 0, 'sold out');
select pg_temp.make_business('bill-late@example.com', 'bill-late', 'mobile') as late \gset
select is(pg_temp.reserve(pg_temp.owner_of(:'late')), 'refused:sold_out', 'a sixth purchase is impossible');
select is((select count(*)::int from public.founding_slots where state = 'claimed'), 5, 'exactly five claimed');

-- Deleting a founding business keeps its spot claimed (never reopened).
delete from public.businesses where id = :'b';
select is((select state || ':' || coalesce(business_id::text, 'none') from public.founding_slots where slot = :'slot_b'::smallint), 'claimed:none', 'deleted business: spot stays claimed, link cleared');
select is(pg_temp.remaining(), 0, 'still sold out');

-- ---- Standard: trial → paid / read-only, cancel at period end, past-due grace -----------------
select pg_temp.make_business('bill-s@example.com', 'bill-s', 'mobile') as s \gset
select pg_temp.owner_of(:'s') as owner_s \gset
select is(pg_temp.status(:'s'), :'start_status', 'a business without a plan keeps its status (pilots unchanged)');
select is(app.apply_billing_state(:'s')::text, :'start_status', 'applying billing to it changes nothing');
set local role billing_worker;
select billing_api.set_customer(:'s', 'cus_s');
select throws_ok($$select billing_api.set_customer('$$ || :'s' || $$', 'cus_other')$$, 'DH002', null, 'a business keeps its Stripe customer');
select throws_ok(format($$select billing_api.sync_subscription(%L, 'cus_wrong', 'sub_s', 'active', null, now() + interval '30 days', false, true)$$, :'s'),
  'DH002', null, 'a subscription for another customer is refused');
select is(billing_api.sync_subscription(:'s', 'cus_s', 'sub_s', 'trialing', now() + interval '3 days', now() + interval '3 days', false, false), 'ok', 'trial starts');
reset role;
select is(pg_temp.status(:'s'), 'trialing', 'trialing: full access');
select ok((select trial_ends_at is not null from public.businesses where id = :'s'), 'trial end shown on the business');
set local role billing_worker;
select is(billing_api.sync_subscription(:'s', 'cus_s', 'sub_dup', 'trialing', now() + interval '3 days', now() + interval '3 days', false, false), 'duplicate', 'a second live subscription is flagged for cancellation');
-- No card by the end of the trial: Stripe cancels; the account becomes read-only, data kept.
select 'synced: ' || billing_api.sync_subscription(:'s', 'cus_s', 'sub_s', 'canceled', now() - interval '1 minute', now() - interval '1 minute', false, false);
reset role;
select is(pg_temp.status(:'s'), 'trial_expired', 'trial over without a card: read-only');
select is(app.can_write(:'s'), false, 'writes refused');
select pg_temp.as_user(:'owner_s');
select ok((select count(*) from public.services) > 0, 'the owner can still read everything');
reset role;
-- Subscribes (paid): full access again.
set local role billing_worker;
select 'synced: ' || billing_api.sync_subscription(:'s', 'cus_s', 'sub_s2', 'active', null, now() + interval '30 days', false, true);
select billing_api.mark_paid(:'s');
reset role;
select is(pg_temp.status(:'s'), 'active', 'paid: full access');
-- Cancel at period end: access until then, then read-only.
set local role billing_worker;
select 'synced: ' || billing_api.sync_subscription(:'s', 'cus_s', 'sub_s2', 'active', null, now() + interval '10 days', true, true);
reset role;
select is(pg_temp.status(:'s'), 'cancelled', 'cancelling: full access until the period ends');
select is(app.can_write(:'s'), true, 'still writable');
update public.business_billing set current_period_end = now() - interval '1 minute' where business_id = :'s';
select ok(app.billing_tick() >= 1, 'the scheduled check notices the period ended');
select is(pg_temp.status(:'s'), 'inactive', 'period over: read-only');
-- Past due: 7 days' grace, then read-only; paying restores access.
set local role billing_worker;
select 'synced: ' || billing_api.sync_subscription(:'s', 'cus_s', 'sub_s2', 'past_due', null, now() + interval '20 days', false, true);
reset role;
select is(pg_temp.status(:'s'), 'past_due', 'payment failed: full access during the grace period');
update public.business_billing set past_due_since = now() - interval '8 days' where business_id = :'s';
select app.billing_tick();
select is(pg_temp.status(:'s'), 'inactive', 'grace over: read-only');
set local role billing_worker;
select 'synced: ' || billing_api.sync_subscription(:'s', 'cus_s', 'sub_s2', 'active', null, now() + interval '30 days', false, true);
reset role;
select is(pg_temp.status(:'s'), 'active', 'paid: restored');
select is((select access_restricted_at from public.businesses where id = :'s'), null, 'restriction cleared');

-- Operator states are never overridden by billing.
update public.businesses set account_status = 'suspended' where id = :'s';
select app.apply_billing_state(:'s');
select is(pg_temp.status(:'s'), 'suspended', 'a suspended account stays suspended');

-- ---- Events are processed once ------------------------------------------------------------------
set local role billing_worker;
select is(billing_api.begin_event('evt_1', 'invoice.paid', now()), true, 'a new event is processed');
select is(billing_api.begin_event('evt_1', 'invoice.paid', now()), true, 'retried while unfinished (an earlier attempt failed)');
select billing_api.finish_event('evt_1', :'s', 'ok', null);
select is(billing_api.begin_event('evt_1', 'invoice.paid', now()), false, 'a duplicate delivery is skipped');
reset role;

-- ---- Isolation --------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select is((select count(*)::int from public.business_billing), 1, 'an owner sees only their own billing row');
select throws_ok($$select * from public.billing_events$$, '42501', null, 'owners can''t read billing events');
reset role;

select * from finish();
rollback;
