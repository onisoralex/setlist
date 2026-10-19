"use client";

import { useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import type { FilterOptionsState } from "@mui/material/useAutocomplete";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import EditIconButton from "@/components/EditIconButton";
import EditSongModal from "@/components/EditSongModal";
import NewSongModal from "@/components/NewSongModal";
import SearchScopeChips from "@/components/SearchScopeChips";
import { apiFetch } from "@/lib/api-client";
import { formatGermanDate } from "@/lib/date-format";
import type { CachedEvent } from "@/lib/event-detail-cache";
import { formatSongDisplayName } from "@/lib/song-display-name";
import { fetchAndCacheSongs, getCachedSongs } from "@/lib/songs-list-cache";
import { matchesSearch, scopesFromSettings, type SearchScopes } from "@/lib/song-search";
import { OVERRIDABLE_FIELDS, type OverridableField, type OverridePatch } from "@/lib/track-list";
import type { EventDetail, EventType, Settings, SongDetail, SongSummary, TracklistBatchEntry } from "@/lib/types";
import styles from "./TracklistEditModal.module.css";

// Only these two overridable fields hold free-text/long-form content -- the rest (title, key,
// transpose, instrument) are short values that fit a single line, so only notes/sheet get a
// multiline textarea (and a taller one for sheet, since chord sheets run long -- matches
// SongForm's minRows={12} for the same field).
const MULTILINE_FIELDS = { notes: 3, sheet: 12 } as const;

type OverrideValues = Record<OverridableField, string>;

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
      // Fields with an override already persisted when this entry was seeded (from
      // GET /api/events/:id's `overriddenFields`; always [] for rows added this session). Never
      // mutated locally -- pending changes live in `overrides`, see isFieldOverridden.
      overriddenFields: OverridableField[];
      // What each field shows with no override: the row's pinned song version's values (the
      // API's `inherited`), or for rows added this session the summary they were added with.
      // The fallback for a pending clear, see resolveBufferSongDisplay.
      inherited: Record<OverridableField, string | null>;
      // Tri-state patch accumulated locally since this entry was created, sent as-is on commit
      // (key absent = untouched, null = clear, string = set -- see OverridePatch).
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
          overriddenFields: entry.overriddenFields,
          inherited: entry.inherited,
          overrides: {},
        },
  );

type SongBufferEntry = Extract<TracklistBufferEntry, { kind: "song" }>;

// A row added this session has no pinned version or persisted overrides yet, so both its
// baseResolved and its inherited values are simply the song summary it was added with. Shared
// by addSong and the post-song-edit refresh (handleSongSaved), which rebuilds unsaved rows from
// the refetched summary.
const valuesFromSummary = (summary: SongSummary | SongDetail): SongBufferEntry["baseResolved"] => ({
  title: summary.title,
  key: summary.key,
  transpose: summary.transpose,
  instrument: summary.instrument,
  notes: summary.notes,
  sheet: summary.sheet,
});

// Whether `field` will be overridden once the buffer is committed: a pending local set or clear
// (field present in `overrides`) wins over what was persisted when the buffer was seeded.
const isFieldOverridden = (entry: SongBufferEntry, field: OverridableField): boolean =>
  field in entry.overrides ? entry.overrides[field] !== null : entry.overriddenFields.includes(field);

// Pure, read-only display resolution -- mirrors resolveTrackListEntry's `override ?? song value`
// logic server-side, applied to the buffer's pending patch: untouched fields keep their
// server-resolved value, a pending set shows the new value, and a pending clear falls back to
// `inherited` (the row's pinned song version, not the group's latest -- the two differ once the
// song gains a newer version after being added to this event). Used for the row summary line
// and as each OverrideEditor field's prefilled initial value.
const resolveBufferSongDisplay = (entry: SongBufferEntry): Record<OverridableField, string | null> => {
  const result = {} as Record<OverridableField, string | null>;
  for (const field of OVERRIDABLE_FIELDS) {
    if (field in entry.overrides) {
      result[field] = entry.overrides[field] ?? entry.inherited[field];
    } else {
      result[field] = entry.baseResolved[field];
    }
  }
  return result;
};

const genTempId = () => `tmp-${crypto.randomUUID()}`;

