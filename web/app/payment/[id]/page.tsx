import type { Metadata } from 'next';
import { PaymentDetail } from '@/components/payment-detail';

export const metadata: Metadata = {
  title: 'Payment',
  description: 'A protected payment: its terms, its timeline, and how it settled.',
};

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentDetail paymentId={id} />;
}
