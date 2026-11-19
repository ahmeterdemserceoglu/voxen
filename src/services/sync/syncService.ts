import { firestoreService } from '../firebase/firestoreService';
import { FIRESTORE_SUBCOLLECTIONS } from '../../constants/firestoreCollections';
import { logger } from '../../utils/logger';
import { accountStorage, accountSession } from '../auth/accountStorage';
import { isLibraryMutationType, mutationQueue } from './mutationQueue';
import type { SerializedTrack, Playlist, PendingLibrarySnapshot, MutationType } from '../../models';

const TAG = 'SyncService';

export interface SyncStatus {
  online: boolean | null;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  retryAt: number | null;
}

const listeners = new Set<(status: SyncStatus) => void>();
let status: SyncStatus = {
  online: null,
  isSyncing: false,
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  retryAt: null,
};
let inFlight: Promise<void> | null = null;
let rerunRequested = false;
let rerunRequest: { uid: string; applySnapshot: () => Promise<void> } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function updateStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener(status));
}

function isCurrent(uid: string, epoch: number): boolean {
  return accountSession.uid === uid && accountSession.isCurrent(epoch);
}

function scheduleRetry(uid: string, epoch: number, retryAt: number, applySnapshot: () => Promise<void>): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (status.online === true && isCurrent(uid, epoch)) {
      void syncService.synchronize(uid, applySnapshot);
    }
  }, Math.max(0, retryAt - Date.now()));
}

