"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import EditSongModal from "@/components/EditSongModal";

type SongEditPageProps = { params: Promise<{ groupId: string }> };

// Kept as a dedicated route (rather than redirecting straight to /songs) so a bookmarked or
// deep-linked URL still works -- renders the same modal the song list's "Edit" button opens,
// pre-opened, and both outcomes land back on /songs. Mirrors app/songs/new/page.tsx.
const SongEditPage = ({ params }: SongEditPageProps) => {
  const { groupId } = use(params);
  const router = useRouter();

  return (
    <EditSongModal
      open
      groupId={groupId}
      onSaved={() => router.push("/songs")}
      onCancel={() => router.push("/songs")}
    />
  );
};

export default SongEditPage;
