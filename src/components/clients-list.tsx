"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ClientSummary } from '@/domain/client';
import { CLIENT_PAGE_SIZE } from '@/domain/pagination';
import { DataState } from './data-state';
import { displayDate, useWorkspaceData } from './workspace-data';

type ClientPage = { items: ClientSummary[]; total: number; page: number; pageSize: number; totalPages: number };

export function ClientsList() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQuery(search.trim()); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const path = `/api/clients?page=${page}&pageSize=${CLIENT_PAGE_SIZE}&search=${encodeURIComponent(query)}`;
  const { data, error, loading, reload } = useWorkspaceData<ClientPage>(path);
  const first = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return <>
    <div className="list-toolbar">
      <label className="search-field">Find a client
        <input type="search" placeholder="Company, contact, professional, or role" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <Link href="/placements/new" className="button button-primary">Add placement</Link>
    </div>
    <DataState error={error} loading={loading && !data} retry={() => void reload()} />
    {data && <>
      <div className="list-summary" aria-live="polite">
        <p className="result-count">{data.total} client{data.total === 1 ? '' : 's'}</p>
        {data.total > 0 && <p className="page-range">Showing {first}–{last}</p>}
      </div>
      <div className="client-grid">
        {data.items.map(client => <Link key={client.id} href={`/clients/${client.id}`} className="client-card">
          <div className="card-top">
            <span className="initials company-initials">{client.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>
            <span className={`health-badge health-${client.attention.status}`}>{client.attention.label}</span>
          </div>
          <h2>{client.name}</h2>
          <p className="client-contact-line">{client.contact_name} · {client.email}</p>
          <div className="client-metrics">
            <div><strong>{client.active_placements}</strong><span>Active</span></div>
            <div><strong>{client.open_issues}</strong><span>Open issues</span></div>
            <div><strong>{client.open_obligations}</strong><span>Open follow-ups</span></div>
          </div>
          <p className="client-card-note">{client.last_contact_at ? `Last contact ${displayDate(client.last_contact_at)}` : 'No contact recorded'}</p>
          <span className="card-link">View client →</span>
        </Link>)}
      </div>
      {!data.items.length && <p className="data-message">{query ? 'No clients match your search.' : 'No clients yet.'}</p>}
      {data.totalPages > 1 && <nav className="pagination" aria-label="Client pages">
        <button className="button button-secondary" type="button" disabled={data.page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
        <span>Page {data.page} of {data.totalPages}</span>
        <button className="button button-secondary" type="button" disabled={data.page >= data.totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</button>
      </nav>}
    </>}
  </>;
}
