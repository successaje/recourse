import type { Metadata } from 'next';
import { SlaBuilder } from '@/components/sla-builder';

export const metadata: Metadata = {
  title: 'Publish an SLA',
  description: 'Compose a machine-checkable service level agreement and get its commitment hash.',
};

export default function NewServicePage() {
  return <SlaBuilder />;
}
