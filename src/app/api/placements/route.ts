import { NextRequest } from 'next/server';
import { withWorkspace,readBody } from '@/server/http';
import { listPlacementsPage,savePlacement } from '@/server/placements';
import { getWorkspaceClock } from '@/server/clock';
import { reconcileWorkspace } from '@/server/reconcile';
export async function GET(request:NextRequest){return withWorkspace(request,w=>listPlacementsPage(w,{
 page:request.nextUrl.searchParams.get('page'),
 pageSize:request.nextUrl.searchParams.get('pageSize'),
 search:request.nextUrl.searchParams.get('search')??'',
}));}
export async function POST(request:NextRequest){return withWorkspace(request,async w=>{
 const body=await readBody(request);const result=await savePlacement(w,body.placement,String(body.key??''));
 await reconcileWorkspace(w,getWorkspaceClock().operationsDate);return result;
});}
