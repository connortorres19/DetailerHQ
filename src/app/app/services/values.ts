import { centsToInput } from '@/domain/service';

type Service = {
  name: string;
  description: string | null;
  category_id: string | null;
  price_type: string;
  base_price_cents: number | null;
  base_duration_min: number;
  is_addon: boolean;
  is_bookable: boolean;
  prices: { size_class_id: string; price_cents: number | null; duration_min: number | null }[];
};

// Database row → form values (the same field names parseServiceForm reads).
export function serviceValues(s: Service): Record<string, string> {
  const values: Record<string, string> = {
    name: s.name,
    description: s.description ?? '',
    categoryId: s.category_id ?? '',
    priceType: s.price_type,
    basePrice: centsToInput(s.base_price_cents),
    baseHours: String(Math.floor(s.base_duration_min / 60)),
    baseMinutes: String(s.base_duration_min % 60),
  };
  if (s.is_addon) values.isAddon = 'on';
  if (s.is_bookable) values.isBookable = 'on';
  for (const p of s.prices) {
    values[`size.${p.size_class_id}.price`] = centsToInput(p.price_cents);
    if (p.duration_min != null) {
      values[`size.${p.size_class_id}.hours`] = String(Math.floor(p.duration_min / 60));
      values[`size.${p.size_class_id}.minutes`] = String(p.duration_min % 60);
    }
  }
  return values;
}
