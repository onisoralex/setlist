"use client";

import { useCallback, useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import type { FilterOptionsState } from "@mui/material/useAutocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import NewSongModal from "@/components/NewSongModal";
import SearchScopeChips from "@/components/SearchScopeChips";
import { apiFetch } from "@/lib/api-client";
import { formatGermanDate } from "@/lib/date-format";
import { formatSongDisplayName } from "@/lib/song-display-name";
import { matchesSearch, scopesFromSettings, type SearchScopes } from "@/lib/song-search";
import type { OverridePatch } from "@/lib/track-list";
import type { EventDetail, EventType, Settings, SongDetail, SongSummary, TracklistBatchEntry } from "@/lib/types";
import styles from "./TracklistEditModal.module.css";

const EMPTY_OVERRIDES = { title: "", key: "", transpose: "", instrument: "", notes: "", sheet: "" };

// Only these two overridable fields hold free-text/long-form content -- the rest (title, key,
// transpose, instrument) are short values that fit a single line, so only notes/sheet get a
// multiline textarea (and a taller one for sheet, since chord sheets run long -- matches
// SongForm's minRows={12} for the same field).
const MULTILINE_FIELDS = { notes: 3, sheet: 12 } as const;

// Which of the six overridable fields currently have a non-null override set on a row --
// drives whether the "clear" action is offered per field (spec §6: clearing must be a
// distinct action from saving an empty value).
type OverrideFlags = Record<keyof typeof EMPTY_OVERRIDES, boolean>;

const OVERRIDABLE_FIELDS = ["title", "key", "transpose", "instrument", "notes", "sheet"] as const;

// Duplicated from app/events/[id]/page.tsx and app/events/page.tsx rather than shared --
// consistent with how those two files already each carry their own copy.
const EVENT_TYPE_LABELS: Record<EventType, string> = {
  sunday_morning: "Sunday Morning",
  sunday_evening: "Sunday Evening",
  other: "Other",
};

// Local edit buffer (spec tracklist-batch-save §1): every add/remove/reorder/override action
// mutates this array in memory, and it's the only thing PUT .../tracklist ever sends -- zero
// network calls per action, one batch commit on Done/close. `id: null` marks a row added this
// session and not yet persisted; `clientKey` is the stable React key/handle every local handler
// addresses a row by (existing rows reuse their real id, new rows get a generated one, since
// `id` stays null until commit -- array index can't be used, remove/reorder would invalidate it
// mid-render).
type TracklistBufferEntry =
  | {
      kind: "song";
      id: string | null;
      clientKey: string;
      songGroupId: string;
      // The six overridable fields' resolved values as of buffer-entry creation -- NOT
      // recomputed from `overrides`, see resolveBufferSongDisplay below.
      baseResolved: {
        title: string;
        key: string;
        transpose: string;
        instrument: string;
        notes: string | null;
        sheet: string | null;
      };
      // Tri-state patch accumulated locally since this entry was created -- same wire semantics
      // as the old PATCH .../overrides body (key absent = untouched, null = clear, string = set).
      overrides: OverridePatch;
    }
  | {
      kind: "spacer";
      id: string | null;
      clientKey: string;
    };

type TracklistBuffer = TracklistBufferEntry[];

const seedBuffer = (eventDetail: EventDetail): TracklistBuffer =>
  eventDetail.songs.map((entry) =>
    entry.entryType === "spacer"
      ? { kind: "spacer", id: entry.id, clientKey: entry.id }
      : {
          kind: "song",
          id: entry.id,
          clientKey: entry.id,
          songGroupId: entry.songGroupId,
          baseResolved: {
            title: entry.title,
            key: entry.key,
            transpose: entry.transpose,
            instrument: entry.instrument,
            notes: entry.notes,
            sheet: entry.sheet,
          },
          overrides: {},
        },
  );

// Pure, read-only display resolution -- mirrors resolveTrackListEntry's `override ?? song value`
// logic server-side, just computed client-side against the locally-held SongSummary instead of
// a DB round-trip. Used for the row summary line and as each OverrideEditor field's placeholder.
const resolveBufferSongDisplay = (
  entry: Extract<TracklistBufferEntry, { kind: "song" }>,
  songSummaryByGroupId: Map<string, SongSummary>,
): Record<(typeof OVERRIDABLE_FIELDS)[number], string | null> => {
  const song = songSummaryByGroupId.get(entry.songGroupId);
  const result = {} as Record<(typeof OVERRIDABLE_FIELDS)[number], string | null>;
  for (const field of OVERRIDABLE_FIELDS) {
    if (field in entry.overrides) {
      result[field] = entry.overrides[field] ?? song?.[field] ?? null;
    } else {
      result[field] = entry.baseResolved[field];
    }
  }
  return result;
};

const genTempId = () => `tmp-${crypto.randomUUID()}`;

type TracklistEditModalProps = {
  open: boolean;
  eventId: string;
  onDone: () => void;
};

// Wraps the former app/events/[id]/edit/page.tsx in a Dialog, mirroring the EditSongModal/
// NewSongModal pattern: self-contained, fetches its own EventDetail/SongSummary[]/Settings on
// open rather than receiving them as props. Sized generously (fullWidth + maxWidth="lg" and a
// fixed Paper height) since this is the most content-heavy screen in the app -- the top row
// (search + scope chips + add-line) stays pinned while only the row list scrolls internally,
// same "pinned toolbar, scrollable content" intent as app/scroll.module.css, just hand-rolled
// here since that module's own doc note says Dialogs manage their own scroll instead.
//
// Every edit (add/remove/reorder/override) mutates `buffer` locally only (spec tracklist-
// batch-save §1) -- `load()` seeds it once on open and is never called again by an action
// handler. Done and Dialog's own onClose both commit the whole buffer in one PUT request
// (§5); NewSongModal's own song-creation POST is the one exception that still hits the network
// immediately (§3), since creating global master data is unrelated to this event's tracklist.
const TracklistEditModal = ({ open, eventId, onDone }: TracklistEditModalProps) => {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [allSongs, setAllSongs] = useState<SongSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [buffer, setBuffer] = useState<TracklistBuffer>([]);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  // Non-null while the "create '<query>' as a new song" flow from the combobox is open --
  // holds the query text as the modal's initialTitle. Lives here (not in the combobox) since
  // its onCreated needs to call addSong, which owns the buffer mutation.
  const [newSongQuery, setNewSongQuery] = useState<string | null>(null);

  // useCallback (rather than a plain function, unlike the page this replaced) so its identity
  // only changes when eventId does -- satisfies react-hooks/exhaustive-deps below without
  // re-fetching on every unrelated re-render (e.g. typing in an override field).
  const load = useCallback(() => {
    Promise.all([
      apiFetch<EventDetail>(`/api/events/${eventId}`),
      // includeArchived=true (not the default excluded-archived list): the combobox's
      // availableSongs still filters archived out below, but resolveBufferSongDisplay's
      // "clear override" fallback needs to resolve even a group archived after it was added
      // to this tracklist -- archiving never touches existing track_list_song rows, so that's
      // a real, reachable case, not hypothetical.
      apiFetch<SongSummary[]>("/api/songs?includeArchived=true"),
    ])
      .then(([eventResult, songsResult]) => {
        setEvent(eventResult);
        setAllSongs(songsResult);
        setBuffer(seedBuffer(eventResult));
      })
      .catch((err) => setError(err.message));
  }, [eventId]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    apiFetch<Settings>("/api/settings")
      .then(setSettings)
      .catch((err) => setError(err.message));
  }, [open]);

  const addSong = (
    songGroupId: string,
    summary: { title: string; key: string; transpose: string; instrument: string; notes: string | null; sheet: string | null },
  ) =>
    setBuffer((prev) => [
      ...prev,
      { kind: "song", id: null, clientKey: genTempId(), songGroupId, baseResolved: summary, overrides: {} },
    ]);

  const addSpacer = () => setBuffer((prev) => [...prev, { kind: "spacer", id: null, clientKey: genTempId() }]);

  const removeEntry = (clientKey: string) => setBuffer((prev) => prev.filter((e) => e.clientKey !== clientKey));

  const moveEntry = (index: number, direction: -1 | 1) =>
    setBuffer((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const patchOverrides = (clientKey: string, patch: OverridePatch) =>
    setBuffer((prev) =>
      prev.map((e) => (e.kind === "song" && e.clientKey === clientKey ? { ...e, overrides: { ...e.overrides, ...patch } } : e)),
    );

  // Commits the whole buffer in one request (spec §5). Wired to both Done and Dialog's own
  // onClose (backdrop click / Escape), per the Mind's confirmed direction -- this modal has no
  // separate discard/cancel path. On failure the dialog stays open and `buffer` is untouched,
  // since it's never cleared/reset here -- none of the user's local edits are lost.
  const handleCommit = async () => {
    if (committing) return; // guards a double-fire from Done-click racing backdrop-click
    setCommitting(true);
    setError(null);
    try {
      const entries: TracklistBatchEntry[] = buffer.map((e) =>
        e.kind === "spacer" ? { kind: "spacer", id: e.id } : { kind: "song", id: e.id, songGroupId: e.songGroupId, overrides: e.overrides },
      );
      await apiFetch(`/api/events/${eventId}/tracklist`, { method: "PUT", body: JSON.stringify({ entries }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tracklist changes");
    } finally {
      setCommitting(false);
    }
  };

  const availableSongs = allSongs?.filter((s) => !s.archived) ?? [];
  const songSummaryByGroupId = new Map((allSongs ?? []).map((s) => [s.id, s]));
  const scopes = settings ? scopesFromSettings(settings) : null;
  const ready = event !== null && allSongs !== null && settings !== null && scopes !== null;

  return (
    <Dialog open={open} onClose={handleCommit} fullWidth maxWidth="lg" slotProps={{ paper: { sx: { height: "85vh" } } }}>
      <DialogTitle>
        {event ? `${formatGermanDate(event.date)} · ${EVENT_TYPE_LABELS[event.type]}` : "Loading..."}
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", overflow: "hidden", minHeight: 0 }}>
        {error && <p className={styles.error}>{error}</p>}
        {!ready && !error && <p>Loading...</p>}
        {ready && scopes && (
          <>
            <div className={styles.topRow}>
              <SongSearchCombobox
                availableSongs={availableSongs}
                scopes={scopes}
                onAdd={(song) =>
                  addSong(song.id, {
                    title: song.title,
                    key: song.key,
                    transpose: song.transpose,
                    instrument: song.instrument,
                    notes: song.notes,
                    sheet: song.sheet,
                  })
                }
                onCreateNew={setNewSongQuery}
              />
              <SearchScopeChips settings={settings} onChange={setSettings} />
              <Button type="button" variant="contained" color="secondary" onClick={addSpacer}>
                + Add Empty Line
              </Button>
            </div>

            <NewSongModal
              open={newSongQuery !== null}
              initialTitle={newSongQuery ?? undefined}
              onCreated={(song: SongDetail) => {
                setNewSongQuery(null);
                addSong(song.id, {
                  title: song.title,
                  key: song.key,
                  transpose: song.transpose,
                  instrument: song.instrument,
                  notes: song.notes,
                  sheet: song.sheet,
                });
              }}
              onCancel={() => setNewSongQuery(null)}
            />

            <ul className={styles.list}>
              {buffer.map((entry, index) => {
                if (entry.kind === "spacer") {
                  return (
                    <li key={entry.clientKey} className={styles.spacerRow}>
                      <div className={styles.rowMain}>
                        <span className={styles.spacerLabel}>&mdash; Empty Line &mdash;</span>
                        <div className={styles.rowActions}>
                          <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            onClick={() => moveEntry(index, -1)}
                            disabled={index === 0}
                            aria-label="Move up"
                          >
                            &uarr;
                          </Button>
                          <Button
                            variant="contained"
                            color="secondary"
                            size="small"
                            onClick={() => moveEntry(index, 1)}
                            disabled={index === buffer.length - 1}
                            aria-label="Move down"
                          >
                            &darr;
                          </Button>
                          <Button variant="contained" color="error" size="small" onClick={() => removeEntry(entry.clientKey)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                }

                const display = resolveBufferSongDisplay(entry, songSummaryByGroupId);
                const song = songSummaryByGroupId.get(entry.songGroupId);
                const hasOverrides = Object.keys(entry.overrides).length > 0;

                return (
                  <li key={entry.clientKey} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowInfo}>
                        <span className={styles.title}>
                          {formatSongDisplayName({
                            title: display.title ?? "",
                            titleDe: song?.titleDe ?? null,
                            titleEn: song?.titleEn ?? null,
                          })}
                        </span>
                        <span className={styles.meta}>
                          {display.key} ({display.transpose}) &middot; {display.instrument}
                        </span>
                      </div>
                      <div className={styles.rowActions}>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="small"
                          onClick={() => setOverrideTarget(overrideTarget === entry.clientKey ? null : entry.clientKey)}
                        >
                          {hasOverrides ? "Override •" : "Override"}
                        </Button>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="small"
                          onClick={() => moveEntry(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                        >
                          &uarr;
                        </Button>
                        <Button
                          variant="contained"
                          color="secondary"
                          size="small"
                          onClick={() => moveEntry(index, 1)}
                          disabled={index === buffer.length - 1}
                          aria-label="Move down"
                        >
                          &darr;
                        </Button>
                        <Button variant="contained" color="error" size="small" onClick={() => removeEntry(entry.clientKey)}>
                          Remove
                        </Button>
                      </div>
                    </div>

                    {overrideTarget === entry.clientKey && (
                      <OverrideEditor
                        entry={entry}
                        songSummaryByGroupId={songSummaryByGroupId}
                        onPatch={(patch) => patchOverrides(entry.clientKey, patch)}
                        onClose={() => setOverrideTarget(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button type="button" variant="contained" color="primary" onClick={handleCommit} disabled={committing}>
          {committing ? "Saving..." : "Done"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

type SongSearchComboboxProps = {
  availableSongs: SongSummary[];
  scopes: SearchScopes;
  onAdd: (song: SongSummary) => void;
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
// song list. Selecting a result adds it immediately (as a local buffer push, not a network
// call) -- no separate "Add" step. The "no matches" state additionally offers a "create as new
// song" option whenever the query is non-empty (spec §3.7 entry point 2).
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
          onAdd(option);
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
  entry: Extract<TracklistBufferEntry, { kind: "song" }>;
  songSummaryByGroupId: Map<string, SongSummary>;
  onPatch: (patch: OverridePatch) => void;
  onClose: () => void;
};

// Per-event override form (spec §5 "Tracklist editor", §6 tri-state semantics). Each field
// has its own explicit "Clear" button rather than relying on an empty text input meaning
// "clear" -- an empty string is itself a valid override value, so the two must stay distinct
// affordances in the UI, not just distinct wire values. Mutates the buffer locally via
// onPatch -- no network call, no error state to show, since a local mutation can't fail.
const OverrideEditor = ({ entry, songSummaryByGroupId, onPatch, onClose }: OverrideEditorProps) => {
  const [values, setValues] = useState({ ...EMPTY_OVERRIDES });
  const [touched, setTouched] = useState<OverrideFlags>({
    title: false,
    key: false,
    transpose: false,
    instrument: false,
    notes: false,
    sheet: false,
  });

  const current = resolveBufferSongDisplay(entry, songSummaryByGroupId);

  const handleChange = (field: keyof typeof EMPTY_OVERRIDES, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Left open rather than auto-closing (today's network-era behavior) -- there's no round-trip
  // left to justify auto-closing, and staying open lets the user clear/re-check other fields.
  // Also discards any locally-typed (not-yet-saved) draft for this field, so its input reflects
  // the freshly-reverted placeholder instead of a stale draft that would otherwise mask it.
  const handleClear = (field: keyof typeof EMPTY_OVERRIDES) => {
    onPatch({ [field]: null });
    setValues((prev) => ({ ...prev, [field]: "" }));
    setTouched((prev) => ({ ...prev, [field]: false }));
  };

  const handleSave = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    // Only send fields the user actually touched -- an untouched field must stay absent from
    // the patch so the tri-state merge leaves its existing override alone (spec §6).
    const patch: OverridePatch = {};
    for (const [field, isTouched] of Object.entries(touched)) {
      if (isTouched) patch[field as keyof typeof EMPTY_OVERRIDES] = values[field as keyof typeof EMPTY_OVERRIDES];
    }
    if (Object.keys(patch).length === 0) return;
    onPatch(patch);
    onClose();
  };

  return (
    <form className={styles.overrideForm} onSubmit={handleSave}>
      <p className={styles.overrideHint}>
        Overrides apply to this event only. Leave a field untouched to keep inheriting from the song.
      </p>
      {(Object.keys(EMPTY_OVERRIDES) as (keyof typeof EMPTY_OVERRIDES)[]).map((field) => {
        const multilineRows = (MULTILINE_FIELDS as Partial<Record<keyof typeof EMPTY_OVERRIDES, number>>)[field];
        return (
          <div
            key={field}
            className={multilineRows ? `${styles.overrideField} ${styles.overrideFieldMultiline}` : styles.overrideField}
          >
            {multilineRows ? (
              <TextField
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                value={values[field]}
                onChange={(e) => handleChange(field, e.target.value)}
                placeholder={current[field] ?? ""}
                size="small"
                multiline
                minRows={multilineRows}
                fullWidth
              />
            ) : (
              <TextField
                label={field.charAt(0).toUpperCase() + field.slice(1)}
                value={values[field]}
                onChange={(e) => handleChange(field, e.target.value)}
                placeholder={current[field] ?? ""}
                size="small"
                fullWidth
              />
            )}
            <Button type="button" variant="contained" color="secondary" size="small" onClick={() => handleClear(field)}>
              Clear
            </Button>
          </div>
        );
      })}
      <Button type="submit" variant="contained" color="primary">
        Save Overrides
      </Button>
    </form>
  );
};

export default TracklistEditModal;
