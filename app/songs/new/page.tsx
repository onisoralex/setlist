"use client";

import { useRouter } from "next/navigation";
import NewSongModal from "@/components/NewSongModal";
import { useSetHeaderTitle } from "@/components/HeaderTitleProvider";

// Kept as a dedicated route (rather than redirecting straight to /songs) so a bookmarked or
// deep-linked URL still works -- renders the same modal the song-list "+ New Song" button
// opens, pre-opened, and both outcomes land back on /songs (spec §3.7, "minor call" note).
const NewSongPage = () => {
  const router = useRouter();

  // "Songs", not "New Song" -- consistent with where Cancel/Create both route back to.
  useSetHeaderTitle("Songs");

  return (
    <NewSongModal
      open
      onCreated={() => router.push("/songs")}
      onCancel={() => router.push("/songs")}
    />
  );
};

export default NewSongPage;
