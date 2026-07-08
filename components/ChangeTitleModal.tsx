"use client";

import { useEffect, useState } from "react";
import styles from "./ChangeTitleModal.module.css";

type ChangeTitleModalProps = {
  currentTitle: string;
  onSave: (newTitle: string) => Promise<void> | void;
  onCancel: () => void;
};

// Small modal for renaming a song's title only. Sends a title-only PATCH body so the API
// route's versioning logic (app/api/songs/[groupId]/route.ts) never runs -- title lives on
// song_group and isn't versioned data. Dismiss-on-backdrop-click/Escape mirrors the pattern
// in components/DateField.tsx, adapted for a modal backdrop rather than an outside-click ref.
const ChangeTitleModal = ({ currentTitle, onSave, onCancel }: ChangeTitleModalProps) => {
  const [title, setTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };

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
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <form className={styles.panel} onSubmit={handleSave}>
        <h2 className={styles.heading}>Rename Song</h2>
        <input
          className={styles.input}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className="btn btnSecondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btnPrimary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangeTitleModal;