export const syncService = {
  getStatus: (): SyncStatus => status,

  subscribe: (listener: (status: SyncStatus) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setOnline: (online: boolean | null): void => {
    updateStatus({ online });
    if (online !== true && retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  },

  refreshStatus: async (): Promise<void> => {
    const epoch = accountSession.generation;
    const uid = accountSession.uid;
    const storage = accountStorage.capture();
    try {
      const pending = await mutationQueue.load(storage);
      if (!accountSession.isCurrent(epoch) || accountSession.uid !== uid) return;
      updateStatus({
        pendingCount: pending.length,
        isSyncing: false,
        lastSyncedAt: null,
        lastError: null,
        retryAt: pending.reduce<number | null>((earliest, mutation) => {
          const at = mutation.nextAttemptAt;
          return typeof at === 'number' && (earliest === null || at < earliest) ? at : earliest;
        }, null),
      });
    } catch (error) {
      if (accountSession.isCurrent(epoch)) {
        updateStatus({ lastError: error instanceof Error ? error.message : String(error) });
      }
    }
  },

  enqueueLibraryMutation: async (
    type: MutationType,
    snapshot: PendingLibrarySnapshot,
  ): Promise<void> => {
    const epoch = accountSession.generation;
    const uid = accountSession.uid;
    const storage = accountStorage.capture();
    try {
      await mutationQueue.enqueue(type, snapshot, storage);
      const pending = await mutationQueue.load(storage);
      if (accountSession.isCurrent(epoch) && accountSession.uid === uid) {
        updateStatus({
          pendingCount: pending.length,
          lastError: null,
          retryAt: null,
        });
      }
    } catch (error) {
      if (accountSession.isCurrent(epoch) && accountSession.uid === uid) {
        updateStatus({
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
      logger.error(TAG, 'Failed to queue a library mutation', error);
      throw error;
    }
  },

  synchronize: async (uid: string, applySnapshot: () => Promise<void>): Promise<void> => {
    if (inFlight) {
      rerunRequested = true;
      rerunRequest = { uid, applySnapshot };
      return inFlight;
    }

    const epoch = accountSession.generation;
    if (!isCurrent(uid, epoch)) return;
    const storage = accountStorage.capture();
    const task = (async () => {
      let applying: string[] = [];
      try {
        while (isCurrent(uid, epoch)) {
          const mutations = await mutationQueue.load(storage);
          updateStatus({ pendingCount: mutations.length });
          if (status.online !== true || mutations.length === 0) return;

          const mutation = mutations.find((item) => isLibraryMutationType(item.type));
          if (!mutation) {
            if (mutations.length > 0) {
              updateStatus({
                lastError: 'The queue contains a mutation type this client cannot synchronize.',
                retryAt: null,
              });
            }
            return;
          }
          const retryAt = mutation.nextAttemptAt;
          if (typeof retryAt === 'number' && retryAt > Date.now()) {
            updateStatus({
              retryAt,
              lastError: mutation.lastError || status.lastError,
            });
            scheduleRetry(uid, epoch, retryAt, applySnapshot);
            return;
          }

          applying = [mutation.id];
          updateStatus({ isSyncing: true, lastError: null, retryAt: null });
          await applySnapshot();
          if (!isCurrent(uid, epoch)) return;

          const remaining = await mutationQueue.remove(applying, storage);
          applying = [];
          updateStatus({
            pendingCount: remaining.length,
            lastSyncedAt: Date.now(),
            lastError: null,
            retryAt: null,
          });
        }
      } catch (error) {
        if (!isCurrent(uid, epoch)) return;
        let failure: Awaited<ReturnType<typeof mutationQueue.recordFailure>>;
        try {
          failure = await mutationQueue.recordFailure(applying, error, storage);
        } catch (queueError) {
          updateStatus({
            lastError: `${error instanceof Error ? error.message : String(error)}; retry state could not be saved: ${queueError instanceof Error ? queueError.message : String(queueError)}`,
          });
          logger.error(TAG, 'Failed to persist synchronization retry state', queueError);
          return;
        }
        const retryAt = failure.retryAt
          ?? failure.mutations.reduce<number | null>((earliest, mutation) => {
            const at = mutation.nextAttemptAt;
            return typeof at === 'number' && (earliest === null || at < earliest) ? at : earliest;
          }, null);
        updateStatus({
          pendingCount: failure.mutations.length,
          lastError: error instanceof Error ? error.message : String(error),
          retryAt,
        });
        logger.warn(TAG, 'Library synchronization failed; queued changes were retained', error);
        if (retryAt !== null) scheduleRetry(uid, epoch, retryAt, applySnapshot);
      } finally {
        if (isCurrent(uid, epoch)) updateStatus({ isSyncing: false });
        inFlight = null;
        const rerun = rerunRequest;
        rerunRequest = null;
        const shouldRerun = rerunRequested;
        rerunRequested = false;
        if (shouldRerun && rerun && status.online === true && isCurrent(rerun.uid, accountSession.generation)) {
          void syncService.synchronize(rerun.uid, rerun.applySnapshot);
        }
      }
    })();

    inFlight = task;
    return task;
  },

  /** Push local liked tracks to Firestore */
  pushLikedTracks: async (uid: string, tracks: SerializedTrack[]): Promise<void> => {
    try {
      const batch = tracks.map((track) => ({
        type: 'set' as const,
        path: `users/${uid}/${FIRESTORE_SUBCOLLECTIONS.LIKED_TRACKS}/${track.id}`,
        data: { track, likedAt: Date.now() },
      }));
      if (batch.length > 0) await firestoreService.batchWrite(batch);
    } catch (err) {
      logger.warn(TAG, 'pushLikedTracks error', err);
    }
  },

  /** Pull liked tracks from Firestore */
  pullLikedTracks: async (uid: string): Promise<SerializedTrack[]> => {
    try {
      const docs = await firestoreService.getSubcollectionDocs(
        uid,
        FIRESTORE_SUBCOLLECTIONS.LIKED_TRACKS,
      );
      return docs.map((d) => d.track as SerializedTrack).filter(Boolean);
    } catch (err) {
      logger.warn(TAG, 'pullLikedTracks error', err);
      return [];
    }
  },

  /** Push a single liked track (optimistic) */
  likeSingleTrack: async (uid: string, track: SerializedTrack): Promise<void> => {
    await firestoreService.setSubcollectionDoc(
      uid,
      FIRESTORE_SUBCOLLECTIONS.LIKED_TRACKS,
      track.id,
      { track, likedAt: Date.now() },
    );
  },

  /** Remove a liked track */
  unlikeSingleTrack: async (uid: string, trackId: string): Promise<void> => {
    await firestoreService.deleteSubcollectionDoc(
      uid,
      FIRESTORE_SUBCOLLECTIONS.LIKED_TRACKS,
      trackId,
    );
  },

  /** Push a history entry */
  pushHistoryEntry: async (uid: string, entry: {
    id: string;
    track: SerializedTrack;
    playedAt: number;
    playedDuration: number;
    completed: boolean;
    sourceContext?: string;
  }): Promise<void> => {
    await firestoreService.setSubcollectionDoc(
      uid,
      FIRESTORE_SUBCOLLECTIONS.HISTORY,
      entry.id,
      entry,
    );
  },

  /** Push full playlists state to Firestore users/{uid} with merge */
  pushPlaylists: async (uid: string, playlists: Playlist[]): Promise<void> => {
    try {
      await firestoreService.updateUser(uid, { playlists, lastSyncedAt: Date.now() });
    } catch (err) {
      logger.warn(TAG, 'pushPlaylists error', err);
    }
  },

  /** Pull full user sync data */
  pullUserData: async (uid: string): Promise<{ likedTracks: SerializedTrack[]; playlists: Playlist[] }> => {
    try {
      const profile = await firestoreService.getUser(uid);
      const likedTracks = await syncService.pullLikedTracks(uid);
      return {
        likedTracks,
        playlists: (profile as unknown as Record<string, unknown>)?.playlists as Playlist[] || [],
      };
    } catch (err) {
      logger.warn(TAG, 'pullUserData error', err);
      return { likedTracks: [], playlists: [] };
    }
  },
};
