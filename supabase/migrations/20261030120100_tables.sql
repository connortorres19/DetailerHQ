-- DetailerHQ — Phase 1, migration 2: tables, keys, constraints, indexes.
-- Every business-owned table carries business_id and unique (business_id, id), and every
-- reference between business-owned tables is a composite foreign key that includes
-- business_id (D-23), so the database rejects cross-business references.

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
    check (slug <> all (array['app','api','admin','www','b','r','q','auth','sign-in','sign-up',
                              'onboarding','pricing','contact','legal','support','help','status'])),
  phone_e164 text check (phone_e164 is null or app.is_valid_us_phone(phone_e164)),
  email extensions.citext check (email is null or app.is_valid_email(email::text)),
  timezone text not null check (app.is_us_timezone(timezone)),
  service_mode public.service_mode not null,
  service_area_text text check (char_length(service_area_text) <= 300),
  shop_address_line1 text check (char_length(shop_address_line1) <= 120),
  shop_city text check (char_length(shop_city) <= 60),
  shop_state text check (shop_state ~ '^[A-Z]{2}$'),
  shop_postal_code text check (shop_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  accepting_requests boolean not null default false,
  published_at timestamptz,
  account_status public.account_status not null default 'pending_activation',
  activated_at timestamptz,
  pilot_ends_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  access_restricted_at timestamptz,
  closure_requested_at timestamptz,
  deletion_scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_status = 'pending_activation' or activated_at is not null),
  check (not accepting_requests or published_at is not null)
);

create table public.memberships (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id),
  unique (user_id) -- one business per owner in the MVP
);
-- RLS filters on user_id; the composite primary key does not index it as a leading column.
create index memberships_user_business_idx on public.memberships (user_id, business_id);

create table public.business_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('request', 'appointment', 'quote')),
  next_value integer not null default 1 check (next_value >= 1),
  primary key (business_id, kind)
);

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------
create table public.booking_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  slot_interval_min integer not null default 60 check (slot_interval_min between 15 and 240),
  min_notice_min integer not null default 1440 check (min_notice_min between 0 and 20160),
  horizon_days integer not null default 60 check (horizon_days between 1 and 365),
  buffer_min integer not null default 30 check (buffer_min between 0 and 240),
  max_jobs_per_day integer check (max_jobs_per_day between 1 and 50),
  default_hold_hours integer not null default 24 check (default_hold_hours between 2 and 72),
  proposal_expiry_hours integer not null default 48 check (proposal_expiry_hours between 2 and 72),
  customer_can_cancel boolean not null default true,
  cancel_cutoff_hours integer not null default 24 check (cancel_cutoff_hours between 0 and 168),
  reschedule_cutoff_hours integer not null default 24 check (reschedule_cutoff_hours between 0 and 168),
  cancellation_policy_text text check (char_length(cancellation_policy_text) <= 1000),
  reschedule_policy_text text check (char_length(reschedule_policy_text) <= 1000),
  intro_text text check (char_length(intro_text) <= 300),
  prep_instructions text check (char_length(prep_instructions) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (business_id, id)
);
create index availability_rules_business_idx on public.availability_rules (business_id, weekday);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  during tstzrange not null check (not isempty(during) and not lower_inf(during) and not upper_inf(during)),
  all_day boolean not null default false,
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);
create index time_off_business_idx on public.time_off (business_id);
create index time_off_during_idx on public.time_off using gist (during);

create table public.schedule_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.resource_kind not null default 'general',
  name text not null check (char_length(name) between 1 and 60),
  capacity smallint not null check (capacity between 1 and 20),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);
-- MVP: exactly one active general capacity pool per business (D-26). Other kinds exist only
-- so the model can grow to bays/staff later; no feature uses them yet.
create unique index schedule_resources_one_general_idx
  on public.schedule_resources (business_id) where kind = 'general' and active;

create table public.vehicle_size_classes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  examples text check (char_length(examples) <= 120),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  price_type public.price_type not null,
  base_price_cents integer check (base_price_cents >= 0),
  base_duration_min integer not null check (base_duration_min between 15 and 4320),
  is_addon boolean not null default false,
  is_bookable boolean not null default false,
  follow_up_after_days integer check (follow_up_after_days between 1 and 730),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, category_id) references public.service_categories (business_id, id),
  check (price_type = 'quote_required' or base_price_cents is not null),
  check (not (is_bookable and price_type = 'quote_required'))
);

