import type { Metadata } from 'next';
import { ClientDetailView } from '@/components/client-detail';

export const metadata: Metadata = { title: 'Client relationship' };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  return <ClientDetailView id={(await params).id} />;
}
