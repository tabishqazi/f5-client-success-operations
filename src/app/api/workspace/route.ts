import { NextRequest,NextResponse } from 'next/server';
import { createWorkspace,resolveSession,SESSION_COOKIE,rateLimit,workspaceSummary } from '@/server/context';
import { safely,checkOrigin,withWorkspace } from '@/server/http';
import { addCalendarDaysToInstant } from '@/domain/clock';
export async function POST(request:NextRequest) {
 let created:Awaited<ReturnType<typeof createWorkspace>>|undefined;
 const response=await safely(async()=>{
  checkOrigin(request);
  const token=request.cookies.get(SESSION_COOKIE)?.value;
  if(token){await resolveSession(token);return {ready:true};}
  // Global bound resists arbitrary forwarded-IP spoofing at this stage.
  await rateLimit('workspace-bootstrap',200,3600);
  created=await createWorkspace();
  return {ready:true};
 });
 // Retain the expired credential so expiry displays an error instead of silently
 // bootstrapping replacement records. Server authorization still ends at 7 days.
 if(created && response.ok)response.cookies.set(SESSION_COOKIE,created.token,{httpOnly:true,secure:new URL(process.env.APP_ORIGIN!).protocol==='https:',sameSite:'strict',path:'/',expires:new Date(addCalendarDaysToInstant(created.expiresAt.toISOString(),365))});
 return response;
}
export async function GET(request:NextRequest):Promise<NextResponse> { return withWorkspace(request,workspaceSummary); }
