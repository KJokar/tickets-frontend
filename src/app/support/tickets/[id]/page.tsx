import { TicketDetail } from "@/components/tickets/TicketViews";

export default async function SupportTicketPage({ params }: PageProps<"/support/tickets/[id]">) {
  const { id } = await params;
  return <TicketDetail role="agent" ticketId={id} />;
}