create table public.service_prices (
  business_id uuid not null,
  service_id uuid not null,
  size_class_id uuid not null,
  price_cents integer check (price_cents >= 0),
  duration_min integer check (duration_min between 15 and 4320),
  primary key (service_id, size_class_id),
  foreign key (business_id, service_id) references public.services (business_id, id) on delete cascade,
  foreign key (business_id, size_class_id) references public.vehicle_size_classes (business_id, id) on delete cascade,
  check (price_cents is not null or duration_min is not null)
);

-- ---------------------------------------------------------------------------
-- Customers and vehicles
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text check (char_length(last_name) <= 60),
  phone_e164 text check (phone_e164 is null or app.is_valid_us_phone(phone_e164)),
  email extensions.citext check (email is null or app.is_valid_email(email::text)),
  preferred_contact public.contact_preference,
  address_line1 text check (char_length(address_line1) <= 120),
  city text check (char_length(city) <= 60),
  state text check (state ~ '^[A-Z]{2}$'),
  postal_code text check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  notes text check (char_length(notes) <= 2000),
  source public.lead_source,
  archived_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  check (anonymized_at is not null or phone_e164 is not null or email is not null)
);
create index customers_business_phone_idx on public.customers (business_id, phone_e164);
create index customers_business_email_idx on public.customers (business_id, email);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  year smallint check (year between 1900 and 2100),
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 40),
  trim text check (char_length(trim) <= 40),
  color text check (char_length(color) <= 30),
  size_class_id uuid,
  plate text check (char_length(plate) <= 10),
  notes text check (char_length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, customer_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, size_class_id) references public.vehicle_size_classes (business_id, id)
);
create index vehicles_customer_idx on public.vehicles (business_id, customer_id);

-- ---------------------------------------------------------------------------
-- Leads and quotes
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  status public.lead_status not null default 'new',
  source public.lead_source not null,
  lost_reason public.lost_reason,
  contact_first_name text not null check (char_length(contact_first_name) between 1 and 60),
  contact_last_name text check (char_length(contact_last_name) <= 60),
  contact_phone_e164 text check (contact_phone_e164 is null or app.is_valid_us_phone(contact_phone_e164)),
  contact_email extensions.citext check (contact_email is null or app.is_valid_email(contact_email::text)),
  customer_id uuid,
  vehicle_id uuid,
  vehicle_description text check (char_length(vehicle_description) <= 120),
  request_text text check (char_length(request_text) <= 2000),
  booking_request_id uuid,
  next_follow_up_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, customer_id, vehicle_id) references public.vehicles (business_id, customer_id, id),
  check (vehicle_id is null or customer_id is not null),
  check (status <> 'lost' or lost_reason is not null),
  check (contact_phone_e164 is not null or contact_email is not null or customer_id is not null)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  number integer not null,
  status public.quote_status not null default 'draft',
  lead_id uuid,
  customer_id uuid,
  vehicle_id uuid,
  vehicle_text text check (char_length(vehicle_text) <= 120),
  valid_until date,
  notes text check (char_length(notes) <= 2000),
  terms text check (char_length(terms) <= 2000),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null default 0,
  token_hash bytea unique check (token_hash is null or octet_length(token_hash) = 32),
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, lead_id) references public.leads (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, customer_id, vehicle_id) references public.vehicles (business_id, customer_id, id),
  check (vehicle_id is null or customer_id is not null),
  check (total_cents = subtotal_cents - discount_cents and total_cents >= 0),
  check (status = 'draft' or sent_at is not null)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  quote_id uuid not null,
  service_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  quantity integer not null default 1 check (quantity between 1 and 99),
  price_cents integer not null check (price_cents >= 0),
  duration_min integer check (duration_min between 0 and 4320),
  created_at timestamptz not null default now(),
  foreign key (business_id, quote_id) references public.quotes (business_id, id) on delete cascade,
  foreign key (business_id, service_id) references public.services (business_id, id)
);
create index quote_items_quote_idx on public.quote_items (business_id, quote_id);

