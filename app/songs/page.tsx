"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ChangeTitleModal from "@/components/ChangeTitleModal";
import { apiFetch } from "@/lib/api-client";
import type { SongSummary } from "@/lib/types";
import styles from "./page.module.css";

const SongListPage = () => {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<SongSummary | null>(null);

  const loadSongs = () => {
    apiFetch<SongSummary[]>("/api/songs")
      .then(setSongs)
      .catch((err) => setError(err.message));
  };

  useEffect(loadSongs, []);

  const filtered = useMemo(() => {
    if (!songs) return [];
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((song) => song.title.toLowerCase().includes(q));
  }, [songs, query]);

  const handleSaveTitle = async (newTitle: string) => {
    if (!renameTarget) return;
    // Title-only body -- the API route (app/api/songs/[groupId]/route.ts) only runs its
    // versioning logic when key/transpose/instrument/notes/sheet are present, so this never
    // creates a new song version.
    await apiFetch(`/api/songs/${renameTarget.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: newTitle }),
    });
    setRenameTarget(null);
    loadSongs();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Songs</h1>
        <Link href="/songs/new" className="btn btnPrimary">
          + New Song
        </Link>
      </div>

      <input
        className={styles.search}
        type="search"
        placeholder="Search by title..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className={styles.error}>{error}</p>}
      {!songs && !error && <p>Loading...</p>}
      {songs && filtered.length === 0 && <p className={styles.empty}>No songs found.</p>}

      <ul className={styles.list}>
        {filtered.map((song) => (
          <li key={song.id} className={styles.row}>
            <Link href={`/songs/${song.id}`} className={styles.rowLink}>
              <span className={styles.title}>{song.title}</span>
              <span className={styles.meta}>
                {song.key} ({song.transpose}) &middot; {song.instrument}
              </span>
            </Link>
            <div className={styles.rowActions}>
              <button
                type="button"
                className={`btn btnSecondary ${styles.compactButton}`}
                onClick={() => setRenameTarget(song)}
              >
                Rename
              </button>
            </div>
          </li>
        ))}
      </ul>

      {renameTarget && (
        <ChangeTitleModal
          currentTitle={renameTarget.title}
          onSave={handleSaveTitle}
          onCancel={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
};

export default SongListPage;
