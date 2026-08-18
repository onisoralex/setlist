"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import EditEventModal from "@/components/EditEventModal";
import TracklistEditModal from "@/components/TracklistEditModal";
import { useSetHeaderTitle } from "@/components/HeaderTitleProvider";
import { apiFetch } from "@/lib/api-client";
import { formatGermanDate } from "@/lib/date-format";
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
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSongId, setOpenSongId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);
  const [editingTracklist, setEditingTracklist] = useState(false);

  const load = () => {
    Promise.all([
      apiFetch<EventDetail>(`/api/events/${id}`),
      apiFetch<Settings>("/api/settings"),
    ])
      .then(([eventResult, settingsResult]) => {
        setEvent(eventResult);
        setSettings(settingsResult);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [id]);

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
          {event.lockedAt ? " \u{1F512} locked" : ""}
        </span>
      </>
    );
  }, [event]);
  useSetHeaderTitle(headerTitle);

  const handleStatusChange = async (status: string) => {
    await apiFetch(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  };

  const handleEditEvent = async (values: { date: string; type: EventType; name: string | null }) => {
    await apiFetch(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(values) });
    setEditingEvent(false);
    load();
  };

  const handleLockToggle = async () => {
    if (!event) return;
    await apiFetch(`/api/events/${id}/lock`, {
      method: "PATCH",
      body: JSON.stringify({ locked: !event.lockedAt }),
    });
    load();
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this event? It can still be recovered by an admin, but will disappear from your lists.")) {
      return;
    }
    await apiFetch(`/api/events/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    router.push("/events");
  };

  if (error) return <p className={styles.error}>{error}</p>;
  if (!event || !settings) return <p>Loading...</p>;

  // Mirrors the batch commit endpoint's own 409 check (spec tracklist-batch-save §2.6 Option
  // B) -- a played or manually-locked event's tracklist can no longer be edited. Disabling the
  // entry point here surfaces that before the user invests time editing, rather than only via
  // a failed commit.
  const tracklistLocked = event.status === "played" || event.lockedAt !== null;

  return (
    <div className={styles.page}>
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

      <TracklistEditModal
        open={editingTracklist}
        eventId={id}
        onDone={() => {
          setEditingTracklist(false);
          load();
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
                      <pre className={styles.sheet}>
                        {applyOctaveUpSymbol(entry.sheet, settings.octaveUpDisplaySymbol)}
                      </pre>
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
