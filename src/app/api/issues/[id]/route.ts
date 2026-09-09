import { NextRequest } from 'next/server';
import { getWorkspaceClock } from '@/server/clock';
import { readBody,withWorkspace } from '@/server/http';
import { updateIssue } from '@/server/mutations';

export async function PATCH(request:NextRequest,context:RouteContext<'/api/issues/[id]'>){
 const {id}=await context.params;
 return withWorkspace(request,async workspaceId=>{const body=await readBody(request);return updateIssue(workspaceId,id,body.command,body.key,getWorkspaceClock().instant);});
}
