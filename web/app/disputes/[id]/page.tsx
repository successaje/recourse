import type { Metadata } from 'next';
import { DisputeDetail } from '@/components/dispute-detail';

export const metadata: Metadata = {
  title: 'Dispute',
  description: 'A contested payment: the claim, the evidence, and the finding.',
};

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DisputeDetail paymentId={id} />;
}
