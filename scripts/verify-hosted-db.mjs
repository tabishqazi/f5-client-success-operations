import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const parsed = new URL(process.env.DATABASE_URL);
if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error('Hosted verification refuses a local database.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [identity] = await sql`
    select current_user as role, current_database() as database,
      roles.rolsuper as superuser, roles.rolbypassrls as bypass_rls
    from pg_roles roles
    where roles.rolname = current_user
  `;
  if (identity?.role !== 'f5_app') throw new Error(`Expected f5_app runtime role, received ${identity?.role ?? 'unknown'}.`);
  if (identity.superuser || identity.bypass_rls) throw new Error('Runtime role must not bypass database isolation.');
  const [privileges] = await sql`
    select
      has_schema_privilege(current_user, 'f5', 'usage') as schema_usage,
      has_schema_privilege(current_user, 'f5', 'create') as schema_create,
      has_table_privilege(current_user, 'f5.placements', 'select') as placement_read
  `;
  if (!privileges?.schema_usage || !privileges?.placement_read || privileges.schema_create) {
    throw new Error('Runtime role has an invalid privilege boundary.');
  }
  await sql.begin(async (tx) => {
    await tx`select set_config('f5.workspace_id', '00000000-0000-0000-0000-000000000000', true)`;
    const [scope] = await tx`select count(*)::int as total from f5.placements`;
    if (scope?.total !== 0) throw new Error('Workspace row-level security did not isolate the empty verification scope.');
  });
  console.log('Hosted runtime role and workspace isolation verified.');
} finally {
  await sql.end();
}
