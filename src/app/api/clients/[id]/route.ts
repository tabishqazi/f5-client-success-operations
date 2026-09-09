import { NextRequest } from 'next/server';
import { getWorkspaceClock } from '@/server/clock';
import { getClient } from '@/server/clients';
import { withWorkspace } from '@/server/http';
import { reconcileWorkspace } from '@/server/reconcile';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withWorkspace(request, async workspaceId => {
    const clock = getWorkspaceClock();
    await reconcileWorkspace(workspaceId, clock.operationsDate);
    return getClient(workspaceId, (await context.params).id, clock.instant);
  });
}
