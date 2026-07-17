"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import EditSongModal from "@/components/EditSongModal";
import { useSetHeaderTitle } from "@/components/HeaderTitleProvider";

type SongEditPageProps = { params: Promise<{ groupId: string }> };

// Kept as a dedicated route (rather than redirecting straight to the song) so a bookmarked or
// deep-linked URL still works -- renders the same modal the song detail page's "Edit" button
// opens, pre-opened, and both outcomes land back on that song's own detail page. Mirrors
// app/songs/new/page.tsx.
const SongEditPage = ({ params }: SongEditPageProps) => {
  const { groupId } = use(params);
  const router = useRouter();

  // Generic "Edit Song", not the song's own title -- unlike app/songs/new/page.tsx (which routes
  // back to the statically-titled /songs list), Cancel/Save here route to /songs/[groupId], whose
  // header is the song's real name. Fetching that name separately just for this transient header
  // isn't worth it -- EditSongModal already fetches the song for its own dialog title, and the
  // destination page fetches it again anyway once we land there.
  useSetHeaderTitle("Edit Song");

  return (
    <EditSongModal
      open
      groupId={groupId}
      onSaved={() => router.push(`/songs/${groupId}`)}
      onCancel={() => router.push(`/songs/${groupId}`)}
    />
  );
};

export default SongEditPage;
