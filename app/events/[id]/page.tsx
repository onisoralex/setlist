"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EditEventModal from "@/components/EditEventModal";
import { apiFetch } from "@/lib/api-client";
import { formatGermanDate } from "@/lib/date-format";
import { applyOctaveUpSymbol } from "@/lib/notation";
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
// fields, with tap-through to the full chord sheet. Kept deliberately terse per row -- title,
// key/transpose, instrument only -- since this is read at a music stand, not a desk.
const EventPage = ({ params }: EventPageProps) => {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSongId, setOpenSongId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);

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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>{formatGermanDate(event.date)}</h1>
          <p className={styles.meta}>
            {event.name ?? EVENT_TYPE_LABELS[event.type]}
            {event.name ? ` (${EVENT_TYPE_LABELS[event.type]})` : ""} &middot;{" "}
            {EVENT_STATUS_LABELS[event.status]}
            {event.lockedAt ? " \u{1F512} locked" : ""}
          </p>
        </div>
        <div className={styles.controls}>
          <button className="btn btnSecondary" onClick={() => setEditingEvent(true)}>
            Edit Event
          </button>
          <Link href={`/events/${id}/edit`} className="btn btnSecondary">
            Edit Tracklist
          </Link>
        </div>
      </div>

      {editingEvent && (
        <EditEventModal
          currentDate={event.date.slice(0, 10)}
          currentType={event.type}
          currentName={event.name}
          onSave={handleEditEvent}
          onCancel={() => setEditingEvent(false)}
        />
      )}

      <div className={styles.controls}>
        {event.status === "draft" && (
          <button className="btn btnSecondary" onClick={() => handleStatusChange("scheduled")}>
            Mark Scheduled
          </button>
        )}
        {event.status === "scheduled" && (
          <button className="btn btnSecondary" onClick={() => handleStatusChange("played")}>
            Mark Played
          </button>
        )}
        <button className="btn btnSecondary" onClick={handleLockToggle}>
          {event.lockedAt ? "Unlock" : "Lock"}
        </button>
        <button className="btn btnDanger" onClick={handleDelete}>
          Delete
        </button>
      </div>

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
                  <span className={styles.songTitle}>{entry.title}</span>
                  <span className={styles.songMeta}>
                    {entry.key} ({entry.transpose}) &middot; {entry.instrument}
                  </span>
                </button>
                {openSongId === entry.id && (
                  <div className={styles.sheetPanel}>
                    {entry.notes && <p className={styles.notes}>{entry.notes}</p>}
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
