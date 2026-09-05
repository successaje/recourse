import type { Metadata } from 'next';
import { ServiceDetail } from '@/components/service-detail';

export const metadata: Metadata = {
  title: 'Service',
  description: 'A protected service: its terms, its record, and its recent payments.',
};

export default async function ServicePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return <ServiceDetail address={address} />;
}
