"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import EditEventModal from "@/components/EditEventModal";
import TracklistEditModal from "@/components/TracklistEditModal";
import { useSetHeaderTitle } from "@/components/HeaderTitleProvider";
import { apiFetch } from "@/lib/api-client";
import {
  fetchAndCacheEvent,
  getCachedEvent,
  invalidateEvent,
  type CachedEvent,
} from "@/lib/event-detail-cache";
import { formatGermanDate, formatGermanTimeOrDateTime } from "@/lib/date-format";
import { prefetchSongs } from "@/lib/songs-list-cache";
import { applyOctaveUpSymbol } from "@/lib/notation";
import { formatSongDisplayName } from "@/lib/song-display-name";
import type { EventDetail, EventStatus, EventType, Settings } from "@/lib/types";
import styles from "./page.module.css";

type EventPageProps = { params: Promise<{ id: string }> };

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  sunday_morning: "Sunday Morning",
  sunday_evening: "Sunday Evening",
  other: "Other",
};

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  played: "Played",
};

// The primary mobile live-use screen (spec §5): a vertical scrolling list of resolved song
// fields, with tap-through to the full chord sheet. Each row is kept terse -- title,
// key/transpose, instrument -- since this is read at a music stand, not a desk. Notes are
// shown directly under the row (no tap needed) since they're often load-bearing at a glance;
// only the chord sheet stays behind the tap-to-expand panel.
const EventPage = ({ params }: EventPageProps) => {
  const { id } = use(params);
  const router = useRouter();
  // Seeded from the client-side cache (warmed by the event list's prefetch) so a cache hit
  // renders immediately; loadEvent below still revalidates on mount (stale-while-revalidate).
  // Safe for hydration: the cache is only ever written from client-side effects/handlers, so
  // it's empty during SSR and on the first client render after a full reload alike.
  // Kept together with its fetched-at time so a failed revalidation can say how old the data
  // on screen is.
  const [loaded, setLoaded] = useState<CachedEvent | null>(() => getCachedEvent(id) ?? null);
  const event: EventDetail | null = loaded?.event ?? null;
  const [settings, setSettings] = useState<Settings | null>(null);
  // Failure of the most recent event / settings load. Deliberately NOT one page-wide error that
  // replaces everything: once any event data is on screen, a failed refresh keeps showing it
  // with a "may be outdated" note (stale data beats no data at a music stand with bad Wi-Fi).
  // Only an event load failure with nothing to show falls back to the full error.
  const [eventError, setEventError] = useState<string | null>(null);
  // The event as returned by the newest load *if that load succeeded and nothing has been
  // written since* -- null while the data on screen is only the unrevalidated cache entry, while
  // a load is pending after a write/Retry, or after a failed load. Passed to TracklistEditModal
  // as its seed: the modal's Done replaces the whole tracklist, so seeding its buffer from data
  // that may predate a change made elsewhere (another device, or this page's own last commit)
  // would silently overwrite that change. When null the modal fetches the event itself. Kept
  // with its fetched-at time because the modal additionally refuses a seed older than a minute
  // at open time (EVENT_SEED_MAX_AGE_MS) -- a page left open for long still passes the check
  // above.
  // Set to null synchronously in the handlers that start a load, not in loadEvent: those run
  // from event handlers, while loadEvent also runs from the mount effect, where it starts null.
  const [verifiedEvent, setVerifiedEvent] = useState<CachedEvent | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [openSongId, setOpenSongId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);
  const [editingTracklist, setEditingTracklist] = useState(false);

  // Every event (re)fetch on this page goes through fetchAndCacheEvent, so returning to the
  // list and reopening never shows older data than this page last saw. On mount this is the
  // mandatory revalidation: it runs even when the state above was seeded from the cache.
  // Loads can overlap (mount revalidation, Retry, refetch after a write), so only the newest
  // one may touch state -- otherwise a slow older response could overwrite newer data, or a
  // late older failure could raise the outdated note right after a newer load succeeded.
  // Never rejects, so Retry can simply await it.
  const latestLoad = useRef(0);
  const loadEvent = useCallback((): Promise<void> => {
    const loadNumber = ++latestLoad.current;
    return fetchAndCacheEvent(id).then(
      (entry) => {
        if (loadNumber !== latestLoad.current) return;
        setLoaded(entry);
        setVerifiedEvent(entry);
        setEventError(null);
      },
      (err: Error) => {
        if (loadNumber !== latestLoad.current) return;
        setVerifiedEvent(null);
        setEventError(err.message);
      },
    );
  }, [id]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // After a local write: invalidate first so neither an older in-flight prefetch nor a failed
  // refetch can leave pre-write data in the cache, then refetch. The current data stays on
  // screen until the fresh data arrives -- and if the refetch fails it stays with the outdated
  // note (whose fetched-at time predates the write), never silently passed off as fresh.
  const reloadAfterWrite = () => {
    setVerifiedEvent(null);
    invalidateEvent(id);
    loadEvent();
  };

  // Loaded separately from the event (was one Promise.all) so a cached event can render
  // without waiting on settings. Settings only feed the chord sheet's octave-up symbol, which
  // sits behind a tap-to-expand panel. The only way they change from this page is the tracklist
  // modal's scope chips, which hand back the PATCHed settings (onSettingsChange) -- so it's
  // fetched once rather than on every event refetch (Retry re-runs it only if it never
  // succeeded). The same copy seeds the tracklist modal's search scopes.
  // Never rejects, same as loadEvent.
  const loadSettings = (): Promise<void> =>
    apiFetch<Settings>("/api/settings").then(
      (result) => {
        setSettings(result);
        setSettingsError(null);
      },
      (err: Error) => setSettingsError(err.message),
    );

  useEffect(() => {
    loadSettings();
  }, []);

  // Warms the tracklist modal's song list (lib/songs-list-cache.ts) for a page reached without
  // going through the event list (deep link, reload). Runs after the event and settings
  // requests have started, and is a no-op if the list is already cached or in flight.
  useEffect(() => {
    prefetchSongs();
  }, []);

  // Re-runs the failed loads in place. A page reload is not a recovery path: it would wipe the
  // in-memory event cache and, while still offline, land on the full error instead.
  const handleRetry = async () => {
    setRetrying(true);
    setVerifiedEvent(null);
    await Promise.all([loadEvent(), settings ? null : loadSettings()]);
    setRetrying(false);
  };

  // Composite date + type/status header content (spec: date at the nav brand's own size,
  // type/status/lock immediately after at the smaller .meta size, all on one line). Memoized
  // on `event` -- useSetHeaderTitle re-fires its effect whenever the node it's given is a new
  // reference, and a fresh JSX element would otherwise be created on every render (e.g. every
  // openSongId toggle), causing an unnecessary churn of context updates.
  const headerTitle = useMemo(() => {
    if (!event) return null;
    return (
      <>
        {formatGermanDate(event.date)}
        <span className={styles.meta}>
          {" "}
          {event.name ?? EVENT_TYPE_LABELS[event.type]}
          {event.name ? ` (${EVENT_TYPE_LABELS[event.type]})` : ""} &middot;{" "}
          {EVENT_STATUS_LABELS[event.status]}
          {/* Escaped codepoint, not a literal glyph, so the source file stays plain ASCII. */}
          {event.lockedAt ? " \u{1F512} locked" : ""}
        </span>
      </>
    );
  }, [event]);
  useSetHeaderTitle(headerTitle);

  const handleStatusChange = async (status: string) => {
    await apiFetch(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    reloadAfterWrite();
  };

  const handleEditEvent = async (values: { date: string; type: EventType; name: string | null }) => {
    await apiFetch(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(values) });
    setEditingEvent(false);
    reloadAfterWrite();
  };

  const handleLockToggle = async () => {
    if (!event) return;
    await apiFetch(`/api/events/${id}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ locked: !event.lockedAt }),
    });
    reloadAfterWrite();
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this event? It can still be recovered by an admin, but will disappear from your lists.")) {
      return;
    }
    await apiFetch(`/api/events/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    invalidateEvent(id);
    router.push("/events");
  };

  // Nothing to show yet: an event load failure is fatal, as before. A settings failure alone
  // is not -- the page waits for the event and then surfaces it as the note below.
  if (!loaded || !event) {
    if (eventError) return <p className={styles.error}>{eventError}</p>;
    return <p>Loading...</p>;
  }

  // Mirrors the batch commit endpoint's own 409 check (spec tracklist-batch-save §2.6 Option
  // B) -- a played or manually-locked event's tracklist can no longer be edited. Disabling the
  // entry point here surfaces that before the user invests time editing, rather than only via
  // a failed commit.
  const tracklistLocked = event.status === "played" || event.lockedAt !== null;

  return (
    <div className={styles.page}>
      {(eventError || settingsError) && (
        <div className={styles.staleNote} role="status">
          <span className={styles.staleNoteText}>
            {eventError &&
              `Couldn't refresh -- showing data from ${formatGermanTimeOrDateTime(loaded.fetchedAt)}, may be outdated.`}
            {eventError && settingsError && " "}
            {settingsError && "Couldn't load display settings."}
          </span>
          <Button size="small" variant="outlined" color="inherit" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying..." : "Retry"}
          </Button>
        </div>
      )}

      <div className={styles.controls}>
        <Button variant="contained" color="secondary" onClick={() => setEditingEvent(true)}>
          Edit Event
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => setEditingTracklist(true)}
          disabled={tracklistLocked}
          title={tracklistLocked ? "This event is played or locked -- unlock it to edit the tracklist" : undefined}
        >
          Edit Tracklist
        </Button>
      </div>

      {editingEvent && (
        <EditEventModal
          currentDate={event.date.slice(0, 10)}
          currentType={event.type}
          currentName={event.name}
          currentStatus={event.status}
          lockedAt={event.lockedAt}
          onSave={handleEditEvent}
          onCancel={() => setEditingEvent(false)}
          onStatusChange={handleStatusChange}
          onLockToggle={handleLockToggle}
          onDelete={handleDelete}
        />
      )}

      {/* Seeds are read only when the modal opens (see TracklistEditModal), so this page's
          revalidation landing while it's open never touches its buffer. Scope-chip toggles in the
          modal PATCH settings; reporting them back keeps this page's copy -- the next open's seed
          -- current. */}
      <TracklistEditModal
        open={editingTracklist}
        eventId={id}
        initialEvent={verifiedEvent}
        initialSettings={settings}
        onSettingsChange={setSettings}
        onDone={() => {
          setEditingTracklist(false);
          reloadAfterWrite();
        }}
      />

      {event.songs.length === 0 && <p className={styles.empty}>No songs on this setlist yet.</p>}

      <ul className={styles.list}>
        {event.songs.map((entry) =>
          entry.entryType === "spacer" ? (
            <li key={entry.id}>
              <div className={styles.groupBreak} aria-hidden="true" />
            </li>
          ) : (
            <li key={entry.id}>
              <div className={styles.song}>
                <button
                  className={styles.songRow}
                  onClick={() => setOpenSongId(openSongId === entry.id ? null : entry.id)}
                >
                  <span className={styles.songTitle}>{formatSongDisplayName(entry)}</span>
                  <span className={styles.songMeta}>
                    {entry.key} ({entry.transpose}) &middot; {entry.instrument}
                  </span>
                </button>
                {entry.notes && <p className={styles.notes}>{entry.notes}</p>}
                {openSongId === entry.id && (
                  <div className={styles.sheetPanel}>
                    {entry.sheet ? (
                      // Settings can still be in flight on a cache-hit render. Wait for them
                      // rather than flashing the raw "+" before the configured symbol arrives --
                      // unless they failed to load: then the raw sheet beats no sheet (the note
                      // at the top says settings are missing).
                      settings ? (
                        <pre className={styles.sheet}>
                          {applyOctaveUpSymbol(entry.sheet, settings.octaveUpDisplaySymbol)}
                        </pre>
                      ) : settingsError ? (
                        <pre className={styles.sheet}>{entry.sheet}</pre>
                      ) : (
                        <p>Loading...</p>
                      )
                    ) : (
                      <p className={styles.empty}>No chord sheet for this song.</p>
                    )}
                  </div>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
};

export default EventPage;
