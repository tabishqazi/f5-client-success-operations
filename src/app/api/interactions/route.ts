import { NextRequest } from 'next/server';
import { getWorkspaceClock } from '@/server/clock';
import { readBody,withWorkspace } from '@/server/http';
import { recordContactOutcome } from '@/server/mutations';

export async function POST(request:NextRequest){return withWorkspace(request,async workspaceId=>{
 const body=await readBody(request);return recordContactOutcome(workspaceId,body.outcome,body.key,getWorkspaceClock().instant);
});}
