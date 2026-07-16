"use client";

import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { apiFetch } from "@/lib/api-client";
import type { Settings } from "@/lib/types";

type ScopeField =
  | "searchScopeName"
  | "searchScopeNotes"
  | "searchScopeInstrument"
  | "searchScopeKey"
  | "searchScopeChords";

const SCOPE_CHIPS: { field: ScopeField; label: string }[] = [
  { field: "searchScopeName", label: "Name" },
  { field: "searchScopeNotes", label: "Notes" },
  { field: "searchScopeInstrument", label: "Instrument" },
  { field: "searchScopeKey", label: "Key" },
  { field: "searchScopeChords", label: "Chords" },
];

type SearchScopeChipsProps = {
  settings: Settings;
  onChange: (updated: Settings) => void;
};

// Search-location toggle badges (spec §3.2): one Chip per scope, filled = on, outlined = off.
// Toggling PATCHes immediately, mirroring app/settings/page.tsx's handleColorSave/
// handleColorClear "click -> immediate save" pattern rather than the font-size fields' batch-
// then-submit pattern -- these are low-stakes single booleans. Rendered both on the song list
// and the tracklist editor's combobox; both read/write the same Settings singleton row, so a
// toggle in one place is reflected wherever this component is mounted next.
const SearchScopeChips = ({ settings, onChange }: SearchScopeChipsProps) => {
  const handleToggle = async (field: ScopeField) => {
    const updated = await apiFetch<Settings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ [field]: !settings[field] }),
    });
    onChange(updated);
  };

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      {SCOPE_CHIPS.map(({ field, label }) => (
        <Chip
          key={field}
          label={label}
          size="small"
          color={settings[field] ? "primary" : "default"}
          variant={settings[field] ? "filled" : "outlined"}
          onClick={() => handleToggle(field)}
        />
      ))}
    </Stack>
  );
};

export default SearchScopeChips;
