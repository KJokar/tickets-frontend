import { TicketDetail } from "@/components/tickets/TicketViews";

export default async function ClientTicketPage({ params }: PageProps<"/client/tickets/[id]">) {
  const { id } = await params;
  return <TicketDetail role="client" ticketId={id} />;
}