"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ChangeTitleModal from "@/components/ChangeTitleModal";
import NewSongModal from "@/components/NewSongModal";
import SearchScopeChips from "@/components/SearchScopeChips";
import { apiFetch } from "@/lib/api-client";
import { chromaticKeyRank } from "@/lib/musical-key-order";
import { formatSongDisplayName } from "@/lib/song-display-name";
import { matchesSearch, scopesFromSettings } from "@/lib/song-search";
import type { Settings, SongSummary } from "@/lib/types";
import styles from "./page.module.css";

type SortBy = "name" | "key-alpha" | "key-chromatic";

const SongListPage = () => {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<SongSummary | null>(null);
  const [newSongOpen, setNewSongOpen] = useState(false);

  const loadSongs = () => {
    apiFetch<SongSummary[]>("/api/songs")
      .then(setSongs)
      .catch((err) => setError(err.message));
  };

  useEffect(loadSongs, []);
  useEffect(() => {
    apiFetch<Settings>("/api/settings")
      .then(setSettings)
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!songs || !settings) return [];
    const scopes = scopesFromSettings(settings);
    const matches = songs.filter((song) => matchesSearch(song, query, scopes));

    // Sort by the Romanian title (song.title) -- the one name field every song always has,
    // unlike titleDe/titleEn which are optional. All options sort ascending; no direction
    // toggle since the spec calls this out as a straightforward addition, not a design point.
    const sorted = [...matches];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "key-alpha") {
      sorted.sort((a, b) => a.key.localeCompare(b.key));
    } else {
      // Songs with an unparseable key (empty, "?", free text) sort after every song with a
      // recognized key, grouped together and ordered alphabetically by the raw key string --
      // the spec leaves this ordering as a judgment call since it's not something a musician
      // would care about (there's no meaningful order among "unset" songs).
      sorted.sort((a, b) => {
        const rankA = chromaticKeyRank(a.key);
        const rankB = chromaticKeyRank(b.key);
        if (rankA === null && rankB === null) return a.key.localeCompare(b.key);
        if (rankA === null) return 1;
        if (rankB === null) return -1;
        return rankA - rankB;
      });
    }
    return sorted;
  }, [songs, settings, query, sortBy]);

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
        <Button type="button" variant="contained" color="primary" onClick={() => setNewSongOpen(true)}>
          + New Song
        </Button>
      </div>

      <input
        className={styles.search}
        type="search"
        placeholder="Search..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {settings && <SearchScopeChips settings={settings} onChange={setSettings} />}

      <div className={styles.sortGroup}>
        <span className={styles.sortLabel}>Sorting</span>
        <ToggleButtonGroup
          value={sortBy}
          exclusive
          size="small"
          onChange={(_event, value: SortBy | null) => value && setSortBy(value)}
          aria-label="Sorting"
        >
          <ToggleButton value="name">Name</ToggleButton>
          <ToggleButton value="key-alpha">Key (A B C)</ToggleButton>
          <ToggleButton value="key-chromatic">Key (C C# D)</ToggleButton>
        </ToggleButtonGroup>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!songs && !error && <p>Loading...</p>}
      {songs && filtered.length === 0 && <p className={styles.empty}>No songs found.</p>}

      <ul className={styles.list}>
        {filtered.map((song) => (
          <li key={song.id} className={styles.row}>
            <Link href={`/songs/${song.id}`} className={styles.rowLink}>
              <span className={styles.title}>{formatSongDisplayName(song)}</span>
              <span className={styles.meta}>
                {song.key} ({song.transpose}) &middot; {song.instrument}
              </span>
            </Link>
            <div className={styles.rowActions}>
              <Button component={Link} href={`/songs/${song.id}/edit`} variant="contained" color="secondary" size="small">
                Edit
              </Button>
              <Button type="button" variant="contained" color="secondary" size="small" onClick={() => setRenameTarget(song)}>
                Rename
              </Button>
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

      <NewSongModal
        open={newSongOpen}
        onCreated={() => {
          setNewSongOpen(false);
          loadSongs();
        }}
        onCancel={() => setNewSongOpen(false)}
      />
    </div>
  );
};

export default SongListPage;
