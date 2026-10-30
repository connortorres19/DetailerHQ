#!/usr/bin/env node
// Operator tool for the invite-only pilot, LOCAL STACK ONLY:
//   npm run invite -- owner@example.com
// Sends a Supabase invitation (caught by Mailpit at http://127.0.0.1:54324 locally). The owner
// opens it, sets a password and goes through onboarding. On a hosted project, invite owners
// from the Supabase dashboard instead — the app never holds a secret key.
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Usage: npm run invite -- owner@example.com');
  process.exit(1);
}

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(status.API_URL)) {
  console.error('Refusing to run against a non-local Supabase project.');
  process.exit(1);
}
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await admin.auth.admin.inviteUserByEmail(email);
if (error) {
  console.error(`Invite failed: ${error.message}`);
  process.exit(1);
}
console.log(`Invitation sent to ${email}. Open it in Mailpit: http://127.0.0.1:54324`);
