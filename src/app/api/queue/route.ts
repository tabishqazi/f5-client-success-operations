import { NextRequest } from 'next/server';
import { withWorkspace } from '@/server/http';
import { getWorkspaceClock } from '@/server/clock';
import { getQueue } from '@/server/queue';
export async function POST(request:NextRequest){return withWorkspace(request,w=>{
 const clock=getWorkspaceClock();const scope=request.nextUrl.searchParams.get('scope')==='upcoming'?'upcoming':'today';
 return getQueue(w,clock.instant,clock.operationsDate,scope);
});}
