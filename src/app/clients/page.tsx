import type { Metadata } from 'next';
import { ClientsList } from '@/components/clients-list';

export const metadata: Metadata = { title: 'Clients' };

export default function ClientsPage() {
  return <><div className="page-heading"><div><h1>Clients</h1><p className="page-description">Active relationships, current attention, open work, and contact history.</p></div></div><ClientsList /></>;
}
