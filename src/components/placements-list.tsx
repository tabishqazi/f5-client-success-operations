"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PlacementRecord } from '@/domain/placement';
import { PLACEMENT_PAGE_SIZE } from '@/domain/pagination';
import { useWorkspaceData, displayDate } from './workspace-data';
import { DataState } from './data-state';

type PlacementPage = {
  items: PlacementRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function PlacementsList() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const path = `/api/placements?page=${page}&pageSize=${PLACEMENT_PAGE_SIZE}&search=${encodeURIComponent(query)}`;
  const { data, error, loading, reload } = useWorkspaceData<PlacementPage>(path);
  const first = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return <>
    <div className="list-toolbar">
      <label className="search-field">Find a placement
        <input type="search" placeholder="Name, client or role" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <Link href="/placements/new" className="button button-primary">Add placement</Link>
    </div>
    <DataState error={error} loading={loading && !data} retry={() => void reload()} />
    {data && <>
      <div className="list-summary" aria-live="polite">
        <p className="result-count">{data.total} placement{data.total === 1 ? '' : 's'}</p>
        {data.total > 0 && <p className="page-range">Showing {first}–{last}</p>}
      </div>
      <div className="placement-grid">
        {data.items.map(placement => <Link key={placement.id} href={`/placements/${placement.id}`} className="placement-card">
          <div className="card-top"><span className="initials">{placement.professional_name.split(' ').map(name => name[0]).slice(0, 2).join('')}</span><span className={`status-pill ${placement.status}`}>{placement.status}</span></div>
          <h2>{placement.professional_name}</h2>
          <p className="role-name">{placement.role}</p>
          <p className="client-name">{placement.client_name}</p>
          <dl><div><dt>Start date</dt><dd>{displayDate(placement.start_date)}</dd></div><div><dt>Trial ends</dt><dd>{displayDate(placement.trial_end)}</dd></div></dl>
          <span className="card-link">View placement →</span>
        </Link>)}
      </div>
      {!data.items.length && <p className="data-message">{query ? 'No placements match your search.' : 'No placements yet.'}</p>}
      {data.totalPages > 1 && <nav className="pagination" aria-label="Placement pages">
        <button className="button button-secondary" type="button" disabled={data.page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
        <span>Page {data.page} of {data.totalPages}</span>
        <button className="button button-secondary" type="button" disabled={data.page >= data.totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</button>
      </nav>}
    </>}
  </>;
}
