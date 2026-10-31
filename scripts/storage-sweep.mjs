#!/usr/bin/env node
// Operator maintenance (not app code): deletes files in the `business-media` bucket that no longer
// have a media_assets row — e.g. after a closed business's data was deleted by
// app.delete_business_data (SQL can't remove Storage files). Files without a row are already
// unreadable (every Storage rule needs a row); this frees the space.
//
// Local:      node scripts/storage-sweep.mjs            (reads `supabase status`)
// Production: SUPABASE_URL=… SUPABASE_SECRET_KEY=… DATABASE_URL=… node scripts/storage-sweep.mjs
// Options:    --dry-run (list only) · --min-age-minutes=N (default 60; skips very recent files)
//
// The app itself never holds a Storage or service key (src/lib/env.ts); only this script does,
// run by an operator from a trusted machine.
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const dryRun = args.has('dry-run');
const minAge = Number(args.get('min-age-minutes') ?? 60);

let { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key, DATABASE_URL: dbUrl } = process.env;
if (!url || !key || !dbUrl) {
  const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' }));
  url ??= status.API_URL;
  key ??= status.SECRET_KEY;
  dbUrl ??= status.DB_URL;
}

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const { rows } = await db.query(
  `select o.name from storage.objects o
    where o.bucket_id = 'business-media'
      and o.created_at < now() - make_interval(mins => $1)
      and not exists (select 1 from public.media_assets m where m.storage_path = o.name)
    order by o.created_at`,
  [minAge],
);
await db.end();

const names = rows.map((r) => r.name);
console.log(`${names.length} file(s) without a media row${dryRun ? ' (dry run)' : ''}`);
if (dryRun || names.length === 0) process.exit(0);

const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from('business-media');
for (let i = 0; i < names.length; i += 100) {
  const { error } = await storage.remove(names.slice(i, i + 100));
  if (error) {
    console.error(`Stopped: ${error.message}`);
    process.exit(1);
  }
}
console.log(`Deleted ${names.length} file(s).`);
