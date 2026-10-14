import { apiFetch } from "@/lib/api-client";
import type { EventDetail } from "@/lib/types";

// Client-side, in-memory cache of GET /api/events/:id results -- purely a speed optimisation
// so opening an event from the list renders instantly instead of showing "Loading...". Module
// scope survives App Router client-side navigations but is reset on a full page reload, which
// is intentional: no service worker, no persistent storage, no offline support.
// The cache is never the final word: the event page always revalidates on open
// (stale-while-revalidate), which covers edits made on other devices. Local writes go further
// and invalidate (invalidateEvent / clearEventDetailCache) so a failed revalidation can't
// leave pre-write data behind.
//
// Each entry carries the time its response arrived, so the event page can tell the user how old
// the data on screen is when a revalidation fails and it keeps showing that data anyway.
export type CachedEvent = { event: EventDetail; fetchedAt: Date };

const cache = new Map<string, CachedEvent>();

// The pending request per id, shared so the list's prefetch never fires a duplicate request
// for an id that is already being fetched (by an earlier prefetch or by the event page).
const inFlight = new Map<string, Promise<CachedEvent>>();

// Monotonic request counter + the latest request number started per id. A response only
// writes the cache if no newer request (or invalidation) for that id happened since it
// started. Without this, a slow prefetch could resolve *after* a newer fetch -- or after a
// local write invalidated the entry -- and put older data back into the cache.
let requestCounter = 0;
const latestRequest = new Map<string, number>();

// Bumped by clearEventDetailCache to supersede every request in flight at that moment,
// including ids latestRequest has never seen.
let generation = 0;

export const getCachedEvent = (id: string): CachedEvent | undefined => cache.get(id);

// Always issues a fresh request (the event page's load/revalidation path) and caches the
// result if it is still the newest one for this id. Resolves with the fetched-at timestamp even
// when the result was too old to be cached, so the caller can label what it renders.
export const fetchAndCacheEvent = (id: string): Promise<CachedEvent> => {
  const requestNumber = ++requestCounter;
  const startGeneration = generation;
  latestRequest.set(id, requestNumber);
  const promise = apiFetch<EventDetail>(`/api/events/${id}`).then((event) => {
    const entry: CachedEvent = { event, fetchedAt: new Date() };
    if (generation === startGeneration && latestRequest.get(id) === requestNumber) {
      cache.set(id, entry);
    }
    return entry;
  });
  inFlight.set(id, promise);
  // Only clear the slot if it still holds this request -- a newer one may have replaced it.
  const clearSlot = () => {
    if (inFlight.get(id) === promise) inFlight.delete(id);
  };
  promise.then(clearSlot, clearSlot);
  return promise;
};

// Fire-and-forget warm-up from the event list. Reuses a request already in flight for this id.
// Failures are swallowed: a missed prefetch only means that event's page falls back to its
// normal Loading state and fetches as before.
export const prefetchEvent = (id: string): void => {
  (inFlight.get(id) ?? fetchAndCacheEvent(id)).catch(() => {});
};

// Call after any local write to one event (status, lock, edit, archive, tracklist commit).
// Drops the entry and supersedes in-flight requests for it, whose responses may predate the
// write.
export const invalidateEvent = (id: string): void => {
  cache.delete(id);
  inFlight.delete(id);
  latestRequest.set(id, ++requestCounter);
};

// Call after any song write. Editing a song creates a new version and re-points the tracklists
// of every draft/scheduled unlocked event (lib/song-versioning.ts) -- exactly the non-played
// events the list prefetches -- and a title rename changes what every event shows, so there's
// no cheap way to know which entries are affected.
export const clearEventDetailCache = (): void => {
  cache.clear();
  inFlight.clear();
  generation++;
};
