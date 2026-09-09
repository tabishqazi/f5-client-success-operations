import { NextRequest } from 'next/server';
import { withWorkspace,readBody } from '@/server/http';
import { getPlacement,savePlacement } from '@/server/placements';
import { getWorkspaceClock } from '@/server/clock';
import { reconcileWorkspace } from '@/server/reconcile';
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,context:Context){return withWorkspace(request,async w=>{const clock=getWorkspaceClock();await reconcileWorkspace(w,clock.operationsDate);return getPlacement(w,(await context.params).id,clock.instant);});}
export async function PATCH(request:NextRequest,context:Context){return withWorkspace(request,async w=>{
 const body=await readBody(request);const result=await savePlacement(w,body.placement,String(body.key??''),(await context.params).id,Number(body.version));
 await reconcileWorkspace(w,getWorkspaceClock().operationsDate);return result;
});}
