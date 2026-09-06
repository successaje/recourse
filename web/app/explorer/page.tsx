import type { Metadata } from 'next';
import { Explorer } from '@/components/explorer';

export const metadata: Metadata = {
  title: 'Explorer',
  description: 'Every payment the Recourse escrow has held, with its disputes and services.',
};

export default function ExplorerPage() {
  return <Explorer />;
}
