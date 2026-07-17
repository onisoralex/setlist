"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import DateField from "@/components/DateField";
import { useSetHeaderTitle } from "@/components/HeaderTitleProvider";
import { apiFetch } from "@/lib/api-client";
import { formatGermanDate } from "@/lib/date-format";
import type { EventStatus, EventSummary, EventType } from "@/lib/types";
import scroll from "@/app/scroll.module.css";
import styles from "./page.module.css";

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

const EventsPage = () => {
  useSetHeaderTitle("Events");

  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<EventType>("sunday_morning");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadEvents = () => {
    apiFetch<EventSummary[]>("/api/events")
      .then(setEvents)
      .catch((err) => setError(err.message));
  };

  useEffect(loadEvents, []);

  const handleDelete = async (eventId: string) => {
    if (!window.confirm("Delete this event? It can still be recovered by an admin, but will disappear from your lists.")) {
      return;
    }
    await apiFetch(`/api/events/${eventId}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    loadEvents();
  };

  const handleCreate = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    const trimmedName = name.trim();
    if (type === "other" && !trimmedName) {
      setError("Name is required for Other events");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({ date, type, name: trimmedName === "" ? null : trimmedName }),
      });
      setName("");
      loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`${styles.page} ${scroll.shell}`}>
      <form className={styles.createForm} onSubmit={handleCreate}>
        <DateField value={date} onChange={setDate} />
        <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
          <option value="sunday_morning">Sunday Morning</option>
          <option value="sunday_evening">Sunday Evening</option>
          <option value="other">Other</option>
        </select>
        {type === "other" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
            required
          />
        )}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          // sx, not the CSS module -- MUI's own emotion-injected button styles load after this
          // app's CSS modules (see components/MuiThemeProvider.tsx's comments on load order),
          // so a plain module class's margin-left: auto gets silently overridden. sx wins.
          sx={{ marginLeft: "auto" }}
          disabled={creating}
        >
          {creating ? "Creating..." : "+ New Event"}
        </Button>
      </form>

      {error && <p className={styles.error}>{error}</p>}
      {!events && !error && <p>Loading...</p>}
      {events && events.length === 0 && <p className={styles.empty}>No events yet.</p>}

      <ul className={`${styles.list} ${scroll.area}`}>
        {events?.map((event) => (
          <li key={event.id} className={styles.row}>
            <div className={styles.rowLink}>
              <Link href={`/events/${event.id}`} className={styles.rowLinkInner}>
                <span className={styles.date}>{formatGermanDate(event.date)}</span>
                <span className={styles.meta}>
                  {event.name ?? EVENT_TYPE_LABELS[event.type]}
                  {event.name ? ` (${EVENT_TYPE_LABELS[event.type]})` : ""} &middot;{" "}
                  {EVENT_STATUS_LABELS[event.status]}
                  {event.lockedAt ? " \u{1F512}" : ""}
                </span>
              </Link>
              <Button variant="contained" color="error" onClick={() => handleDelete(event.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EventsPage;
