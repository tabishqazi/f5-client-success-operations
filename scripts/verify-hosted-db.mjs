import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const parsed = new URL(process.env.DATABASE_URL);
if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('Hosted verification refuses a local database.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [identity] = await sql`select current_user as role, current_database() as database`;
  if (identity?.role !== 'f5_app') throw new Error(`Expected f5_app runtime role, received ${identity?.role ?? 'unknown'}.`);
  const [migration] = await sql`select count(*)::int as total from public.f5_migrations`;
  await sql.begin(async (tx) => {
    await tx`select set_config('f5.workspace_id', '00000000-0000-0000-0000-000000000000', true)`;
    await tx`select count(*)::int as total from f5.placements`;
  });
  console.log(`Hosted runtime role verified with ${migration?.total ?? 0} recorded migrations.`);
} finally {
  await sql.end();
}
