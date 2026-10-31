import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { db } from './support';
import { ownerWithBusiness } from './support-app';

// A bookable business for the public booking tests: a real owner onboarded through the UI, then
// hours, a priced menu and publishing set up directly (the owner screens for those have their
// own specs). Services: Full detail ($180 / 3h; Large SUV / Truck $240 / 4h), Exterior wash
// (from $60 / 1h), Pet hair removal add-on ($40 / 30m), Ceramic coating (quote required).
export async function bookableBusiness(
  page: Page,
  tag: string,
  { instant = false, published = true, name = 'Northside Detail Co.' }: { instant?: boolean; published?: boolean; name?: string } = {},
) {
  const owner = await ownerWithBusiness(page, tag, name);
  const b = owner.businessId;
  await db.query(`update public.businesses set activated_at = now(), account_status = 'pilot', service_area_text = 'North Austin & Round Rock' where id = $1`, [b]);
  await db.query(
    `insert into public.availability_rules (business_id, weekday, start_time, end_time)
     select $1, d, '08:00', '18:00' from generate_series(0, 6) d`,
    [b],
  );
  await db.query(
    `update public.booking_settings set min_notice_min = 60, horizon_days = 30, buffer_min = 30, slot_interval_min = 60,
            cancel_cutoff_hours = 24, customer_can_cancel = true, intro_text = 'Hand-washed, never rushed. Interior and exterior detailing at your home or office.',
            cancellation_policy_text = 'Please give us 24 hours notice if your plans change.'
      where business_id = $1`,
    [b],
  );
  const { rows: [cat] } = await db.query(`insert into public.service_categories (business_id, name, sort_order) values ($1, 'Detailing packages', 1) returning id`, [b]);
  const svc = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0].id as string;
  const fullDetail = await svc(
    `insert into public.services (business_id, category_id, name, description, price_type, base_price_cents, base_duration_min, is_bookable, sort_order)
     values ($1, $2, 'Full detail', 'Interior and exterior, clay bar and sealant.', 'fixed', 18000, 180, true, 1) returning id`,
    [b, cat.id],
  );
  const wash = await svc(
    `insert into public.services (business_id, category_id, name, description, price_type, base_price_cents, base_duration_min, is_bookable, sort_order)
     values ($1, $2, 'Exterior wash', 'Hand wash and dry.', 'starting_at', 6000, 60, true, 2) returning id`,
    [b, cat.id],
  );
  const petHair = await svc(
    `insert into public.services (business_id, name, price_type, base_price_cents, base_duration_min, is_bookable, is_addon, sort_order)
     values ($1, 'Pet hair removal', 'fixed', 4000, 30, true, true, 3) returning id`,
    [b],
  );
  const ceramic = await svc(
    `insert into public.services (business_id, name, description, price_type, base_duration_min, is_bookable, sort_order)
     values ($1, 'Ceramic coating', 'Multi-year protection, quoted after inspection.', 'quote_required', 480, false, 4) returning id`,
    [b],
  );
  const { rows: sizes } = await db.query('select id, name from public.vehicle_size_classes where business_id = $1 order by sort_order', [b]);
  const large = sizes.find((s) => s.name === 'Large SUV / Truck')!.id as string;
  await db.query(`insert into public.service_prices (business_id, service_id, size_class_id, price_cents, duration_min) values ($1, $2, $3, 24000, 240)`, [b, fullDetail, large]);
  if (instant) await db.query(`update public.booking_settings set booking_mode = 'instant' where business_id = $1`, [b]);
  if (published) await db.query('update public.businesses set published_at = now(), accepting_requests = true where id = $1', [b]);
  const { rows: [{ slug }] } = await db.query('select slug from public.businesses where id = $1', [b]);
  return { ...owner, slug: slug as string, services: { fullDetail, wash, petHair, ceramic }, sizes: { large, car: sizes[0].id as string } };
}

