import type { Metadata } from 'next';
import { AgentDashboard } from '@/components/agent-dashboard';
import { DEMO_BUYER } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Agent',
  description: 'A buyer account: how much of its spend was protected, and how much came back.',
};

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
  return <AgentDashboard address={address ?? DEMO_BUYER} />;
}
