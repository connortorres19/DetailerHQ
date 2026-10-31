'use client';

import { useActionState, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Panel } from '@/components/app/ui/Panel';
import { Notice } from '@/components/app/ui/Notice';
import { ConfirmAction } from '@/components/app/ui/ConfirmAction';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { createCategory, deleteCategory, moveCategory, renameCategory } from './actions';
import styles from './services.module.css';

type Category = { id: string; name: string; serviceCount: number };

function CategoryRow({ category, first, last }: { category: Category; first: boolean; last: boolean }) {
  const [state, action] = useActionState(renameCategory.bind(null, category.id), idle);
  const [editing, setEditing] = useState(false);
  return (
    <li className={styles.categoryRow}>
      {editing && state.status !== 'success' ? (
        <form action={action} className={styles.inlineForm}>
          <label htmlFor={`cat-${category.id}`} className="visually-hidden">
            Category name
          </label>
          <input id={`cat-${category.id}`} name="name" defaultValue={state.values?.name ?? category.name} maxLength={60} className={styles.inlineInput} aria-invalid={state.fieldErrors?.name ? true : undefined} />
          <SubmitButton variant="secondary">Save</SubmitButton>
          <button type="button" className={styles.textLink} onClick={() => setEditing(false)}>
            Cancel
          </button>
          {state.status === 'error' ? <p className={styles.error}>{state.message}</p> : null}
        </form>
      ) : (
        <>
          <span className={styles.categoryName}>
            {state.status === 'success' ? state.values?.name : category.name}
            <span className={styles.muted}> · {category.serviceCount} {category.serviceCount === 1 ? 'service' : 'services'}</span>
          </span>
          <span className={styles.categoryActions}>
            <form action={moveCategory.bind(null, category.id, 'up')}>
              <button type="submit" disabled={first} aria-label={`Move ${category.name} up`} className={styles.iconButton}>
                <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </form>
            <form action={moveCategory.bind(null, category.id, 'down')}>
              <button type="submit" disabled={last} aria-label={`Move ${category.name} down`} className={styles.iconButton}>
                <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </form>
            <button type="button" className={styles.textLink} onClick={() => setEditing(true)}>
              Rename
            </button>
            {category.serviceCount === 0 ? (
              <ConfirmAction action={deleteCategory.bind(null, category.id)} label="Delete" confirmLabel="Delete category" message={`Delete the empty category “${category.name}”?`} />
            ) : null}
          </span>
        </>
      )}
    </li>
  );
}

export function Categories({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState(createCategory, idle);
  return (
    <div className={styles.categories}>
      <Panel title="Categories" id="categories">
        <p className={styles.muted}>Group services on your booking page, e.g. Exterior, Interior, Protection.</p>
        {categories.length ? (
          <ul className={styles.categoryList} role="list">
            {categories.map((c, i) => (
              <CategoryRow key={c.id} category={c} first={i === 0} last={i === categories.length - 1} />
            ))}
          </ul>
        ) : null}
        <form action={action} className={styles.inlineForm} key={state.status === 'success' ? state.message : 'new'}>
          <label htmlFor="new-category" className="visually-hidden">
            New category name
          </label>
          <input id="new-category" name="name" placeholder="New category" maxLength={60} className={styles.inlineInput} aria-invalid={state.fieldErrors?.name ? true : undefined} />
          <SubmitButton variant="secondary">Add category</SubmitButton>
        </form>
        {state.status === 'error' ? <p className={styles.error}>{state.message}</p> : null}
        {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      </Panel>
    </div>
  );
}
