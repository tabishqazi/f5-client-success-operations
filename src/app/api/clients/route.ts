import { NextRequest } from 'next/server';
import { getWorkspaceClock } from '@/server/clock';
import { listClientsPage } from '@/server/clients';
import { withWorkspace } from '@/server/http';
import { reconcileWorkspace } from '@/server/reconcile';

export async function GET(request: NextRequest) {
  return withWorkspace(request, async workspaceId => {
    const clock = getWorkspaceClock();
    await reconcileWorkspace(workspaceId, clock.operationsDate);
    return listClientsPage(workspaceId, {
      page: request.nextUrl.searchParams.get('page'),
      pageSize: request.nextUrl.searchParams.get('pageSize'),
      search: request.nextUrl.searchParams.get('search') ?? '',
    }, clock.instant);
  });
}
