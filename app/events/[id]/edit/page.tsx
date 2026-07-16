"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Autocomplete from "@mui/material/Autocomplete";
import type { FilterOptionsState } from "@mui/material/useAutocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import NewSongModal from "@/components/NewSongModal";
import SearchScopeChips from "@/components/SearchScopeChips";
import { apiFetch } from "@/lib/api-client";
import { formatSongDisplayName } from "@/lib/song-display-name";
import { matchesSearch, scopesFromSettings, type SearchScopes } from "@/lib/song-search";
import type { EventDetail, Settings, SongDetail, SongSummary } from "@/lib/types";
import styles from "./page.module.css";

type EditPageProps = { params: Promise<{ id: string }> };

const EMPTY_OVERRIDES = { title: "", key: "", transpose: "", instrument: "", notes: "", sheet: "" };

// Which of the six overridable fields currently have a non-null override set on a row --
// drives whether the "clear" action is offered per field (spec §6: clearing must be a
// distinct action from saving an empty value).
type OverrideFlags = Record<keyof typeof EMPTY_OVERRIDES, boolean>;

const TracklistEditPage = ({ params }: EditPageProps) => {
  const { id } = use(params);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [allSongs, setAllSongs] = useState<SongSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  // Non-null while the "create '<query>' as a new song" flow from the combobox is open --
  // holds the query text as the modal's initialTitle. Lives here (not in the combobox) since
  // its onCreated needs to call handleAdd, which owns the tracklist-add API call.
  const [newSongQuery, setNewSongQuery] = useState<string | null>(null);

  const load = () => {
    Promise.all([apiFetch<EventDetail>(`/api/events/${id}`), apiFetch<SongSummary[]>("/api/songs")])
      .then(([eventResult, songsResult]) => {
        setEvent(eventResult);
        setAllSongs(songsResult);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [id]);
  useEffect(() => {
    apiFetch<Settings>("/api/settings")
      .then(setSettings)
      .catch((err) => setError(err.message));
  }, []);

  const handleAdd = async (songGroupId: string) => {
    try {
      await apiFetch(`/api/events/${id}/songs`, {
        method: "POST",
        body: JSON.stringify({ songGroupId }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add song");
    }
  };

  const handleAddSpacer = async () => {
    try {
      await apiFetch(`/api/events/${id}/songs`, {
        method: "POST",
        body: JSON.stringify({ entryType: "spacer" }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add empty line");
    }
  };

  const handleRemove = async (trackListSongId: string) => {
    await apiFetch(`/api/events/${id}/songs/${trackListSongId}`, { method: "DELETE" });
    load();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (!event) return;
    const ids = event.songs.map((s) => s.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await apiFetch(`/api/events/${id}/songs/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ trackListSongIds: ids }),
    });
    load();
  };

  if (error) return <p className={styles.error}>{error}</p>;
  if (!event || !allSongs || !settings) return <p>Loading...</p>;

  const availableSongs = allSongs.filter((s) => !s.archived);
  const scopes = scopesFromSettings(settings);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Edit Tracklist</h1>
        <Button component={Link} href={`/events/${id}`} variant="contained" color="secondary">
          Done
        </Button>
      </div>

      <div className={styles.addRow}>
        <SongSearchCombobox
          availableSongs={availableSongs}
          scopes={scopes}
          onAdd={handleAdd}
          onCreateNew={setNewSongQuery}
        />
        <Button type="button" variant="contained" color="secondary" onClick={handleAddSpacer}>
          + Add Empty Line
        </Button>
      </div>

      <SearchScopeChips settings={settings} onChange={setSettings} />

      <NewSongModal
        open={newSongQuery !== null}
        initialTitle={newSongQuery ?? undefined}
        onCreated={(song: SongDetail) => {
          setNewSongQuery(null);
          handleAdd(song.id);
        }}
        onCancel={() => setNewSongQuery(null)}
      />

      <ul className={styles.list}>
        {event.songs.map((entry, index) => (
          <li key={entry.id} className={entry.entryType === "spacer" ? styles.spacerRow : styles.row}>
            {entry.entryType === "spacer" ? (
              <div className={styles.rowMain}>
                <span className={styles.spacerLabel}>&mdash; Empty Line &mdash;</span>
                <div className={styles.rowActions}>
                  <Button
                    variant="contained"
                    color="secondary"
                    size="small"
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    &uarr;
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    size="small"
                    onClick={() => handleMove(index, 1)}
                    disabled={index === event.songs.length - 1}
                    aria-label="Move down"
                  >
                    &darr;
                  </Button>
                  <Button variant="contained" color="error" size="small" onClick={() => handleRemove(entry.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.rowMain}>
                  <div className={styles.rowInfo}>
                    <span className={styles.title}>{formatSongDisplayName(entry)}</span>
                    <span className={styles.meta}>
                      {entry.key} ({entry.transpose}) &middot; {entry.instrument}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      onClick={() => setOverrideTarget(overrideTarget === entry.id ? null : entry.id)}
                    >
                      Override
                    </Button>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      &uarr;
                    </Button>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === event.songs.length - 1}
                      aria-label="Move down"
                    >
                      &darr;
                    </Button>
                    <Button variant="contained" color="error" size="small" onClick={() => handleRemove(entry.id)}>
                      Remove
                    </Button>
                  </div>
                </div>

                {overrideTarget === entry.id && (
                  <OverrideEditor
                    eventId={id}
                    trackListSongId={entry.id}
                    current={entry}
                    onSaved={() => {
                      setOverrideTarget(null);
                      load();
                    }}
                  />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

type SongSearchComboboxProps = {
  availableSongs: SongSummary[];
  scopes: SearchScopes;
  onAdd: (songGroupId: string) => void;
  onCreateNew: (query: string) => void;
};

// Sentinel option injected by filterOptions when nothing matches and the user has typed
// something -- the standard MUI "creatable Autocomplete" pattern (a real, keyboard-navigable
// option rather than a plain unclickable message), see
// https://mui.com/material-ui/react-autocomplete/#creatable.
type CreateOption = { __create: true; inputValue: string };
type SongOption = SongSummary | CreateOption;

const isCreateOption = (option: SongOption): option is CreateOption => "__create" in option;

// Search-as-you-type "add a song" combobox, built on MUI Autocomplete (spec §2.1/§2.2 Phase
// E) -- sheds the hand-rolled click-outside/Escape/open-state logic the previous version
// carried, Autocomplete provides all of that natively. Filtering uses the shared, diacritic-
// insensitive, multi-scope predicate from lib/song-search.ts (spec §3.2/§3.3), same as the
// song list. Selecting a result adds it immediately -- no separate "Add" step. The "no
// matches" state additionally offers a "create as new song" option whenever the query is
// non-empty (spec §3.7 entry point 2).
const SongSearchCombobox = ({ availableSongs, scopes, onAdd, onCreateNew }: SongSearchComboboxProps) => {
  const [inputValue, setInputValue] = useState("");

  const filterOptions = (options: SongOption[], state: FilterOptionsState<SongOption>): SongOption[] => {
    const matches = (options.filter((option) => !isCreateOption(option)) as SongSummary[]).filter((song) =>
      matchesSearch(song, state.inputValue, scopes),
    );
    if (matches.length === 0 && state.inputValue.trim() !== "") {
      return [{ __create: true, inputValue: state.inputValue.trim() }];
    }
    return matches;
  };

  return (
    <Autocomplete<SongOption>
      className={styles.combobox}
      options={availableSongs}
      filterOptions={filterOptions}
      inputValue={inputValue}
      onInputChange={(_event, value) => setInputValue(value)}
      value={null}
      onChange={(_event, option) => {
        if (!option) return;
        if (isCreateOption(option)) {
          onCreateNew(option.inputValue);
        } else {
          onAdd(option.id);
        }
        setInputValue("");
      }}
      getOptionLabel={(option) => (isCreateOption(option) ? option.inputValue : formatSongDisplayName(option))}
      renderOption={(props, option) => (
        <li {...props} key={isCreateOption(option) ? "__create" : option.id}>
          {isCreateOption(option) ? `+ Create "${option.inputValue}" as a new song` : formatSongDisplayName(option)}
        </li>
      )}
      renderInput={(params) => <TextField {...params} placeholder="Add a song..." size="small" />}
      noOptionsText="No matching songs"
    />
  );
};

type OverrideEditorProps = {
  eventId: string;
  trackListSongId: string;
  current: Extract<EventDetail["songs"][number], { entryType: "song" }>;
  onSaved: () => void;
};

// Per-event override form (spec §5 "Tracklist editor", §6 tri-state semantics). Each field
// has its own explicit "Clear" button rather than relying on an empty text input meaning
// "clear" -- an empty string is itself a valid override value, so the two must stay distinct
// affordances in the UI, not just distinct wire values.
const OverrideEditor = ({ eventId, trackListSongId, current, onSaved }: OverrideEditorProps) => {
  const [values, setValues] = useState({ ...EMPTY_OVERRIDES });
  const [touched, setTouched] = useState<OverrideFlags>({
    title: false,
    key: false,
    transpose: false,
    instrument: false,
    notes: false,
    sheet: false,
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof typeof EMPTY_OVERRIDES, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleClear = async (field: keyof typeof EMPTY_OVERRIDES) => {
    try {
      await apiFetch(`/api/events/${eventId}/songs/${trackListSongId}/overrides`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: null }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear override");
    }
  };

  const handleSave = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    // Only send fields the user actually touched -- an untouched field must stay absent from
    // the body so the tri-state PATCH leaves its existing override alone (spec §6).
    const body: Record<string, string> = {};
    for (const [field, isTouched] of Object.entries(touched)) {
      if (isTouched) body[field] = values[field as keyof typeof EMPTY_OVERRIDES];
    }
    if (Object.keys(body).length === 0) return;

    try {
      await apiFetch(`/api/events/${eventId}/songs/${trackListSongId}/overrides`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save overrides");
    }
  };

  return (
    <form className={styles.overrideForm} onSubmit={handleSave}>
      <p className={styles.overrideHint}>
        Overrides apply to this event only. Leave a field untouched to keep inheriting from the song.
      </p>
      {(Object.keys(EMPTY_OVERRIDES) as (keyof typeof EMPTY_OVERRIDES)[]).map((field) => (
        <div key={field} className={styles.overrideField}>
          <TextField
            label={field.charAt(0).toUpperCase() + field.slice(1)}
            value={values[field]}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={current[field] ?? ""}
            size="small"
            fullWidth
          />
          <Button type="button" variant="contained" color="secondary" size="small" onClick={() => handleClear(field)}>
            Clear
          </Button>
        </div>
      ))}
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" variant="contained" color="primary">
        Save Overrides
      </Button>
    </form>
  );
};

export default TracklistEditPage;
