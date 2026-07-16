"use client";

import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import SongForm, { type SongFormValues } from "@/components/SongForm";
import { apiFetch } from "@/lib/api-client";
import type { SongDetail } from "@/lib/types";

type NewSongModalProps = {
  open: boolean;
  initialTitle?: string;
  onCreated: (song: SongDetail) => void;
  onCancel: () => void;
};

const EMPTY_VALUES: SongFormValues = {
  title: "",
  titleDe: "",
  titleEn: "",
  key: "",
  transpose: "",
  instrument: "",
  notes: "",
  sheet: "",
};

// Wraps the existing, presentation-agnostic SongForm in a Dialog (spec §3.7). Performs the
// POST itself -- same place app/songs/new/page.tsx already did it -- and hands the created
// song back via onCreated rather than navigating, so both the song-list and the tracklist-
// combobox "create new" entry points can share this one component with different callbacks.
const NewSongModal = ({ open, initialTitle, onCreated, onCancel }: NewSongModalProps) => {
  const handleSubmit = async (values: SongFormValues) => {
    const song = await apiFetch<SongDetail>("/api/songs", {
      method: "POST",
      body: JSON.stringify({
        title: values.title,
        titleDe: values.titleDe || null,
        titleEn: values.titleEn || null,
        key: values.key,
        transpose: values.transpose,
        instrument: values.instrument,
        notes: values.notes || null,
        sheet: values.sheet || null,
      }),
    });
    onCreated(song);
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>New Song</DialogTitle>
      <DialogContent>
        <SongForm
          // Re-keying on initialTitle resets SongForm's internal state (it only reads
          // initialValues once, on mount) whenever this modal is reopened with a different
          // pre-filled query -- otherwise a stale title from a prior open would linger.
          key={initialTitle ?? ""}
          initialValues={{ ...EMPTY_VALUES, title: initialTitle ?? "" }}
          submitLabel="Create Song"
          onSubmit={handleSubmit}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  );
};

export default NewSongModal;
