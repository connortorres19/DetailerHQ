import { formatPhone } from '@/domain/business';
import type { Database } from '@/types/database';

type Customer = Database['public']['Tables']['customers']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];

// Database rows → form field values (for edit forms).
export const customerValues = (c: Customer): Record<string, string> => ({
  firstName: c.first_name,
  lastName: c.last_name ?? '',
  phone: formatPhone(c.phone_e164),
  email: c.email ?? '',
  preferredContact: c.preferred_contact ?? '',
  source: c.source ?? '',
  addressLine1: c.address_line1 ?? '',
  city: c.city ?? '',
  state: c.state ?? '',
  postalCode: c.postal_code ?? '',
  notes: c.notes ?? '',
});

export const vehicleValues = (v: Vehicle): Record<string, string> => ({
  year: v.year ? String(v.year) : '',
  make: v.make,
  model: v.model,
  trim: v.trim ?? '',
  color: v.color ?? '',
  plate: v.plate ?? '',
  sizeClassId: v.size_class_id ?? '',
  notes: v.notes ?? '',
});
