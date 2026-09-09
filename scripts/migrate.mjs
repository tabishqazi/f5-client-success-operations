import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { loadLocalEnv } from './local-env.mjs';
loadLocalEnv();
const testing = process.argv.includes('--test');
const url = testing ? process.env.TEST_DATABASE_URL : process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('Missing migration database configuration.');
if (testing && !new URL(url).pathname.endsWith('_test')) throw new Error('Test migration requires a database ending in _test.');
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(75261002)`;
    await tx`create table if not exists f5_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    for (const file of readdirSync('db/migrations').filter(f => f.endsWith('.sql')).sort()) {
      const source = readFileSync(`db/migrations/${file}`, 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const [applied] = await tx`select checksum from f5_migrations where name=${file}`;
      if (applied && applied.checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
      if (applied) continue;
      await tx.unsafe(source);
      await tx`insert into f5_migrations (name, checksum) values (${file}, ${checksum})`;
      console.log(`Applied ${file}`);
    }
    // Local role; hosted provisioning grants the equivalent rights to its app role.
    if ((await tx`select 1 from pg_roles where rolname='f5_app'`).length) {
      await tx.unsafe('GRANT USAGE ON SCHEMA f5 TO f5_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA f5 TO f5_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA f5 TO f5_app');
    }
  });
  console.log(testing ? 'Test schema current.' : 'Application schema current.');
} finally { await sql.end(); }
