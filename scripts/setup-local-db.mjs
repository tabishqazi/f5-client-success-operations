import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from './local-env.mjs';
import postgres from 'postgres';

// Only this project's own local Compose database. Never consumes hosted configuration.
if (!existsSync('.env.local')) {
  const password = randomBytes(24).toString('hex');
  const runtimePassword = randomBytes(24).toString('hex');
  writeFileSync('.env.local', `POSTGRES_PASSWORD=${password}\nLOCAL_RUNTIME_PASSWORD=${runtimePassword}\nDATABASE_URL=postgres://f5_app:${runtimePassword}@127.0.0.1:55439/f5_operations\nMIGRATION_DATABASE_URL=postgres://f5_owner:${password}@127.0.0.1:55439/f5_operations\nTEST_DATABASE_URL=postgres://f5_owner:${password}@127.0.0.1:55439/f5_operations_test\nTEST_RUNTIME_DATABASE_URL=postgres://f5_app:${runtimePassword}@127.0.0.1:55439/f5_operations_test\nAPP_ORIGIN=http://127.0.0.1:3210\n`, { flag: 'wx' });
}
loadLocalEnv();
const url = new URL(process.env.MIGRATION_DATABASE_URL ?? 'http://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/f5_operations' || !process.env.LOCAL_RUNTIME_PASSWORD) {
  throw new Error('Local setup requires this project’s dedicated localhost database configuration.');
}
const command = spawnSync('docker', ['compose', '--env-file', '.env.local', 'up', '-d', '--wait', 'db'], { stdio: 'inherit' });
if (command.status !== 0) process.exit(command.status ?? 1);
const sql = postgres(process.env.MIGRATION_DATABASE_URL, { max: 1, prepare: false });
try {
  if (!(await sql`select 1 from pg_database where datname = 'f5_operations_test'`).length) await sql.unsafe('CREATE DATABASE f5_operations_test');
  if (!(await sql`select 1 from pg_roles where rolname = 'f5_app'`).length) await sql.unsafe('CREATE ROLE f5_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
  const password = process.env.LOCAL_RUNTIME_PASSWORD;
  if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('Invalid locally generated credential format.');
  await sql.unsafe(`ALTER ROLE f5_app PASSWORD '${password}'`);
  console.log('Dedicated application and test databases are ready. Credentials remain in ignored .env.local.');
} finally { await sql.end(); }