-- ---------------------------------------------------------------------------
-- Booking requests and appointments
-- ---------------------------------------------------------------------------
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  number integer not null,
  status public.request_status not null default 'pending',
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  idempotency_key uuid not null,
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  alternate_start timestamptz,
  location_type public.location_type not null,
  service_address_line1 text check (char_length(service_address_line1) <= 120),
  service_city text check (char_length(service_city) <= 60),
  service_state text check (service_state ~ '^[A-Z]{2}$'),
  service_postal_code text check (service_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  contact_first_name text not null check (char_length(contact_first_name) between 1 and 60),
  contact_last_name text check (char_length(contact_last_name) <= 60),
  contact_phone_e164 text check (contact_phone_e164 is null or app.is_valid_us_phone(contact_phone_e164)),
  contact_email extensions.citext check (contact_email is null or app.is_valid_email(contact_email::text)),
  preferred_contact public.contact_preference,
  vehicle_year smallint check (vehicle_year between 1900 and 2100),
  vehicle_make text not null check (char_length(vehicle_make) between 1 and 40),
  vehicle_model text not null check (char_length(vehicle_model) between 1 and 40),
  vehicle_color text check (char_length(vehicle_color) <= 30),
  vehicle_size_class_id uuid not null,
  vehicle_notes text check (char_length(vehicle_notes) <= 500),
  customer_notes text check (char_length(customer_notes) <= 1000),
  consent_at timestamptz not null,
  estimated_total_cents integer not null check (estimated_total_cents >= 0),
  estimate_is_minimum boolean not null default false,
  estimated_duration_min integer not null check (estimated_duration_min between 15 and 4320),
  customer_id uuid,
  vehicle_id uuid,
  duplicate_of_id uuid,
  proposed_start timestamptz,
  proposed_end timestamptz,
  proposal_message text check (char_length(proposal_message) <= 500),
  proposal_expires_at timestamptz,
  decline_message text check (char_length(decline_message) <= 500),
  decline_reason text check (char_length(decline_reason) <= 500),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  ip_hash bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  unique (business_id, idempotency_key),
  foreign key (business_id, vehicle_size_class_id) references public.vehicle_size_classes (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, customer_id, vehicle_id) references public.vehicles (business_id, customer_id, id),
  foreign key (business_id, duplicate_of_id) references public.booking_requests (business_id, id),
  check (requested_end > requested_start and requested_end - requested_start <= interval '72 hours'),
  check (contact_phone_e164 is not null or contact_email is not null),
  check (location_type <> 'mobile' or service_address_line1 is not null),
  check (vehicle_id is null or customer_id is not null),
  check (status <> 'approved' or (customer_id is not null and vehicle_id is not null)),
  check (status <> 'time_proposed' or (proposed_start is not null and proposed_end is not null
                                       and proposal_expires_at is not null and customer_id is not null
                                       and vehicle_id is not null)),
  check (proposed_end is null or proposed_end > proposed_start),
  check (duplicate_of_id is null or duplicate_of_id <> id)
);
create index booking_requests_status_idx on public.booking_requests (business_id, status, requested_start);
create index booking_requests_contact_phone_idx on public.booking_requests (business_id, contact_phone_e164) where status in ('pending', 'time_proposed');
create index booking_requests_contact_email_idx on public.booking_requests (business_id, contact_email) where status in ('pending', 'time_proposed');

create table public.booking_request_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  booking_request_id uuid not null,
  service_id uuid not null,
  name text not null,
  price_type public.price_type not null,
  price_cents integer not null check (price_cents >= 0),
  duration_min integer not null check (duration_min between 15 and 4320),
  is_addon boolean not null,
  foreign key (business_id, booking_request_id) references public.booking_requests (business_id, id) on delete cascade,
  foreign key (business_id, service_id) references public.services (business_id, id)
);
create index booking_request_items_request_idx on public.booking_request_items (business_id, booking_request_id);

