import { apiFetch } from "@/lib/api-client";
import type { SongSummary } from "@/lib/types";

// Client-side, in-memory cache of GET /api/songs?includeArchived=true -- the tracklist edit
// modal's song list (combobox options + titleDe/titleEn lookups for its rows), and by far the
// largest payload it waits on, since every summary carries its chord sheet. Same shape and
// lifetime as lib/event-detail-cache.ts: module scope, survives client-side navigations, reset on
// a full reload, never the final word -- the modal always revalidates when it opens and simply
// swaps in the fresh list. That is safe because the list never feeds the modal's edit buffer,
// only what the user can pick from and how rows are labelled.
// Local song writes (create, edit, rename) call invalidateSongsCache so a failed revalidation
// can't leave pre-write data behind.

const url = "/api/songs?includeArchived=true";

let cached: SongSummary[] | undefined;

// The pending request, shared so a prefetch never fires a duplicate request while one is
// already running.
let inFlight: Promise<SongSummary[]> | null = null;

// Number of the newest request (or invalidation). A response only writes the cache if nothing
// newer happened since it started -- otherwise a slow request that predates a song write could
// put pre-write data back. Single-key version of event-detail-cache's latestRequest.
let latestRequest = 0;

export const getCachedSongs = (): SongSummary[] | undefined => cached;

// Always issues a fresh request (the modal's revalidation path) and caches the result if it is
// still the newest. Resolves with the fetched list even when it was too old to be cached.
export const fetchAndCacheSongs = (): Promise<SongSummary[]> => {
  const requestNumber = ++latestRequest;
  const promise = apiFetch<SongSummary[]>(url).then((songs) => {
    if (latestRequest === requestNumber) cached = songs;
    return songs;
  });
  inFlight = promise;
  const clearSlot = () => {
    if (inFlight === promise) inFlight = null;
  };
  promise.then(clearSlot, clearSlot);
  return promise;
};

// Fire-and-forget warm-up from the event list and event page. Unlike prefetchEvent this only
// fetches when the cache is cold: the payload is large, and the modal revalidates on open
// anyway, so refreshing an already-warm entry on every list render would buy nothing.
// Failures are swallowed -- the modal then fetches as before.
export const prefetchSongs = (): void => {
  if (cached || inFlight) return;
  fetchAndCacheSongs().catch(() => {});
};

// Call after any local song write. Drops the entry and supersedes any request in flight, whose
// response may predate the write.
export const invalidateSongsCache = (): void => {
  cached = undefined;
  inFlight = null;
  latestRequest++;
};
