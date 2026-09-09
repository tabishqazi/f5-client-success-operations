import 'server-only';
import type { ClientAttention, ClientDetail, ClientPlacementSummary, ClientSummary } from '@/domain/client';
import { evaluateHealth, type HealthResult } from '@/domain/health';
import { validateClientListQuery } from '@/domain/pagination';
import { validateId } from '@/domain/placement';
import { DomainError } from '@/domain/errors';
import { scoped, type Tx } from './db';

type HealthFactRow = {
  id: string;
  client_id: string;
  latest_assessment: 'satisfied' | 'concerned' | 'unsatisfied' | null;
  latest_rating: number | null;
  has_active_issue: boolean;
  has_critical_issue: boolean;
  has_overdue_feedback: boolean;
};

const healthRank: Record<ClientAttention['status'], number> = { at_risk: 0, needs_attention: 1, unknown: 2, healthy: 3, inactive: 4 };

function clientAttention(results: HealthResult[], hasCurrentPlacement: boolean): ClientAttention {
  if (!hasCurrentPlacement) return { status: 'inactive', label: 'No active placements', explanation: 'This client has no active or scheduled placement.' };
  return results.sort((left, right) => healthRank[left.status] - healthRank[right.status])[0] ?? {
    status: 'unknown', label: 'Unknown', explanation: 'Current client feedback has not been recorded.',
  };
}

async function placementHealthFacts(tx: Tx, workspaceId: string, clientIds: string[], now: string): Promise<HealthFactRow[]> {
  if (!clientIds.length) return [];
  return tx<HealthFactRow[]>`select p.id,p.client_id,latest.assessment latest_assessment,latest.rating latest_rating,
   exists(select 1 from f5.issues i where i.workspace_id=p.workspace_id and i.placement_id=p.id and i.state<>'verified_closed') has_active_issue,
   exists(select 1 from f5.issues i where i.workspace_id=p.workspace_id and i.placement_id=p.id and i.state<>'verified_closed' and i.severity='critical') has_critical_issue,
   exists(select 1 from f5.obligations ob where ob.workspace_id=p.workspace_id and ob.placement_id=p.id and ob.type='client_feedback' and ob.state='open' and ob.due_at<${now}) has_overdue_feedback
   from f5.placements p
   left join lateral(select assessment,rating from f5.feedback_responses f where f.workspace_id=p.workspace_id and f.placement_id=p.id order by f.received_at desc,f.id limit 1) latest on true
   where p.workspace_id=${workspaceId} and p.client_id in ${tx(clientIds)} and p.status in ('active','scheduled')`;
}

function healthFromFact(row: HealthFactRow): HealthResult {
  return evaluateHealth({
    latestAssessment: row.latest_assessment,
    latestRating: row.latest_rating,
    hasActiveIssue: row.has_active_issue,
    hasCriticalIssue: row.has_critical_issue,
    hasOverdueFeedback: row.has_overdue_feedback,
  });
}

export interface ClientListPage { items: ClientSummary[]; total: number; page: number; pageSize: number; totalPages: number }

