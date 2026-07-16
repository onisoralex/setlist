"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
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

// Modal for editing an event's date/type/name. Dialog provides backdrop-click/Escape/
// focus-trap/aria-modal natively (spec §2.1), same as components/ChangeTitleModal.tsx. The
// event-type <select> stays plain HTML -- migrating it to MUI Select is Phase D, not this
// task. The name field's conditional reveal (required when type is "other") mirrors the
// create form in app/events/page.tsx -- not worth sharing ~10 lines of logic across the two.
const EditEventModal = ({ currentDate, currentType, currentName, onSave, onCancel }: EditEventModalProps) => {
  const [date, setDate] = useState(currentDate);
  const [type, setType] = useState<EventType>(currentType);
  const [name, setName] = useState(currentName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={handleSave}>
        <DialogTitle>Edit Event</DialogTitle>
        <DialogContent className={styles.content}>
          <DateField value={date} onChange={setDate} />
          <FormControl fullWidth>
            <InputLabel id="edit-event-type-label">Type</InputLabel>
            <Select
              labelId="edit-event-type-label"
              label="Type"
              value={type}
              onChange={(event: SelectChangeEvent) => setType(event.target.value as EventType)}
            >
              <MenuItem value="sunday_morning">Sunday Morning</MenuItem>
              <MenuItem value="sunday_evening">Sunday Evening</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>
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

export default EditEventModal;
