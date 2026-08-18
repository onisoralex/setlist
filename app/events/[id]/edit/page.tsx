"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TracklistEditModal from "@/components/TracklistEditModal";
import { apiFetch } from "@/lib/api-client";
import type { EventDetail } from "@/lib/types";
import styles from "../page.module.css";

type EditPageProps = { params: Promise<{ id: string }> };

// Kept as a dedicated route (rather than redirecting straight to /events/[id]) so a bookmarked
// or deep-linked URL still works -- renders the same modal the event page's "Edit Tracklist"
// button opens, pre-opened, and Done lands back on /events/[id]. Mirrors
// app/songs/[groupId]/edit/page.tsx and app/songs/new/page.tsx.
//
// Unlike that button, this entry point has no disableable control to gate -- so it fetches the
// event itself first and refuses to open the modal at all when locked (spec tracklist-batch-
// save §2.6 Option B), rather than letting the user start editing and only discover the 409 on
// commit.
const TracklistEditPage = ({ params }: EditPageProps) => {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EventDetail>(`/api/events/${id}`)
      .then(setEvent)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!event) return <p>Loading...</p>;

  if (event.status === "played" || event.lockedAt !== null) {
    return <p className={styles.empty}>This event is played or locked -- its tracklist can no longer be edited.</p>;
  }

  return <TracklistEditModal open eventId={id} onDone={() => router.push(`/events/${id}`)} />;
};

export default TracklistEditPage;
