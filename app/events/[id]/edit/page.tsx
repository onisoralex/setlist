"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import TracklistEditModal from "@/components/TracklistEditModal";

type EditPageProps = { params: Promise<{ id: string }> };

// Kept as a dedicated route (rather than redirecting straight to /events/[id]) so a bookmarked
// or deep-linked URL still works -- renders the same modal the event page's "Edit Tracklist"
// button opens, pre-opened, and Done lands back on /events/[id]. Mirrors
// app/songs/[groupId]/edit/page.tsx and app/songs/new/page.tsx.
const TracklistEditPage = ({ params }: EditPageProps) => {
  const { id } = use(params);
  const router = useRouter();

  return <TracklistEditModal open eventId={id} onDone={() => router.push(`/events/${id}`)} />;
};

export default TracklistEditPage;
