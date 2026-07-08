"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { formatGermanDateTime } from "@/lib/date-format";
import { applyOctaveUpSymbol } from "@/lib/notation";
import type { SongDetail, Settings } from "@/lib/types";
import styles from "./page.module.css";

type SongDetailPageProps = { params: Promise<{ groupId: string }> };

const SongDetailPage = ({ params }: SongDetailPageProps) => {
  const { groupId } = use(params);
  const [song, setSong] = useState<SongDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<SongDetail>(`/api/songs/${groupId}`),
      apiFetch<Settings>("/api/settings"),
    ])
      .then(([songResult, settingsResult]) => {
        setSong(songResult);
        setSettings(settingsResult);
      })
      .catch((err) => setError(err.message));
  }, [groupId]);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!song || !settings) return <p>Loading...</p>;

  const displaySheet = song.sheet ? applyOctaveUpSymbol(song.sheet, settings.octaveUpDisplaySymbol) : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>{song.title}</h1>
          <p className={styles.meta}>
            {song.key} ({song.transpose}) &middot; {song.instrument}
          </p>
        </div>
        <Link href={`/songs/${groupId}/edit`} className={styles.editButton}>
          Edit
        </Link>
      </div>

      {song.notes && <p className={styles.notes}>{song.notes}</p>}

      {displaySheet ? (
        <pre className={styles.sheet}>{displaySheet}</pre>
      ) : (
        <p className={styles.empty}>No chord sheet yet.</p>
      )}

      {song.versions.length > 1 && (
        <details className={styles.history}>
          <summary>Version history ({song.versions.length})</summary>
          <ul>
            {song.versions.map((v) => (
              <li key={v.id}>
                v{v.version} &mdash; {formatGermanDateTime(v.createdAt)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export default SongDetailPage;
