"use client";

import { useRouter } from "next/navigation";
import SongForm, { type SongFormValues } from "@/components/SongForm";
import { apiFetch } from "@/lib/api-client";
import type { SongDetail } from "@/lib/types";

const NewSongPage = () => {
  const router = useRouter();

  const handleSubmit = async (values: SongFormValues) => {
    const song = await apiFetch<SongDetail>("/api/songs", {
      method: "POST",
      body: JSON.stringify({
        title: values.title,
        key: values.key,
        transpose: values.transpose,
        instrument: values.instrument,
        notes: values.notes || null,
        sheet: values.sheet || null,
      }),
    });
    router.push("/songs");
  };

  return (
    <div>
      <h1>New Song</h1>
      <SongForm
        submitLabel="Create Song"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/songs")}
      />
    </div>
  );
};

export default NewSongPage;
