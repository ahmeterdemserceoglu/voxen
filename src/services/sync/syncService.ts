import { firestoreService } from '../firebase/firestoreService';
import { FIRESTORE_SUBCOLLECTIONS } from '../../constants/firestoreCollections';
import { logger } from '../../utils/logger';
import type { SerializedTrack, Playlist } from '../../models';

const TAG = 'SyncService';

export const syncService = {
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