// Each test acts from its own client address, so per-IP rate limits never spill between tests
// (the app hashes x-forwarded-for; see src/lib/booking/server.ts).
export async function asVisitor(page: Page) {
  const address = `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': address });
  return address;
}

// The HMAC the server keys rate limits on (secret from .env.local, written by `npm run env:local`).
export function ipHash(address: string) {
  const env = readFileSync('.env.local', 'utf8');
  const secret = env.match(/^BOOKING_HASH_SECRET=(.+)$/m)?.[1];
  if (!secret) throw new Error('BOOKING_HASH_SECRET missing from .env.local — run npm run env:local');
  return createHmac('sha256', secret).update(address).digest();
}

// Walks the flow to the Time step and picks the first open start time; returns its label.
export async function pickFirstTime(page: Page) {
  await page.getByRole('button', { name: 'Choose a time' }).click();
  const times = page.getByRole('radiogroup', { name: 'Start times' }).getByRole('radio');
  await expect(times.first()).toBeVisible();
  const label = (await times.first().textContent())!;
  await times.first().click();
  return label;
}

export async function fillDetails(page: Page, overrides: Record<string, string> = {}) {
  const v = {
    'First name': 'Jordan',
    'Last name': 'Reyes',
    'Mobile phone': '(512) 555-0142',
    Email: 'jordan.reyes@example.com',
    Year: '2021',
    Make: 'Tesla',
    Model: 'Model Y',
    'Street address': '1234 Oak St',
    City: 'Austin',
    State: 'TX',
    'ZIP code': '78701',
    ...overrides,
  };
  for (const [label, value] of Object.entries(v)) await page.getByLabel(label, { exact: true }).fill(value);
}

// A booking request as the public page stores it, with a known status-link token (the database
// keeps only its SHA-256), so a test can act as the customer through /r/<token>.
export async function seedRequest(
  biz: { businessId: string; services: { fullDetail: string; petHair: string }; sizes: { car: string } },
  opts: { daysAhead: number; time: string; first?: string; last?: string; phone?: string; email?: string; addon?: boolean; notes?: string; minutes?: number },
) {
  const token = randomBytes(32).toString('base64url');
  const minutes = opts.minutes ?? (opts.addon ? 210 : 180);
  const { rows: [r] } = await db.query(
    `insert into public.booking_requests (business_id, token_hash, idempotency_key, requested_start, requested_end, location_type,
       service_address_line1, service_city, service_state, service_postal_code, contact_first_name, contact_last_name,
       contact_phone_e164, contact_email, preferred_contact, vehicle_year, vehicle_make, vehicle_model, vehicle_size_class_id,
       vehicle_notes, customer_notes, consent_at, estimated_total_cents, estimate_is_minimum, estimated_duration_min)
     select $1, sha256($2::bytea), gen_random_uuid(), s, s + make_interval(mins => $3), 'mobile', '1234 Oak St', 'Austin', 'TX', '78701',
            $4, $5, $6, $7, 'text', 2021, 'Tesla', 'Model Y', $8, 'Dog hair in the back', $9, now(), $10, false, $3
       from (select ((now() at time zone 'America/Chicago')::date + $11::int + $12::time) at time zone 'America/Chicago' as s) t
     returning id, number, requested_start`,
    [biz.businessId, token, minutes, opts.first ?? 'Jordan', opts.last ?? 'Reyes', opts.phone ?? '+15125550142', opts.email ?? 'jordan.reyes@example.com',
     biz.sizes.car, opts.notes ?? null, opts.addon ? 22000 : 18000, opts.daysAhead, opts.time],
  );
  await db.query(
    `insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type, price_cents, duration_min, is_addon)
     values ($1, $2, $3, 'Full detail', 'fixed', 18000, 180, false)`,
    [biz.businessId, r.id, biz.services.fullDetail],
  );
  if (opts.addon) {
    await db.query(
      `insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type, price_cents, duration_min, is_addon)
       values ($1, $2, $3, 'Pet hair removal', 'fixed', 4000, 30, true)`,
      [biz.businessId, r.id, biz.services.petHair],
    );
  }
  return { id: r.id as string, number: r.number as number, token, start: r.requested_start as Date };
}