export function listClientsPage(workspaceId: string, value: { page?: unknown; pageSize?: unknown; search?: unknown }, now: string): Promise<ClientListPage> {
  const query = validateClientListQuery(value);
  return scoped(workspaceId, async tx => {
    const pattern = `%${query.search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const condition = query.search ? tx`and (c.name ilike ${pattern} escape '\\' or ct.name ilike ${pattern} escape '\\' or ct.email ilike ${pattern} escape '\\' or exists(select 1 from f5.placements sp join f5.professionals pro on pro.workspace_id=sp.workspace_id and pro.id=sp.professional_id where sp.workspace_id=c.workspace_id and sp.client_id=c.id and (pro.name ilike ${pattern} escape '\\' or pro.role ilike ${pattern} escape '\\')))`:tx``;
    const [count] = await tx`select count(*)::int total from f5.clients c
     left join lateral(select name,email from f5.contacts where workspace_id=c.workspace_id and client_id=c.id order by id limit 1) ct on true
     where c.workspace_id=${workspaceId} ${condition}`;
    const total = Number(count?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const offset = (page - 1) * query.pageSize;
    const rows = await tx<Omit<ClientSummary, 'attention'>[]>`select c.id,c.name,o.name owner_name,ct.name contact_name,ct.email,ct.phone,ct.time_zone,
     (select count(*)::int from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='active') active_placements,
     (select count(*)::int from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='scheduled') scheduled_placements,
     (select count(*)::int from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='ended') ended_placements,
     (select count(*)::int from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id) total_placements,
     (select count(*)::int from f5.issues i join f5.placements p on p.workspace_id=i.workspace_id and p.id=i.placement_id where i.workspace_id=c.workspace_id and p.client_id=c.id and i.state<>'verified_closed') open_issues,
     (select count(*)::int from f5.obligations ob left join f5.placements p on p.workspace_id=ob.workspace_id and p.id=ob.placement_id where ob.workspace_id=c.workspace_id and coalesce(ob.client_id,p.client_id)=c.id and ob.state='open' and ob.contact_id in (select id from f5.contacts where workspace_id=c.workspace_id and client_id=c.id)) open_obligations,
     (select min(ob.due_at) from f5.obligations ob left join f5.placements p on p.workspace_id=ob.workspace_id and p.id=ob.placement_id where ob.workspace_id=c.workspace_id and coalesce(ob.client_id,p.client_id)=c.id and ob.state='open' and ob.contact_id in (select id from f5.contacts where workspace_id=c.workspace_id and client_id=c.id)) next_due_at,
     (select max(i.occurred_at) from f5.interactions i join f5.contacts ic on ic.workspace_id=i.workspace_id and ic.id=i.contact_id where i.workspace_id=c.workspace_id and ic.client_id=c.id) last_contact_at
     from f5.clients c join f5.operators o on o.workspace_id=c.workspace_id and o.id=c.owner_id
     left join lateral(select name,email,phone,time_zone from f5.contacts where workspace_id=c.workspace_id and client_id=c.id order by id limit 1) ct on true
     where c.workspace_id=${workspaceId} ${condition}
     order by case when exists(select 1 from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='active') then 0 when exists(select 1 from f5.placements p where p.workspace_id=c.workspace_id and p.client_id=c.id and p.status='scheduled') then 1 else 2 end,c.name,c.id
     limit ${query.pageSize} offset ${offset}`;
    const facts = await placementHealthFacts(tx, workspaceId, rows.map(row => row.id), now);
    const byClient = new Map<string, HealthResult[]>();
    for (const fact of facts) byClient.set(fact.client_id, [...(byClient.get(fact.client_id) ?? []), healthFromFact(fact)]);
    const items = rows.map(row => ({ ...row, attention: clientAttention(byClient.get(row.id) ?? [], row.active_placements + row.scheduled_placements > 0) }));
    return { items, total, page, pageSize: query.pageSize, totalPages };
  });
}

export function getClient(workspaceId: string, id: string, now: string): Promise<ClientDetail> {
  validateId(id);
  return scoped(workspaceId, async tx => {
    const [client] = await tx<ClientDetail['client'][]>`select c.id,c.name,c.cadence_anchor,o.name owner_name,
     coalesce((select jsonb_agg(jsonb_build_object('id',ct.id,'name',ct.name,'email',ct.email,'phone',ct.phone,'time_zone',ct.time_zone) order by ct.name,ct.id) from f5.contacts ct where ct.workspace_id=c.workspace_id and ct.client_id=c.id),'[]'::jsonb) contacts
     from f5.clients c join f5.operators o on o.workspace_id=c.workspace_id and o.id=c.owner_id
     where c.workspace_id=${workspaceId} and c.id=${id}`;
    if (!client) throw new DomainError('NOT_FOUND', 'Client unavailable');

    const placementRows = await tx<Omit<ClientPlacementSummary, 'health'>[]>`select p.id,pro.name professional_name,pro.role,pro.location,p.status,p.start_date,p.trial_end
     from f5.placements p join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
     where p.workspace_id=${workspaceId} and p.client_id=${id}
     order by case p.status when 'active' then 0 when 'scheduled' then 1 else 2 end,p.start_date desc,p.id`;
    const facts = await placementHealthFacts(tx, workspaceId, [id], now);
    const factsByPlacement = new Map(facts.map(fact => [fact.id, healthFromFact(fact)]));
    const placements: ClientPlacementSummary[] = placementRows.map(row => ({
      ...row,
      health: row.status === 'ended'
        ? { status: 'inactive', label: 'Ended', explanation: 'This placement has ended.' }
        : factsByPlacement.get(row.id) ?? { status: 'unknown', label: 'Unknown', explanation: 'Current client feedback has not been recorded.' },
    }));
    const currentHealth = placements.filter(placement => placement.status !== 'ended').map(placement => placement.health).filter(health => health.status !== 'inactive') as HealthResult[];

    const obligations = await tx<ClientDetail['obligations']>`select ob.id,ob.type,ob.due_at,ob.next_contact_at,pro.name professional_name
     from f5.obligations ob
     left join f5.placements p on p.workspace_id=ob.workspace_id and p.id=ob.placement_id
     left join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
     join f5.contacts contact on contact.workspace_id=ob.workspace_id and contact.id=ob.contact_id
     where ob.workspace_id=${workspaceId} and coalesce(ob.client_id,p.client_id)=${id} and contact.client_id=${id} and ob.state='open'
     order by ob.due_at,ob.id`;
    const interactions = await tx<ClientDetail['interactions']>`select i.id,i.direction,i.channel,i.outcome,i.notes,i.occurred_at,contact.name contact_name,
     coalesce((select jsonb_agg(distinct pro.name) from f5.interaction_coverage coverage join f5.obligations ob on ob.workspace_id=coverage.workspace_id and ob.id=coverage.obligation_id join f5.placements p on p.workspace_id=ob.workspace_id and p.id=ob.placement_id join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id where coverage.workspace_id=i.workspace_id and coverage.interaction_id=i.id),'[]'::jsonb) professionals
     from f5.interactions i join f5.contacts contact on contact.workspace_id=i.workspace_id and contact.id=i.contact_id
     where i.workspace_id=${workspaceId} and contact.client_id=${id}
     order by i.occurred_at desc,i.id`;
    const feedback = await tx<ClientDetail['feedback']>`select f.id,f.assessment,f.rating,f.notes,f.received_at,f.channel,f.placement_id,pro.name professional_name
     from f5.feedback_responses f join f5.placements p on p.workspace_id=f.workspace_id and p.id=f.placement_id join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
     where f.workspace_id=${workspaceId} and p.client_id=${id} order by f.received_at desc,f.id`;
    const issues = await tx<ClientDetail['issues']>`select i.id,i.description,i.state,i.severity,i.category,i.placement_id,i.created_at,pro.name professional_name
     from f5.issues i join f5.placements p on p.workspace_id=i.workspace_id and p.id=i.placement_id join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id
     where i.workspace_id=${workspaceId} and p.client_id=${id} order by (i.state<>'verified_closed') desc,i.created_at desc,i.id`;
    const seniorReviews = await tx<ClientDetail['seniorReviews']>`select e.id,e.issue_id,e.state,e.reason,e.requested_decision,e.evidence,e.due_at,o.name owner_name,p.id placement_id,pro.name professional_name
     from f5.escalations e join f5.issues i on i.workspace_id=e.workspace_id and i.id=e.issue_id join f5.placements p on p.workspace_id=i.workspace_id and p.id=i.placement_id join f5.professionals pro on pro.workspace_id=p.workspace_id and pro.id=p.professional_id join f5.operators o on o.workspace_id=e.workspace_id and o.id=e.owner_id
     where e.workspace_id=${workspaceId} and p.client_id=${id} order by (e.state<>'decision_recorded') desc,e.due_at desc,e.id`;

    return {
      client,
      attention: clientAttention(currentHealth, placements.some(placement => placement.status !== 'ended')),
      placements,
      obligations,
      interactions,
      feedback,
      issues,
      seniorReviews,
    };
  });
}
