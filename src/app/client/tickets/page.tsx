import { TicketList } from "@/components/tickets/TicketViews";

export default async function ClientTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { status } = await searchParams;
  return <TicketList role="client" initialStatus={status} />;
}
