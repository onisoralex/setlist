"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import styles from "./SongForm.module.css";

export type SongFormValues = {
  title: string;
  titleDe: string;
  titleEn: string;
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
  titleDe: "",
  titleEn: "",
  key: "",
  transpose: "",
  instrument: "",
  notes: "",
  sheet: "",
};

// Fields that save as the literal "?" when left blank at submit time, rather than blocking
// the save (spec §4) -- these are already NOT NULL free-text columns, so "?" is just a
// placeholder value, not a schema change.
const QUESTION_MARK_DEFAULT_FIELDS = ["key", "transpose", "instrument"] as const;

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
      const normalized = { ...values };
      for (const field of QUESTION_MARK_DEFAULT_FIELDS) {
        if (normalized[field].trim() === "") {
          normalized[field] = "?";
        }
      }
      await onSubmit(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <TextField
        label="Title (Romanian)"
        value={values.title}
        onChange={handleChange("title")}
        required
        fullWidth
      />

      <div className={styles.row}>
        <TextField label="Title (German)" value={values.titleDe} onChange={handleChange("titleDe")} fullWidth />
        <TextField label="Title (English)" value={values.titleEn} onChange={handleChange("titleEn")} fullWidth />
      </div>

      <div className={styles.row}>
        <TextField label="Key" value={values.key} onChange={handleChange("key")} fullWidth />
        <TextField
          label="Transpose"
          value={values.transpose}
          onChange={handleChange("transpose")}
          placeholder="+0"
          fullWidth
        />
      </div>

      <TextField label="Instrument" value={values.instrument} onChange={handleChange("instrument")} fullWidth />

      <TextField
        label="Notes"
        value={values.notes}
        onChange={handleChange("notes")}
        placeholder="Optional"
        multiline
        minRows={3}
        fullWidth
      />

      <TextField
        label="Chord Sheet"
        className={styles.sheet}
        value={values.sheet}
        onChange={handleChange("sheet")}
        placeholder={'Use "+" to mark octave-up notes'}
        multiline
        minRows={12}
        fullWidth
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button type="submit" variant="contained" color="primary" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="contained" color="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};

export default SongForm;
