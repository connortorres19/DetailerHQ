import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { EmptyState, Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PAGE_SIZE, duplicateIds, listCustomers } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { formatPhone } from '@/domain/business';
import { customerName, vehicleName } from '@/domain/customer';
import styles from './customers.module.css';

export const metadata: Metadata = { title: 'Customers' };

type Search = { q?: string; view?: string; page?: string; missing?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireBusiness('/app/customers');
  const params = await searchParams;
  const archived = params.view === 'archived';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const q = (params.q ?? '').slice(0, 60);
  const { customers, total } = await listCustomers({ q, archived, page });
  const duplicates = archived ? new Set<string>() : await duplicateIds(customers);

  const link = (over: Partial<Search>) => {
    const s = new URLSearchParams();
    const next = { q, view: archived ? 'archived' : undefined, ...over };
    Object.entries(next).forEach(([k, v]) => v && s.set(k, String(v)));
    const qs = s.toString();
    return `/app/customers${qs ? `?${qs}` : ''}`;
  };
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          <ButtonLink href="/app/customers/new" variant="primary" icon={<UserPlus size={16} strokeWidth={1.5} aria-hidden="true" />}>
            Add customer
          </ButtonLink>
        }
      />
      {params.missing ? (
        <div className={styles.flash}>
          <Notice tone="critical">We couldn’t find that customer.</Notice>
        </div>
      ) : null}

      <div className={styles.filters}>
        <nav className={styles.tabs} aria-label="Customer status">
          <Link href={link({ view: undefined, page: undefined })} aria-current={!archived ? 'page' : undefined}>
            Active
          </Link>
          <Link href={link({ view: 'archived', page: undefined })} aria-current={archived ? 'page' : undefined}>
            Archived
          </Link>
        </nav>
        <form className={styles.search} role="search" action="/app/customers">
          {archived ? <input type="hidden" name="view" value="archived" /> : null}
          <Search size={16} strokeWidth={1.5} aria-hidden="true" className={styles.searchIcon} />
          <label htmlFor="customer-search" className="visually-hidden">
            Search customers
          </label>
          <input id="customer-search" name="q" type="search" defaultValue={q} placeholder="Name, phone or email" className={styles.searchInput} />
        </form>
      </div>

      <Panel flush>
        {customers.length === 0 ? (
          q ? (
            <EmptyState title={`No matches for “${q}”`} body="Try a name, phone number or email." action={<ButtonLink href={link({ q: undefined })} size="sm">Clear search</ButtonLink>} />
          ) : archived ? (
            <EmptyState title="No archived customers" body="Customers you archive appear here and can be restored." />
          ) : (
            <EmptyState
              icon={<Users size={20} strokeWidth={1.5} />}
              title="No customers yet"
              body="Add the customers you already work with. Customers from booking requests will join them later."
              action={<ButtonLink href="/app/customers/new" size="sm">Add customer</ButtonLink>}
            />
          )
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Phone</th>
                <th scope="col">Email</th>
                <th scope="col" className={styles.num}>
                  Vehicles
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const vehicles = c.vehicles.filter((v) => !v.archived_at);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/app/customers/${c.id}`} className={styles.rowLink}>
                        {customerName(c)}
                      </Link>
                      <span className={styles.secondary}>
                        {vehicles.length ? vehicles.map(vehicleName).join(', ') : 'No vehicles'}
                        <span className={styles.mobileContact}>{[formatPhone(c.phone_e164), c.email].filter(Boolean).join(' · ')}</span>
                      </span>
                      {c.archived_at ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
                      {duplicates.has(c.id) ? <StatusBadge tone="attention">Possible duplicate</StatusBadge> : null}
                    </td>
                    <td className="tabular">{formatPhone(c.phone_e164)}</td>
                    <td>{c.email}</td>
                    <td className={`${styles.num} tabular`}>{vehicles.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {total > PAGE_SIZE || page > 1 ? (
        <nav className={styles.pagination} aria-label="Pages">
          <span className="tabular">
            Showing {from}–{to} of {total}
          </span>
          <span className={styles.pageLinks}>
            {page > 1 ? <Link href={link({ page: String(page - 1) })}>Previous</Link> : null}
            {to < total ? <Link href={link({ page: String(page + 1) })}>Next</Link> : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}
