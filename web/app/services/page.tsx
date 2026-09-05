import type { Metadata } from 'next';
import { ServicesList } from '@/components/services-list';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Every service that has taken a payment through the Recourse escrow.',
};

export default function ServicesPage() {
  return <ServicesList />;
}