// Max age of initialEvent, measured when the modal opens, for it to seed the edit buffer. Done
// PUT-replaces the whole tracklist, so seeding from old data could overwrite changes made on
// another device since that data was fetched. "The caller's last revalidation succeeded" alone
// isn't enough: a page left open for an hour still passes that test. Past this age the modal
// fetches the event itself (normal Loading state).
const EVENT_SEED_MAX_AGE_MS = 60_000;

// The seed's event if it is young enough to use right now, else null. Called only at open time.
const usableEventSeed = (seed: CachedEvent | null | undefined): EventDetail | null =>
  seed && Date.now() - seed.fetchedAt.getTime() < EVENT_SEED_MAX_AGE_MS ? seed.event : null;

type TracklistEditModalProps = {
  open: boolean;
  eventId: string;
  // Optional seeds, read only on the closed->open transition (or on mount when mounted open).
  // initialEvent must be data the caller has verified against the server (its latest
  // revalidation succeeded, nothing written since), with the time it was fetched; it is only
  // used if younger than EVENT_SEED_MAX_AGE_MS at open time. Pass null/omit when it can't be
  // vouched for; the modal then fetches the event itself, as it did before these props existed.
  initialEvent?: CachedEvent | null;
  initialSettings?: Settings | null;
  // Called with the PATCHed settings after a scope-chip toggle, so a caller passing
  // initialSettings can keep its copy current for the next open.
  onSettingsChange?: (updated: Settings) => void;
  onDone: () => void;
};

