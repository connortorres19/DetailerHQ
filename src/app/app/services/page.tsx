import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ClipboardList, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { EmptyState, Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listCategories, listServices } from '@/data/services';
import { requireBusiness } from '@/data/session';
import { durationSummary, priceSummary } from '@/domain/service';
import { moveService } from './actions';
import { Categories } from './Categories';
import styles from './services.module.css';

export const metadata: Metadata = { title: 'Services' };

const SAVED: Record<string, ['positive' | 'critical', string]> = {
  created: ['positive', 'Service added.'],
  updated: ['positive', 'Service saved.'],
  archived: ['positive', 'Service archived. Restore it from Archived any time.'],
  restored: ['positive', 'Service restored.'],
  'category-deleted': ['positive', 'Category deleted.'],
  'category-in-use': ['critical', 'That category still has services (including archived ones). Move them to another category first.'],
  missing: ['critical', 'We couldn’t find that. It may have been removed.'],
};

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ view?: string; saved?: string }> }) {
  await requireBusiness('/app/services');
  const params = await searchParams;
  const archived = params.view === 'archived';
  const [services, categories] = await Promise.all([listServices(archived), listCategories()]);
  const flash = params.saved ? SAVED[params.saved] : undefined;

  // Categories in their order, then services without a category.
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name })), { id: null, name: categories.length ? 'Other' : 'Services' }]
    .map((g) => ({ ...g, services: services.filter((s) => s.category_id === g.id) }))
    .filter((g) => g.services.length);

  return (
    <>
      <PageHeader
        title="Services"
        description="What you offer, how long it takes and what it costs, by vehicle size."
        actions={
          <ButtonLink href="/app/services/new" variant="primary" icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true" />}>
            Add service
          </ButtonLink>
        }
      />
      {flash ? (
        <div className={styles.flash}>
          <Notice tone={flash[0]}>{flash[1]}</Notice>
        </div>
      ) : null}

      <nav className={styles.tabs} aria-label="Service status">
        <Link href="/app/services" aria-current={!archived ? 'page' : undefined}>
          Active
        </Link>
        <Link href="/app/services?view=archived" aria-current={archived ? 'page' : undefined}>
          Archived
        </Link>
      </nav>

      {groups.length === 0 ? (
        <Panel flush>
          {archived ? (
            <EmptyState title="No archived services" body="Services you archive appear here and can be restored." />
          ) : (
            <EmptyState
              icon={<ClipboardList size={20} strokeWidth={1.5} />}
              title="No services yet"
              body="Add what you offer — packages, single services and add-ons — with prices and times by vehicle size."
              action={<ButtonLink href="/app/services/new" size="sm">Add service</ButtonLink>}
            />
          )}
        </Panel>
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <Panel key={g.id ?? 'none'} title={g.name} id={`group-${g.id ?? 'none'}`} flush>
              <ul className={styles.list} role="list">
                {g.services.map((s, i) => (
                  <li key={s.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <Link href={`/app/services/${s.id}`} className={styles.rowLink}>
                        {s.name}
                      </Link>
                      <span className={styles.badges}>
                        {s.is_addon ? <StatusBadge tone="neutral">Add-on</StatusBadge> : null}
                        {s.is_bookable ? <StatusBadge tone="info">Online booking</StatusBadge> : null}
                      </span>
                      {s.description ? <p className={styles.description}>{s.description}</p> : null}
                    </div>
                    <div className={styles.rowFacts}>
                      <span className="tabular">{priceSummary(s, s.prices.map((p) => p.price_cents))}</span>
                      <span className={`${styles.muted} tabular`}>{durationSummary(s.base_duration_min, s.prices.map((p) => p.duration_min))}</span>
                    </div>
                    {archived ? null : (
                      <div className={styles.order}>
                        <form action={moveService.bind(null, s.id, 'up')}>
                          <button type="submit" disabled={i === 0} aria-label={`Move ${s.name} up`}>
                            <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </form>
                        <form action={moveService.bind(null, s.id, 'down')}>
                          <button type="submit" disabled={i === g.services.length - 1} aria-label={`Move ${s.name} down`}>
                            <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      {archived ? null : <Categories categories={categories} />}
    </>
  );
}
