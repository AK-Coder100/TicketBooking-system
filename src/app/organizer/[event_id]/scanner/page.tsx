import { redirect } from 'next/navigation';

export default async function EventScannerRedirect({ params }: { params: Promise<{ event_id: string }> }) {
  const { event_id } = await params;
  redirect(`/organizer/scanner?eventId=${event_id}`);
}
