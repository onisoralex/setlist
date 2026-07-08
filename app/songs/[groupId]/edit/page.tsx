"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SongForm, { type SongFormValues } from "@/components/SongForm";
import { apiFetch } from "@/lib/api-client";
import type { SongDetail } from "@/lib/types";

type SongEditPageProps = { params: Promise<{ groupId: string }> };

// Saving here always calls PATCH /api/songs/:groupId, which creates a new version (spec
// §3.1) -- there is deliberately no "just this event" edit path from this screen; that only
// exists from the tracklist editor's override form.
const SongEditPage = ({ params }: SongEditPageProps) => {
  const { groupId } = use(params);
  const router = useRouter();
  const [song, setSong] = useState<SongDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SongDetail>(`/api/songs/${groupId}`)
      .then(setSong)
      .catch((err) => setError(err.message));
  }, [groupId]);

  const handleSubmit = async (values: SongFormValues) => {
    await apiFetch(`/api/songs/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: values.title,
        key: values.key,
        transpose: values.transpose,
        instrument: values.instrument,
        notes: values.notes || null,
        sheet: values.sheet || null,
      }),
    });
    router.push(`/songs/${groupId}`);
  };

  if (error) return <p>{error}</p>;
  if (!song) return <p>Loading...</p>;

  return (
    <div>
      <h1>Edit {song.title}</h1>
      <p>Saving creates a new version and applies it everywhere this song is used (unless an event is played or locked).</p>
      <SongForm
        initialValues={{
          title: song.title,
          key: song.key,
          transpose: song.transpose,
          instrument: song.instrument,
          notes: song.notes ?? "",
          sheet: song.sheet ?? "",
        }}
        submitLabel="Save New Version"
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/songs/${groupId}`)}
      />
    </div>
  );
};

export default SongEditPage;
