import { TicketList } from "@/components/tickets/TicketViews";

export default async function SupportTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[]; status?: string | string[] }>;
}) {
  const { scope, status } = await searchParams;
  const ticketScope = scope === "unassigned" ? "unassigned" : "assigned";
  return <TicketList role="agent" scope={ticketScope} initialStatus={status} />;
}
