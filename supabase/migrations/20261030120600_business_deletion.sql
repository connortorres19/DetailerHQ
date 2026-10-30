-- DetailerHQ — Phase 1, migration 7: explicit business data deletion (§12.6).
-- Relying on ON DELETE CASCADE from businesses is not reliable here: several intra-business
-- foreign keys are intentionally NO ACTION (e.g. a service referenced by history cannot be
-- deleted on its own), and PostgreSQL can check them before the cascaded child rows are
-- gone. This function deletes in dependency order instead. It is operator/system only:
-- no role is granted EXECUTE. Automated deletion stays disabled until the retention
-- policy is approved (D-18); this is the mechanism the closure flow will call later.

create function app.delete_business_data(p_business_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'not found' using errcode = 'DH003';
  end if;

  delete from public.activity_events       where business_id = p_business_id;
  delete from public.schedule_blocks       where business_id = p_business_id;
  delete from public.appointment_items     where business_id = p_business_id;
  delete from public.appointments          where business_id = p_business_id;
  delete from public.quotes                where business_id = p_business_id; -- quote_items cascade
  update public.leads set booking_request_id = null where business_id = p_business_id;
  delete from public.booking_request_items where business_id = p_business_id;
  update public.booking_requests set duplicate_of_id = null where business_id = p_business_id;
  delete from public.booking_requests      where business_id = p_business_id;
  delete from public.leads                 where business_id = p_business_id;
  delete from public.vehicles              where business_id = p_business_id;
  delete from public.customers             where business_id = p_business_id;
  delete from public.service_prices        where business_id = p_business_id;
  delete from public.services              where business_id = p_business_id;
  delete from public.service_categories    where business_id = p_business_id;
  delete from public.vehicle_size_classes  where business_id = p_business_id;
  delete from public.availability_rules    where business_id = p_business_id;
  delete from public.time_off              where business_id = p_business_id;
  delete from public.schedule_resources    where business_id = p_business_id;
  delete from public.booking_settings      where business_id = p_business_id;
  delete from public.business_counters     where business_id = p_business_id;
  delete from public.rate_limit_events     where business_id = p_business_id;
  delete from public.memberships           where business_id = p_business_id;
  delete from public.businesses            where id = p_business_id;
end
$$;

revoke all on function app.delete_business_data(uuid) from public, anon, authenticated, service_role;
