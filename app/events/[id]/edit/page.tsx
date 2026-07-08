"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { EventDetail, SongSummary } from "@/lib/types";
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
  const [error, setError] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);

  const load = () => {
    Promise.all([apiFetch<EventDetail>(`/api/events/${id}`), apiFetch<SongSummary[]>("/api/songs")])
      .then(([eventResult, songsResult]) => {
        setEvent(eventResult);
        setAllSongs(songsResult);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [id]);

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
  if (!event || !allSongs) return <p>Loading...</p>;

  const availableSongs = allSongs.filter((s) => !s.archived);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Edit Tracklist</h1>
        <Link href={`/events/${id}`} className="btn btnSecondary">
          Done
        </Link>
      </div>

      <div className={styles.addRow}>
        <SongSearchCombobox availableSongs={availableSongs} onAdd={handleAdd} />
        <button type="button" className="btn btnSecondary" onClick={handleAddSpacer}>
          + Add Empty Line
        </button>
      </div>

      <ul className={styles.list}>
        {event.songs.map((entry, index) => (
          <li key={entry.id} className={entry.entryType === "spacer" ? styles.spacerRow : styles.row}>
            {entry.entryType === "spacer" ? (
              <div className={styles.rowMain}>
                <span className={styles.spacerLabel}>&mdash; Empty Line &mdash;</span>
                <div className={styles.rowActions}>
                  <button
                    className={`btn btnSecondary ${styles.compactButton}`}
                    onClick={() => handleMove(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    &uarr;
                  </button>
                  <button
                    className={`btn btnSecondary ${styles.compactButton}`}
                    onClick={() => handleMove(index, 1)}
                    disabled={index === event.songs.length - 1}
                    aria-label="Move down"
                  >
                    &darr;
                  </button>
                  <button
                    className={`btn btnDanger ${styles.compactButton}`}
                    onClick={() => handleRemove(entry.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.rowMain}>
                  <div className={styles.rowInfo}>
                    <span className={styles.title}>{entry.title}</span>
                    <span className={styles.meta}>
                      {entry.key} ({entry.transpose}) &middot; {entry.instrument}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      className={`btn btnSecondary ${styles.compactButton}`}
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      &uarr;
                    </button>
                    <button
                      className={`btn btnSecondary ${styles.compactButton}`}
                      onClick={() => handleMove(index, 1)}
                      disabled={index === event.songs.length - 1}
                      aria-label="Move down"
                    >
                      &darr;
                    </button>
                    <button
                      className={`btn btnSecondary ${styles.compactButton}`}
                      onClick={() => setOverrideTarget(overrideTarget === entry.id ? null : entry.id)}
                    >
                      Override
                    </button>
                    <button
                      className={`btn btnDanger ${styles.compactButton}`}
                      onClick={() => handleRemove(entry.id)}
                    >
                      Remove
                    </button>
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
  onAdd: (songGroupId: string) => void;
};

// Search-as-you-type "add a song" combobox: typing filters availableSongs (same lowercase
// substring match as the main song list at app/page.tsx), and clicking a result adds it
// immediately -- there's no separate "Add" step. Click-outside/Escape-to-close mirrors the
// popup pattern used by components/DateField.tsx.
const SongSearchCombobox = ({ availableSongs, onAdd }: SongSearchComboboxProps) => {
  const [songQuery, setSongQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSongs = useMemo(() => {
    const q = songQuery.trim().toLowerCase();
    if (!q) return availableSongs;
    return availableSongs.filter((song) => song.title.toLowerCase().includes(q));
  }, [availableSongs, songQuery]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (song: SongSummary) => {
    onAdd(song.id);
    setSongQuery("");
    setOpen(false);
  };

  return (
    <div className={styles.combobox} ref={containerRef}>
      <input
        type="search"
        className={styles.comboboxInput}
        placeholder="Add a song..."
        value={songQuery}
        onChange={(e) => {
          setSongQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <ul className={styles.comboboxResults}>
          {filteredSongs.length === 0 ? (
            <li className={styles.comboboxEmpty}>No matching songs</li>
          ) : (
            filteredSongs.map((song) => (
              <li key={song.id}>
                <button
                  type="button"
                  className={styles.comboboxOption}
                  onClick={() => handleSelect(song)}
                >
                  {song.title}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
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
          <label>
            <span>{field}</span>
            <input
              value={values[field]}
              onChange={(e) => handleChange(field, e.target.value)}
              placeholder={current[field] ?? ""}
            />
          </label>
          <button
            type="button"
            className={`btn btnSecondary ${styles.compactButton}`}
            onClick={() => handleClear(field)}
          >
            Clear
          </button>
        </div>
      ))}
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className="btn btnPrimary">
        Save Overrides
      </button>
    </form>
  );
};

export default TracklistEditPage;
