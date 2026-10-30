#!/usr/bin/env node
// Scans the production build's browser assets (PRODUCT_PLAN §13.4: "bundle scan finds no
// service-role key, booking_api credential or server-only variable"). Run after `next build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.next/static';
const forbidden = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'Supabase secret key'],
  [/SUPABASE_SECRET|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE/, 'secret key variable name'],
  [/"role"\s*:\s*"service_role"|service_role/, 'service_role reference'],
  [/booking_api/, 'booking_api database role'],
  [/postgres(ql)?:\/\/[^"'\s]+/, 'database connection string'],
  [/Could not load customers|Could not load business|\[workflow:/, 'server-only data module'],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|css|html|json|map)$/.test(name)) files.push(path);
  }
})(ROOT);

let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [pattern, label] of forbidden) {
    const match = text.match(pattern);
    if (match) {
      problems += 1;
      console.error(`✗ ${label} in ${file}: ${match[0].slice(0, 40)}`);
    }
  }
}
if (problems) process.exit(1);
console.log(`✓ ${files.length} browser files scanned: no secret keys, database roles or server-only code.`);
