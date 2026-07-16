"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import styles from "./ChangeTitleModal.module.css";

type ChangeTitleModalProps = {
  currentTitle: string;
  onSave: (newTitle: string) => Promise<void> | void;
  onCancel: () => void;
};

// Small modal for renaming a song's title only. Sends a title-only PATCH body so the API
// route's versioning logic (app/api/songs/[groupId]/route.ts) never runs -- title lives on
// song_group and isn't versioned data. Dialog provides backdrop-click/Escape/focus-trap/
// aria-modal natively (spec §2.1), replacing the ~15 lines of hand-rolled equivalent this
// component used to carry.
const ChangeTitleModal = ({ currentTitle, onSave, onCancel }: ChangeTitleModalProps) => {
  const [title, setTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title cannot be empty");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save title");
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={handleSave}>
        <DialogTitle>Rename Song</DialogTitle>
        <DialogContent className={styles.content}>
          <input
            className={styles.input}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="contained" color="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ChangeTitleModal;
