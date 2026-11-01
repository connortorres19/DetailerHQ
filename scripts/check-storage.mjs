#!/usr/bin/env node
// Local diagnosis for Phase 6 images: is Supabase Storage enabled, running and initialised, and is
// the Phase 6 migration applied? Read-only — it changes nothing. Prints the exact fix for each problem.
//
//   npm run storage:check
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m, fix) => {
  console.log(`  ✗ ${m}\n      → ${fix}`);
  problems += 1;
};
let problems = 0;

console.log('Supabase Storage (Phase 6)');

// 1. Configuration.
const config = readFileSync('supabase/config.toml', 'utf8');
const storageSection = config.split(/^\[storage\]\s*$/m)[1]?.split(/^\[/m)[0] ?? '';
if (/^enabled\s*=\s*true/m.test(storageSection)) ok('supabase/config.toml: [storage] enabled = true');
else bad('supabase/config.toml: Storage is not enabled', 'set `enabled = true` under [storage] (git pull the Phase 6 config), then restart: npx supabase stop && npx supabase start');
if (/^\[storage\.buckets\.business-media\]/m.test(config)) ok('supabase/config.toml: business-media bucket declared');
else bad('supabase/config.toml: business-media bucket not declared', 'git pull the Phase 6 config');

// 2. The running stack.
let status;
try {
  status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  ok('local Supabase stack is running');
} catch {
  bad('local Supabase stack is not running', 'npx supabase start');
  process.exit(1);
}
let containers = '';
try {
  containers = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
} catch {
  /* docker CLI unavailable: skip this check */
}
if (containers) {
  if (/supabase_storage_/.test(containers)) ok('Storage container is running');
  else
    bad(
      'Storage container is not running (the stack was started before Storage was enabled, or with -x storage)',
      'npx supabase stop && npx supabase start   (keeps your data; `supabase start` alone keeps an already-running stack’s old settings)',
    );
}

// 3. The database.
const db = new pg.Client({ connectionString: status.DB_URL });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const { schema, buckets, objects } = await q(
  `select to_regnamespace('storage') is not null as schema, to_regclass('storage.buckets') is not null as buckets,
          to_regclass('storage.objects') is not null as objects`,
);
if (schema && buckets && objects) ok('storage schema initialised (storage.buckets, storage.objects)');
else bad('storage schema is missing — Storage has never run against this database', 'npx supabase stop && npx supabase start, then run this check again');

const applied = (await q(`select exists (select 1 from supabase_migrations.schema_migrations where version = '20261102120000') as v`)).v;
if (applied) ok('migration 20261102120000_branding_media applied');
else bad('migration 20261102120000_branding_media not applied yet', 'npx supabase migration up --local   (after Storage is initialised)');

if (buckets) {
  const bucket = await q(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'business-media'`);
  if (bucket && bucket.public === false && String(bucket.allowed_mime_types) === 'image/webp') ok('bucket business-media: private, WebP only');
  else bad('bucket business-media missing or misconfigured', 'npx supabase migration up --local (creates it), or npx supabase seed buckets --local');
}
if (objects) {
  const { n } = await q(`select count(*)::int as n from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'business_media_%'`);
  if (n === 3) ok('Storage rules (read, insert, delete) in place');
  else bad(`Storage rules missing (${n} of 3)`, 'npx supabase migration up --local');
}
await db.end();

console.log(problems ? `\n${problems} problem(s). Fix them in order, then run: npm run storage:check` : '\nAll good — image uploads will work locally.');
process.exit(problems ? 1 : 0);
