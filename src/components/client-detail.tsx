"use client";

import Link from 'next/link';
import type { ClientDetail } from '@/domain/client';
import { DataState } from './data-state';
import { displayDate, useWorkspaceData } from './workspace-data';

const label = (value: string) => value.replaceAll('_', ' ');

export function ClientDetailView({ id }: { id: string }) {
  const { data, error, loading, reload } = useWorkspaceData<ClientDetail>(`/api/clients/${id}`);
  if (!data) return <><Link className="text-link" href="/clients">← All clients</Link><DataState error={error} loading={loading} retry={() => void reload()} /></>;

  const active = data.placements.filter(placement => placement.status === 'active').length;
  const scheduled = data.placements.filter(placement => placement.status === 'scheduled').length;
  const ended = data.placements.filter(placement => placement.status === 'ended').length;
  const primaryContact = data.client.contacts[0];

  return <>
    <Link className="text-link" href="/clients">← All clients</Link>
    <DataState error={error} loading={false} retry={() => void reload()} />
    <div className="page-heading client-heading"><div><h1>{data.client.name}</h1><p className="page-description">Owned by {data.client.owner_name} · relationship cadence from {displayDate(data.client.cadence_anchor)}</p></div><span className={`health-badge health-${data.attention.status}`}>{data.attention.label}</span></div>

    <section className="summary-strip client-summary" aria-label="Client relationship summary">
      <div><span className="summary-label">Active placements</span><strong>{active}</strong></div>
      <div><span className="summary-label">Scheduled</span><strong>{scheduled}</strong></div>
      <div><span className="summary-label">Ended</span><strong>{ended}</strong></div>
      <div><span className="summary-label">Open follow-ups</span><strong>{data.obligations.length}</strong></div>
    </section>

    <div className="detail-columns client-overview">
      <section className="panel detail-section"><h2>Relationship attention</h2><p className="health-explanation">{data.attention.explanation}</p><p className="muted">This reflects the highest current placement risk and explicit open work.</p></section>
      <section className="panel detail-section"><h2>Client contacts</h2>{data.client.contacts.map(contact => <div className="client-contact" key={contact.id}><strong>{contact.name}</strong><a href={`mailto:${contact.email}`}>{contact.email}</a>{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}<span>{contact.time_zone.replaceAll('_', ' ')}</span></div>)}{!primaryContact && <p className="muted">No client contact is recorded.</p>}</section>
    </div>

    <section className="panel detail-section"><div className="section-heading-inline"><h2>Placements</h2><span className="muted">{data.placements.length} total</span></div>
      {data.placements.length ? <div className="client-placement-list">{data.placements.map(placement => <Link href={`/placements/${placement.id}`} className="client-placement-row" key={placement.id}>
        <div><strong>{placement.professional_name}</strong><span>{placement.role} · {placement.location}</span></div>
        <div className="client-placement-state"><span className={`status-pill ${placement.status}`}>{placement.status}</span><span className={`health-badge health-${placement.health.status}`}>{placement.health.label}</span></div>
      </Link>)}</div> : <p className="muted">No placements are linked to this client.</p>}
    </section>

    <div className="detail-columns">
      <section className="panel detail-section"><h2>Open client follow-ups</h2>{data.obligations.length ? data.obligations.map(obligation => <article className="timeline-entry" key={obligation.id}><span className="status-pill">{label(obligation.type)}</span>{obligation.professional_name && <strong>{obligation.professional_name}</strong>}<p>Original deadline {displayDate(obligation.due_at)}</p>{obligation.next_contact_at && <p className="muted">Next contact {displayDate(obligation.next_contact_at)}</p>}</article>) : <p className="muted">No open client follow-ups.</p>}</section>
      <section className="panel detail-section"><h2>Senior reviews</h2>{data.seniorReviews.length ? data.seniorReviews.map(review => <article className="timeline-entry" key={review.id}><div className="section-heading-inline"><span className="status-pill">{label(review.state)}</span><span className="muted">{displayDate(review.due_at)}</span></div><strong>{review.professional_name}</strong><p>{label(review.reason)}</p><p className="muted">{review.requested_decision}</p><Link className="text-link" href={`/issues#issue-${review.issue_id}`}>Open issue workflow →</Link></article>) : <p className="muted">No senior reviews for this client.</p>}</section>
    </div>

    <section className="panel detail-section"><div className="section-heading-inline"><h2>Contact history</h2><span className="muted">{data.interactions.length} recorded</span></div>{data.interactions.length ? data.interactions.map(interaction => <article className="history-entry" key={interaction.id}>
      <div className="history-meta"><time>{displayDate(interaction.occurred_at)}</time><span className="status-pill">{label(interaction.outcome)}</span></div>
      <div><strong>{interaction.contact_name} · {label(interaction.direction)} {label(interaction.channel)}</strong><p>{interaction.notes}</p>{interaction.professionals.length > 0 && <p className="muted">Covered placements: {interaction.professionals.join(', ')}</p>}</div>
    </article>) : <p className="muted">No client contact has been recorded.</p>}</section>

    <div className="detail-columns">
      <section className="panel detail-section"><h2>Placement feedback</h2>{data.feedback.length ? data.feedback.map(feedback => <article className="timeline-entry" key={feedback.id}><div className="section-heading-inline"><span className="status-pill">{feedback.assessment}</span><time className="muted">{displayDate(feedback.received_at)}</time></div><strong>{feedback.professional_name}{feedback.rating ? ` · ${feedback.rating} / 5` : ''}</strong><p>{feedback.notes}</p></article>) : <p className="muted">No placement-specific feedback recorded.</p>}</section>
      <section className="panel detail-section"><h2>Issues</h2>{data.issues.length ? data.issues.map(issue => <article className="timeline-entry" key={issue.id}><div className="section-heading-inline"><span className={`status-pill ${issue.severity === 'critical' ? 'critical' : ''}`}>{label(issue.state)}</span><time className="muted">{displayDate(issue.created_at)}</time></div><strong>{issue.professional_name}</strong><p>{issue.description}</p><Link className="text-link" href={`/issues#issue-${issue.id}`}>Manage issue →</Link></article>) : <p className="muted">No issues recorded.</p>}</section>
    </div>
  </>;
}
