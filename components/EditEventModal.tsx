"use client";

import { useEffect, useState } from "react";
import DateField from "@/components/DateField";
import type { EventType } from "@/lib/types";
import styles from "./EditEventModal.module.css";

type EditEventModalProps = {
  currentDate: string;
  currentType: EventType;
  currentName: string | null;
  onSave: (values: { date: string; type: EventType; name: string | null }) => Promise<void> | void;
  onCancel: () => void;
};

// Modal for editing an event's date/type/name. Same overlay/backdrop/Escape-to-close pattern
// as components/ChangeTitleModal.tsx. The name field's conditional reveal (required when
// type is "other") mirrors the create form in app/events/page.tsx -- not worth sharing ~10
// lines of logic across the two.
const EditEventModal = ({ currentDate, currentType, currentName, onSave, onCancel }: EditEventModalProps) => {
  const [date, setDate] = useState(currentDate);
  const [type, setType] = useState<EventType>(currentType);
  const [name, setName] = useState(currentName ?? "");
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
    const trimmedName = name.trim();
    if (type === "other" && !trimmedName) {
      setError("Name is required for Other events");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ date, type, name: trimmedName === "" ? null : trimmedName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <form className={styles.panel} onSubmit={handleSave}>
        <h2 className={styles.heading}>Edit Event</h2>
        <DateField value={date} onChange={setDate} />
        <select
          className={styles.select}
          value={type}
          onChange={(event) => setType(event.target.value as EventType)}
        >
          <option value="sunday_morning">Sunday Morning</option>
          <option value="sunday_evening">Sunday Evening</option>
          <option value="other">Other</option>
        </select>
        {type === "other" && (
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Event name"
            required
          />
        )}
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

export default EditEventModal;
