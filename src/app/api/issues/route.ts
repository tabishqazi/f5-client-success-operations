import { NextRequest } from 'next/server';
import { getWorkspaceClock } from '@/server/clock';
import { readBody,withWorkspace } from '@/server/http';
import { listIssues } from '@/server/placements';
import { createIssue } from '@/server/mutations';
import { reconcileWorkspace } from '@/server/reconcile';
export async function GET(request:NextRequest){return withWorkspace(request,async workspaceId=>{const clock=getWorkspaceClock();await reconcileWorkspace(workspaceId,clock.operationsDate);return {items:await listIssues(workspaceId),asOf:clock.operationsDate};});}
export async function POST(request:NextRequest){return withWorkspace(request,async workspaceId=>{const body=await readBody(request);return createIssue(workspaceId,body.issue,body.key,getWorkspaceClock().instant);});}
