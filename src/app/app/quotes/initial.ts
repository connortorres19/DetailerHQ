import 'server-only';
import type { CustomerChoice } from '@/data/appointments';
import { getCustomerChoice } from '@/data/appointments';
import type { LeadRow, QuoteRow } from '@/data/leads';
import { priceFor, type PublicService } from '@/domain/booking';
import { formatPhone } from '@/domain/business';
import { centsToInput } from '@/domain/service';
import { wallClock } from '@/domain/time';
import type { QuoteEditorInitial } from './QuoteEditor';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const blank = (today: string): QuoteEditorInitial => ({
  leadId: null,
  customer: null,
  newCustomer: { firstName: '', lastName: '', phone: '', email: '' },
  vehicleId: null,
  newVehicle: { year: '', make: '', model: '' },
  sizeId: '',
  lines: [],
  discount: '',
  validUntil: addDays(today, 14),
  proposedDate: '',
  proposedTime: '',
  notes: '',
  terms: '',
  internalNotes: '',
});

// A new quote from a lead: its customer (or contact details), vehicle, requested service and request.
export async function fromLead(lead: LeadRow, today: string, service: PublicService | null): Promise<QuoteEditorInitial> {
  const customer = lead.customer_id ? await getCustomerChoice(lead.customer_id) : null;
  return {
    ...blank(today),
    leadId: lead.id,
    customer,
    newCustomer: { firstName: lead.contact_first_name, lastName: lead.contact_last_name ?? '', phone: formatPhone(lead.contact_phone_e164), email: lead.contact_email ?? '' },
    vehicleId: lead.vehicle_id ?? (customer ? 'new' : null),
    newVehicle: { year: lead.vehicle_year ? String(lead.vehicle_year) : '', make: lead.vehicle_make ?? '', model: lead.vehicle_model ?? '' },
    sizeId: lead.size_class_id ?? '',
    lines: service
      ? [(() => {
          const p = priceFor(service, lead.size_class_id);
          return { serviceId: service.id, name: service.name, description: service.description ?? '', quantity: '1', price: centsToInput(p.priceCents), durationMin: String(p.durationMin) };
        })()]
      : [],
    notes: lead.request_text ?? '',
  };
}

export async function fromCustomer(customerId: string, today: string): Promise<QuoteEditorInitial> {
  const customer: CustomerChoice | null = await getCustomerChoice(customerId);
  return { ...blank(today), customer, vehicleId: customer?.vehicles[0]?.id ?? null, sizeId: customer?.vehicles[0]?.sizeId ?? '' };
}

export const empty = blank;

export function fromQuote(q: QuoteRow, customer: CustomerChoice | null, tz: string): QuoteEditorInitial {
  const proposed = q.proposed_start ? wallClock(tz, new Date(q.proposed_start)) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    leadId: q.lead_id,
    customer,
    newCustomer: { firstName: '', lastName: '', phone: '', email: '' },
    vehicleId: q.vehicle_id,
    newVehicle: { year: '', make: '', model: '' },
    sizeId: q.vehicle?.size_class_id ?? '',
    lines: q.quote_items.map((i) => ({
      serviceId: i.service_id ?? '',
      name: i.name,
      description: i.description ?? '',
      quantity: String(i.quantity),
      price: centsToInput(i.price_cents),
      durationMin: i.duration_min == null ? '' : String(i.duration_min),
    })),
    discount: q.discount_cents ? centsToInput(q.discount_cents) : '',
    validUntil: q.valid_until ?? '',
    proposedDate: proposed ? `${proposed.year}-${pad(proposed.month)}-${pad(proposed.day)}` : '',
    proposedTime: proposed ? `${pad(proposed.hour)}:${pad(proposed.minute)}` : '',
    notes: q.notes ?? '',
    terms: q.terms ?? '',
    internalNotes: q.internal_notes ?? '',
  };
}
