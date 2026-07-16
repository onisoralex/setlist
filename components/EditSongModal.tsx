"use client";

import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import SongForm, { type SongFormValues } from "@/components/SongForm";
import { apiFetch } from "@/lib/api-client";
import { formatSongDisplayName } from "@/lib/song-display-name";
import type { SongDetail } from "@/lib/types";
import styles from "./EditSongModal.module.css";

type EditSongModalProps = {
  open: boolean;
  groupId: string;
  onSaved: () => void;
  onCancel: () => void;
};

// Wraps SongForm in a Dialog for editing an existing song, mirroring components/NewSongModal.tsx.
// Unlike NewSongModal it needs the current song's full detail before it can render the form --
// every caller (the song list row, this route's own page.tsx for direct/bookmarked links) only
// ever has a SongSummary, not the titleDe/titleEn/notes/sheet fields this form needs -- so it
// fetches GET /api/songs/:groupId itself whenever opened for a given groupId. Saving always
// PATCHes, which creates a new version (spec §3.1) -- same as the page this replaced, there is
// no "just this event" edit path here; that only exists from the tracklist editor's override
// form. DialogContent scrolls internally by default once the form (long chord sheets included)
// exceeds the dialog's max height, independent of the page-level scroll pattern in
// app/scroll.module.css.
const EditSongModal = ({ open, groupId, onSaved, onCancel }: EditSongModalProps) => {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch<SongDetail>(`/api/songs/${groupId}`)
      .then((result) => {
        setSong(result);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [open, groupId]);

  // Derived rather than a separate "loading" state set synchronously at the top of the effect
  // above (React discourages setState calls that aren't inside an async callback) -- SongDetail
  // always echoes back the requested groupId as `id`, so comparing against it distinguishes
  // "still fetching this song" from "showing a previous song's stale data while reopened for a
  // different one."
  const isCurrent = song !== null && song.id === groupId;

  const handleSubmit = async (values: SongFormValues) => {
    await apiFetch(`/api/songs/${groupId}`, {
      method: "PATCH",
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
    onSaved();
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{isCurrent && song ? `Edit ${formatSongDisplayName(song)}` : "Edit Song"}</DialogTitle>
      <DialogContent>
        {error && <p className={styles.error}>{error}</p>}
        {!isCurrent && !error && <p>Loading...</p>}
        {isCurrent && song && (
          <SongForm
            // Re-keying on the fetched version resets SongForm's internal state whenever this
            // modal is reopened for a different song (or a stale fetch resolves late) --
            // otherwise a previous song's values could linger, same reasoning as NewSongModal's
            // initialTitle key.
            key={`${song.id}-${song.version}`}
            initialValues={{
              title: song.title,
              titleDe: song.titleDe ?? "",
              titleEn: song.titleEn ?? "",
              key: song.key,
              transpose: song.transpose,
              instrument: song.instrument,
              notes: song.notes ?? "",
              sheet: song.sheet ?? "",
            }}
            submitLabel="Save New Version"
            onSubmit={handleSubmit}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditSongModal;