-- leads.booking_request_id can only be added once booking_requests exists.
alter table public.leads
  add foreign key (business_id, booking_request_id) references public.booking_requests (business_id, id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  number integer not null,
  resource_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid not null,
  booking_request_id uuid unique,
  quote_id uuid,
  lead_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_type public.location_type not null,
  service_address_line1 text check (char_length(service_address_line1) <= 120),
  service_city text check (char_length(service_city) <= 60),
  service_state text check (service_state ~ '^[A-Z]{2}$'),
  service_postal_code text check (service_postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  status public.appointment_status not null default 'scheduled',
  estimated_total_cents integer not null default 0 check (estimated_total_cents >= 0),
  recorded_total_cents integer check (recorded_total_cents >= 0),
  payment_note public.payment_note not null default 'not_recorded',
  cancelled_by public.cancelled_by,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  customer_message text check (char_length(customer_message) <= 500),
  reschedule_requested_at timestamptz,
  completed_at timestamptz,
  internal_notes text check (char_length(internal_notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, number),
  foreign key (business_id, resource_id) references public.schedule_resources (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, customer_id, vehicle_id) references public.vehicles (business_id, customer_id, id),
  foreign key (business_id, booking_request_id) references public.booking_requests (business_id, id),
  foreign key (business_id, quote_id) references public.quotes (business_id, id),
  foreign key (business_id, lead_id) references public.leads (business_id, id),
  check (ends_at - starts_at between interval '15 minutes' and interval '72 hours'),
  check (status <> 'cancelled' or (cancelled_at is not null and cancelled_by is not null)),
  check (status <> 'completed' or (completed_at is not null and recorded_total_cents is not null)),
  check (location_type <> 'mobile' or service_address_line1 is not null)
);
create index appointments_business_time_idx on public.appointments (business_id, starts_at);

create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  appointment_id uuid not null,
  service_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  quantity integer not null default 1 check (quantity between 1 and 99),
  estimated_price_cents integer not null check (estimated_price_cents >= 0),
  recorded_price_cents integer check (recorded_price_cents >= 0),
  duration_min integer not null check (duration_min between 0 and 4320),
  foreign key (business_id, appointment_id) references public.appointments (business_id, id) on delete cascade,
  foreign key (business_id, service_id) references public.services (business_id, id)
);
create index appointment_items_appointment_idx on public.appointment_items (business_id, appointment_id);

-- ---------------------------------------------------------------------------
-- Capacity reservations (D-26, D-27). One row = one unit of capacity on one resource.
-- Written only by SECURITY DEFINER functions/triggers; owners can only read (D-24).
-- ---------------------------------------------------------------------------
create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  resource_id uuid not null,
  kind public.block_kind not null,
  during tstzrange not null check (app.is_valid_block_range(during)),
  appointment_id uuid unique,
  booking_request_id uuid,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (business_id) references public.businesses (id) on delete cascade,
  foreign key (business_id, resource_id) references public.schedule_resources (business_id, id),
  foreign key (business_id, appointment_id) references public.appointments (business_id, id) on delete cascade,
  foreign key (business_id, booking_request_id) references public.booking_requests (business_id, id) on delete cascade,
  check (
    (kind = 'appointment' and appointment_id is not null and booking_request_id is null and expires_at is null)
    or (kind in ('hold', 'proposal') and appointment_id is null and booking_request_id is not null and expires_at is not null)
  )
);
create unique index schedule_blocks_one_tentative_per_request_idx
  on public.schedule_blocks (booking_request_id) where kind in ('hold', 'proposal');
create index schedule_blocks_resource_idx on public.schedule_blocks (resource_id);
create index schedule_blocks_during_idx on public.schedule_blocks using gist (during);

-- ---------------------------------------------------------------------------
-- Status and scheduling history (append-only)
-- ---------------------------------------------------------------------------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_request_id uuid,
  appointment_id uuid,
  lead_id uuid,
  quote_id uuid,
  kind text not null check (char_length(kind) between 1 and 60),
  from_status text,
  to_status text,
  actor_type public.actor_type not null,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (business_id, booking_request_id) references public.booking_requests (business_id, id) on delete cascade,
  foreign key (business_id, appointment_id) references public.appointments (business_id, id) on delete cascade,
  foreign key (business_id, lead_id) references public.leads (business_id, id) on delete cascade,
  foreign key (business_id, quote_id) references public.quotes (business_id, id) on delete cascade
);
create index activity_events_request_idx on public.activity_events (business_id, booking_request_id, created_at);
create index activity_events_appointment_idx on public.activity_events (business_id, appointment_id, created_at);

-- Abuse protection for the public endpoint. Not business data; no owner access.
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  action text not null,
  key_hash bytea not null,
  business_id uuid references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on public.rate_limit_events (action, key_hash, created_at);
create index rate_limit_events_business_idx on public.rate_limit_events (action, business_id, created_at);
