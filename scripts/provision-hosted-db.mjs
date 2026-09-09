import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) throw new Error('MIGRATION_DATABASE_URL is required.');
const parsed = new URL(migrationUrl);
if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('Hosted provisioning refuses a local database.');

const runtimePassword = process.env.HOSTED_RUNTIME_PASSWORD ?? randomBytes(32).toString('base64url');
const admin = postgres(migrationUrl, { max: 1, prepare: false, onnotice: () => {} });
try {
  await admin.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(75261007)`;
    await tx.unsafe("do $$ begin if not exists (select 1 from pg_roles where rolname='f5_app') then create role f5_app login; end if; end $$");
    const [{ command }] = await tx`
      select format('alter role f5_app password %L', ${runtimePassword}::text) as command
    `;
    await tx.unsafe(command);
  });
} finally {
  await admin.end();
}

const runtimeUrl = new URL(migrationUrl);
const projectSuffix = parsed.username.startsWith('postgres.') ? parsed.username.slice('postgres'.length) : '';
runtimeUrl.username = `f5_app${projectSuffix}`;
runtimeUrl.password = runtimePassword;
if (runtimeUrl.port === '5432') runtimeUrl.port = '6543';

writeFileSync('.env.hosted.local', [
  `MIGRATION_DATABASE_URL=${migrationUrl}`,
  `DATABASE_URL=${runtimeUrl.toString()}`,
  'APP_ORIGIN=',
  '',
].join('\n'), { encoding: 'utf8', mode: 0o600 });
console.log('Created the restricted f5_app database role and wrote ignored .env.hosted.local.');