// Wraps the former app/events/[id]/edit/page.tsx in a Dialog, mirroring the EditSongModal/
// NewSongModal pattern: self-contained by default, fetching its own EventDetail/SongSummary[]/
// Settings on open. The event page can instead hand over its freshly revalidated event and its
// settings (props above), and the song list comes from lib/songs-list-cache.ts when warm, so in
// the common case the modal opens with content instead of "Loading...". Sized generously
// (fullWidth + maxWidth="lg" and a fixed Paper height) since this is the most content-heavy
// screen in the app -- the top row (search + scope chips + add-line) stays pinned while only
// the row list scrolls internally, same "pinned toolbar, scrollable content" intent as
// app/scroll.module.css, just hand-rolled here since that module's own doc note says Dialogs
// manage their own scroll instead.
//
// Every edit (add/remove/reorder/override) mutates `buffer` locally only (spec tracklist-
// batch-save §1) -- it's seeded once per open (from initialEvent or the open-time event fetch)
// and never reseeded while open, not even when the caller's own copy of the event refreshes.
// Done and Dialog's own onClose both commit the whole buffer in one PUT request (§5). The two
// exceptions that still hit the network immediately both touch global master data, not this
// event's tracklist: NewSongModal's song-creation POST (§3) and EditSongModal's song PATCH
// (row pencil), after which handleSongSaved patches the buffer in place.
const TracklistEditModal = ({
  open,
  eventId,
  initialEvent,
  initialSettings,
  onSettingsChange,
  onDone,
}: TracklistEditModalProps) => {
  // Age check done once here for a modal mounted already open (the transition below covers
  // every later open), so the event/buffer/eventSeeded initializers agree with each other.
  const [mountSeed] = useState(() => (open ? usableEventSeed(initialEvent) : null));
  const [event, setEvent] = useState<EventDetail | null>(mountSeed);
  // Seeded from the songs cache (stale-while-revalidate): the open effect below always
  // revalidates it, and the fresh list just replaces this one -- it never touches `buffer`.
  // Hydration-safe for the same reason as the event page's cache seed: the cache is only ever
  // written client-side after mount.
  const [allSongs, setAllSongs] = useState<SongSummary[] | null>(() => getCachedSongs() ?? null);
  const [settings, setSettings] = useState<Settings | null>(() => (open ? (initialSettings ?? null) : null));
  const [buffer, setBuffer] = useState<TracklistBuffer>(() => (mountSeed ? seedBuffer(mountSeed) : []));
  // Whether this open was seeded from the props, captured at open time. The fetch effects key
  // off these rather than off the props themselves, so a prop changing while open (e.g. the
  // event page's revalidation landing and its initialEvent going from null to fresh data)
  // neither reseeds the buffer nor triggers a refetch.
  const [eventSeeded, setEventSeeded] = useState(mountSeed !== null);
  const [settingsSeeded, setSettingsSeeded] = useState(() => open && initialSettings != null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  // Non-null while the "create '<query>' as a new song" flow from the combobox is open --
  // holds the query text as the modal's initialTitle. Lives here (not in the combobox) since
  // its onCreated needs to call addSong, which owns the buffer mutation.
  const [newSongQuery, setNewSongQuery] = useState<string | null>(null);
  // Non-null while EditSongModal is open over this one for that song group (the row pencil).
  // Unlike the other row actions this one hits the network immediately -- it edits the global
  // song, not this event's tracklist -- see handleSongSaved for how the buffer catches up.
  const [editSongGroupId, setEditSongGroupId] = useState<string | null>(null);

  // The component stays mounted while the Dialog is closed, so per-open state would otherwise
  // survive a close/reopen. Reset/seeded during render on the closed->open transition (React's
  // "adjusting state when a prop changes" pattern) rather than in the open effects below:
  // react-hooks/set-state-in-effect forbids the latter, and this way nothing from the previous
  // open paints for even one frame. In particular:
  // - overrideTarget: the previously open panel would reappear. Resetting it unmounts
  //   OverrideEditor, which silently drops any unsaved drafts.
  // - event/buffer: either seeded from initialEvent right here (if young enough *now* -- see
  //   EVENT_SEED_MAX_AGE_MS), or cleared so the previous open's buffer can't be shown (and
  //   edited) until the event fetch below replaces it.
  // - allSongs/settings: the previous open's values are fine to show while they revalidate; a
  //   warm cache or a settings seed is simply newer.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOverrideTarget(null);
      setError(null);
      const seed = usableEventSeed(initialEvent);
      setEvent(seed);
      setBuffer(seed ? seedBuffer(seed) : []);
      setEventSeeded(seed !== null);
      if (initialSettings) setSettings(initialSettings);
      setSettingsSeeded(initialSettings != null);
      const cachedSongs = getCachedSongs();
      if (cachedSongs) setAllSongs(cachedSongs);
    }
  }

  // Event fetch, only when this open wasn't seeded. `active` drops a response that lands after
  // the modal closed again -- otherwise a slow fetch from an earlier open could reseed the
  // buffer of a later one.
  useEffect(() => {
    if (!open || eventSeeded) return;
    let active = true;
    apiFetch<EventDetail>(`/api/events/${eventId}`)
      .then((eventResult) => {
        if (!active) return;
        setEvent(eventResult);
        setBuffer(seedBuffer(eventResult));
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [open, eventSeeded, eventId]);

  // Song list: always revalidated on open, even when the cache already filled allSongs.
  // includeArchived=true (not the default excluded-archived list): the combobox's
  // availableSongs still filters archived out below, but each row's titleDe/titleEn lookup
  // needs to resolve even a group archived after it was added to this tracklist -- archiving
  // never touches existing track_list_song rows, so that's a real, reachable case, not
  // hypothetical. A failed revalidation is only an error if there's no list to show at all;
  // with a cached one the combobox keeps working on it (it can only miss songs created
  // elsewhere since it was fetched).
  // Song-list loads can overlap (this revalidation, the refetch after a song create or edit), so
  // only the newest may set allSongs -- otherwise a slow open-time response could land after a
  // create and drop the new song from the list again.
  const latestSongsLoad = useRef(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadNumber = ++latestSongsLoad.current;
    const hadCachedList = getCachedSongs() !== undefined;
    fetchAndCacheSongs()
      .then((songsResult) => {
        if (active && loadNumber === latestSongsLoad.current) setAllSongs(songsResult);
      })
      .catch((err) => {
        if (active && !hadCachedList) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || settingsSeeded) return;
    let active = true;
    apiFetch<Settings>("/api/settings")
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [open, settingsSeeded]);

  const handleSettingsChange = (updated: Settings) => {
    setSettings(updated);
    onSettingsChange?.(updated);
  };

  const addSong = (summary: SongSummary | SongDetail) => {
    const values = valuesFromSummary(summary);
    setBuffer((prev) => [
      ...prev,
      {
        kind: "song",
        id: null,
        clientKey: genTempId(),
        songGroupId: summary.id,
        baseResolved: values,
        overriddenFields: [],
        inherited: values,
        overrides: {},
      },
    ]);
  };

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

  // Opening the song editor drops any open override panel: its prefilled initial values would be
  // stale once the song is saved, and discarding its unsaved drafts matches what closing this
  // whole modal already does.
  const openSongEditor = (songGroupId: string) => {
    setOverrideTarget(null);
    setEditSongGroupId(songGroupId);
  };

  // A song created from the combobox isn't in allSongs yet, so its row would show no
  // titleDe/titleEn (songSummaryByGroupId lookup) until the next open. It's appended right away
  // from the POST response -- SongDetail is a superset of SongSummary -- and the list is then
  // refetched (NewSongModal has invalidated the cache) to re-warm the cache. Only allSongs is
  // touched; the buffer change is addSong's alone.
  const handleSongCreated = (song: SongDetail) => {
    setNewSongQuery(null);
    addSong(song);
    const summary: SongSummary = {
      id: song.id,
      archived: song.archived,
      titleDe: song.titleDe,
      titleEn: song.titleEn,
      ...valuesFromSummary(song),
    };
    setAllSongs((prev) => (prev && !prev.some((s) => s.id === summary.id) ? [...prev, summary] : prev));
    const loadNumber = ++latestSongsLoad.current;
    fetchAndCacheSongs()
      .then((songsResult) => {
        if (loadNumber === latestSongsLoad.current) setAllSongs(songsResult);
      })
      // The appended entry already covers this open; a failed refetch only leaves the cache
      // cold, and the next open fetches it.
      .catch(() => {});
  };

  // The PATCH behind EditSongModal creates a new song version and re-points this event's
  // track_list_song rows to it (lib/song-versioning.ts -- this modal only opens for draft/
  // scheduled, unlocked events, exactly the ones that get re-pointed). Deliberately NOT a reseed:
  // that would wipe every uncommitted reorder/add/remove/override. Instead only the edited
  // group's song entries are patched in place:
  // - persisted rows take baseResolved/inherited/overriddenFields from the refetched row (by id),
  //   so stored overrides keep winning over the new song values; their pending `overrides`,
  //   position and clientKey are untouched.
  // - rows added this session (id null) are rebuilt from the refetched song summary.
  // A persisted row the user removed is simply absent from the buffer; one missing from the
  // refetched event (shouldn't happen) is left as is.
  const handleSongSaved = async () => {
    const songGroupId = editSongGroupId;
    setEditSongGroupId(null);
    if (songGroupId === null) return;
    const songsLoadNumber = ++latestSongsLoad.current;
    try {
      const [eventResult, songsResult] = await Promise.all([
        apiFetch<EventDetail>(`/api/events/${eventId}`),
        // A fresh request regardless of the cache (EditSongModal has invalidated it by now
        // anyway); also re-warms the cache with the edited song for the next open.
        fetchAndCacheSongs(),
      ]);
      setEvent(eventResult);
      if (songsLoadNumber === latestSongsLoad.current) setAllSongs(songsResult);
      const refetchedById = new Map(eventResult.songs.map((row) => [row.id, row]));
      const summary = songsResult.find((s) => s.id === songGroupId);
      setBuffer((prev) =>
        prev.map((entry) => {
          if (entry.kind !== "song" || entry.songGroupId !== songGroupId) return entry;
          if (entry.id === null) {
            if (!summary) return entry;
            const values = valuesFromSummary(summary);
            return { ...entry, baseResolved: values, inherited: values };
          }
          const row = refetchedById.get(entry.id);
          if (!row || row.entryType === "spacer") return entry;
          return {
            ...entry,
            baseResolved: {
              title: row.title,
              key: row.key,
              transpose: row.transpose,
              instrument: row.instrument,
              notes: row.notes,
              sheet: row.sheet,
            },
            overriddenFields: row.overriddenFields,
            inherited: row.inherited,
          };
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh after song edit");
    }
  };

  // Commits the whole buffer in one request (spec §5). Wired to both Done and Dialog's own
  // onClose (backdrop click / Escape) by design -- this modal has no separate discard/cancel
  // path. On failure the dialog stays open and `buffer` is untouched,
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
                onAdd={addSong}
                onCreateNew={setNewSongQuery}
              />
              <SearchScopeChips settings={settings} onChange={handleSettingsChange} />
              <Button type="button" variant="contained" color="secondary" onClick={addSpacer}>
                + Add Empty Line
              </Button>
            </div>

            <NewSongModal
              open={newSongQuery !== null}
              initialTitle={newSongQuery ?? undefined}
              onCreated={handleSongCreated}
              onCancel={() => setNewSongQuery(null)}
            />

            {/* Layered over this Dialog, which stays open and mounted underneath. MUI's modal
                manager routes backdrop clicks and Escape to the topmost modal only, so those
                close just this one and never reach this Dialog's onClose (handleCommit). */}
            <EditSongModal
              open={editSongGroupId !== null}
              groupId={editSongGroupId ?? ""}
              onSaved={handleSongSaved}
              onCancel={() => setEditSongGroupId(null)}
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

                const display = resolveBufferSongDisplay(entry);
                const song = songSummaryByGroupId.get(entry.songGroupId);
                const hasOverrides = OVERRIDABLE_FIELDS.some((field) => isFieldOverridden(entry, field));

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
                        <EditIconButton onClick={() => openSongEditor(entry.songGroupId)} />
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
  entry: SongBufferEntry;
  onPatch: (patch: OverridePatch) => void;
  onClose: () => void;
};

// Per-event override form (spec §5 "Tracklist editor", §6 tri-state semantics). Each field
// has its own explicit "Clear" button rather than relying on an empty text input meaning
// "clear" -- an empty string is itself a valid override value, so the two must stay distinct
// affordances in the UI, not just distinct wire values. Mutates the buffer locally via
// onPatch -- no network call, no error state to show, since a local mutation can't fail.
//
// Fields are prefilled with the currently resolved value (rather than shown as a placeholder)
// so it can be edited in place, and a field only lands in the patch if its value differs from
// what it was prefilled with. Prefilling hides whether a value is inherited or event-specific,
// hence the explicit "Overridden for this event" helper text.
const OverrideEditor = ({ entry, onPatch, onClose }: OverrideEditorProps) => {
  const [initialValues, setInitialValues] = useState(() => {
    const resolved = resolveBufferSongDisplay(entry);
    return Object.fromEntries(OVERRIDABLE_FIELDS.map((field) => [field, resolved[field] ?? ""])) as OverrideValues;
  });
  const [values, setValues] = useState(initialValues);

  const handleChange = (field: OverridableField, value: string) => setValues((prev) => ({ ...prev, [field]: value }));

  // Left open rather than auto-closing (the network-era behavior) -- there's no round-trip
  // left to justify auto-closing, and staying open lets the user clear/re-check other fields.
  // Resets both the draft and its baseline to the row's inherited (pinned song version) value,
  // so the input shows what the field will inherit from now on and isn't counted as a pending
  // change on Save.
  const handleClear = (field: OverridableField) => {
    onPatch({ [field]: null });
    const inherited = entry.inherited[field] ?? "";
    setValues((prev) => ({ ...prev, [field]: inherited }));
    setInitialValues((prev) => ({ ...prev, [field]: inherited }));
  };

  const handleSave = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    // Only send fields whose value changed -- an unchanged field must stay absent from the
    // patch so the tri-state merge leaves its existing override alone (spec §6).
    const patch: OverridePatch = {};
    for (const field of OVERRIDABLE_FIELDS) {
      if (values[field] !== initialValues[field]) patch[field] = values[field];
    }
    if (Object.keys(patch).length > 0) onPatch(patch);
    onClose();
  };

  return (
    <form className={styles.overrideForm} onSubmit={handleSave}>
      <p className={styles.overrideHint}>
        Overrides apply to this event only. Leave a field unchanged to keep inheriting from the song.
      </p>
      {OVERRIDABLE_FIELDS.map((field) => {
        const multilineRows = (MULTILINE_FIELDS as Partial<Record<OverridableField, number>>)[field];
        const overridden = isFieldOverridden(entry, field);
        return (
          <div key={field} className={styles.overrideField}>
            <TextField
              label={`${field.charAt(0).toUpperCase()}${field.slice(1)}`}
              value={values[field]}
              onChange={(e) => handleChange(field, e.target.value)}
              helperText={overridden ? "Overridden for this event" : undefined}
              // Always shrunk so the label sits in the outline notch, never inside an empty field.
              slotProps={{ inputLabel: { shrink: true } }}
              size="small"
              multiline={multilineRows !== undefined}
              minRows={multilineRows}
              fullWidth
            />
            <Button
              type="button"
              variant="contained"
              color="secondary"
              size="small"
              onClick={() => handleClear(field)}
              disabled={!overridden}
            >
              Clear
            </Button>
          </div>
        );
      })}
      <div className={styles.overrideActions}>
        <Button type="submit" variant="contained" color="primary">
          Save Overrides
        </Button>
        {/* Unmounting the editor is all "discard" needs -- drafts only live in its local state. */}
        <Button type="button" variant="contained" color="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default TracklistEditModal;
