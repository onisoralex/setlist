"use client";

import { useState } from "react";
import styles from "./SongForm.module.css";

export type SongFormValues = {
  title: string;
  key: string;
  transpose: string;
  instrument: string;
  notes: string;
  sheet: string;
};

type SongFormProps = {
  initialValues?: SongFormValues;
  submitLabel: string;
  onSubmit: (values: SongFormValues) => Promise<void>;
  onCancel?: () => void;
};

const EMPTY_VALUES: SongFormValues = {
  title: "",
  key: "",
  transpose: "",
  instrument: "",
  notes: "",
  sheet: "",
};

// Shared by the "new song" and "edit song" screens (spec §5) -- both always write a full set
// of fields (edit always creates a new version via PATCH, never a partial per-event override,
// see docs/specs/00-foundation.md §5 "Song edit"), so one form component covers both.
const SongForm = ({ initialValues, submitLabel, onSubmit, onCancel }: SongFormProps) => {
  const [values, setValues] = useState<SongFormValues>(initialValues ?? EMPTY_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof SongFormValues) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span>Title</span>
        <input value={values.title} onChange={handleChange("title")} required />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Key</span>
          <input value={values.key} onChange={handleChange("key")} required />
        </label>
        <label className={styles.field}>
          <span>Transpose</span>
          <input value={values.transpose} onChange={handleChange("transpose")} required placeholder="+0" />
        </label>
      </div>

      <label className={styles.field}>
        <span>Instrument</span>
        <input value={values.instrument} onChange={handleChange("instrument")} required />
      </label>

      <label className={styles.field}>
        <span>Notes</span>
        <input value={values.notes} onChange={handleChange("notes")} placeholder="Optional" />
      </label>

      <label className={styles.field}>
        <span>Chord Sheet</span>
        <textarea
          className={styles.sheet}
          value={values.sheet}
          onChange={handleChange("sheet")}
          rows={12}
          placeholder={"Use \"+\" to mark octave-up notes"}
        />
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="submit" className="btn btnPrimary" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btnSecondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default SongForm;
