import postgres from 'postgres';
import { loadLocalEnv } from './local-env.mjs';

if(process.argv.includes('--help')){
 console.log('Local development only: npm run db:cleanup -- --workspace UUID [--test] [--confirm-delete]. Without --confirm-delete this is a dry run. Only a workspace with no valid session can be removed.');
 process.exit(0);
}
loadLocalEnv();
const args=process.argv.slice(2);
const id=args[args.indexOf('--workspace')+1];
if(!args.includes('--workspace') || !/^[a-f0-9-]{36}$/i.test(id??''))throw new Error('Supply one explicit --workspace UUID. Use --help for details.');
const testing=args.includes('--test');
const url=testing?process.env.TEST_DATABASE_URL:process.env.MIGRATION_DATABASE_URL;
const parsed=new URL(url??'http://invalid');
if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'||parsed.pathname!==(testing?'/f5_operations_test':'/f5_operations'))throw new Error('Cleanup is restricted to this project’s dedicated local database.');
const sql=postgres(url,{max:1,prepare:false,onnotice:()=>{}});
try{
 await sql.begin(async tx=>{
  const [workspace]=await tx`select id from f5.workspaces where id=${id} for update`;
  if(!workspace)throw new Error('Workspace not found.');
  if((await tx`select token_hash from f5.sessions where workspace_id=${id} and expires_at>now()`).length)throw new Error('Workspace has a valid session. No records removed.');
  const [count]=await tx`select count(*)::int total from f5.placements where workspace_id=${id}`;
  if(!args.includes('--confirm-delete')){console.log(`Dry run: ${count.total} placements would be removed from ${id}. No records changed.`);return;}
  await tx`delete from f5.workspaces where id=${id}`;
  console.log(`Removed expired local workspace ${id} and its related records.`);
 });
}finally{await sql.end();}
