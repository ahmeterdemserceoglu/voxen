import { create } from 'zustand';
import { useMusicStore } from './musicStore';
import { accountStorage as AsyncStorage, accountSession } from '../services/auth/accountStorage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { logger } from '../utils/logger';
import type { Track, HistoryEntry, SerializedArtist } from '../models';

const TAG = 'LibraryStore';

interface LibraryState {
  likedTracks: Track[];
  likedIds: Set<string>;  // fast O(1) lookup
  history: HistoryEntry[];
  followedArtists: SerializedArtist[];
  recentSearches: string[];
  isLoading: boolean;

  // Actions
  loadStoredData: () => Promise<void>;

  likeSong: (track: Track) => void;
  unlikeSong: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;

  addHistoryEntry: (entry: HistoryEntry) => void;
  removeHistoryEntry: (entryId: string) => void;
  clearHistory: () => void;

  followArtist: (artist: SerializedArtist) => void;
  unfollowArtist: (artistId: string) => void;
  isFollowingArtist: (artistId: string) => boolean;

  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;

  setLikedTracks: (tracks: Track[]) => void;
}

const persist = async (key: string, data: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    logger.warn(TAG, 'Persist error', err);
  }
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  likedTracks: [],
  likedIds: new Set(),
  history: [],
  followedArtists: [],
  recentSearches: [],
  isLoading: false,

  loadStoredData: async () => {
    const epoch = accountSession.generation;
    set({ isLoading: true });
    try {
      const [likedJson, histJson, artistsJson, searchesJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FAVORITES),
        AsyncStorage.getItem(STORAGE_KEYS.HISTORY),
        AsyncStorage.getItem(STORAGE_KEYS.FOLLOWED_ARTISTS),
        AsyncStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES),
      ]);
      if (!accountSession.isCurrent(epoch)) return;
      const likedTracks: Track[] = likedJson ? JSON.parse(likedJson) : [];
      set({
        likedTracks,
        likedIds: new Set(likedTracks.map((t) => t.id)),
        history: histJson ? JSON.parse(histJson) : [],
        followedArtists: artistsJson ? JSON.parse(artistsJson) : [],
        recentSearches: searchesJson ? JSON.parse(searchesJson) : [],
        isLoading: false,
      });
    } catch (err) {
      if (!accountSession.isCurrent(epoch)) return;
      logger.warn(TAG, 'loadStoredData error', err);
      set({ isLoading: false });
    }
  },

  likeSong: (track) => {
    const { likedTracks, likedIds } = get();
    if (likedIds.has(track.id)) return;
    const updated = [track, ...likedTracks];
    const updatedIds = new Set(likedIds);
    updatedIds.add(track.id);
    set({ likedTracks: updated, likedIds: updatedIds });
    persist(STORAGE_KEYS.FAVORITES, updated);
  },

  unlikeSong: (trackId) => {
    const { likedTracks, likedIds } = get();
    const updated = likedTracks.filter((t) => t.id !== trackId);
    const updatedIds = new Set(likedIds);
    updatedIds.delete(trackId);
    set({ likedTracks: updated, likedIds: updatedIds });
    persist(STORAGE_KEYS.FAVORITES, updated);
  },

  isLiked: (trackId) => get().likedIds.has(trackId),

  addHistoryEntry: (entry) => {
    const updated = [entry, ...get().history.filter((h) => h.id !== entry.id)].slice(0, 500);
    set({ history: updated });
    persist(STORAGE_KEYS.HISTORY, updated);
  },

  removeHistoryEntry: (entryId) => {
    const updated = get().history.filter((h) => h.id !== entryId);
    set({ history: updated });
    persist(STORAGE_KEYS.HISTORY, updated);
  },

  clearHistory: () => {
    set({ history: [] });
    useMusicStore.getState().clearHistory();
  },

  followArtist: (artist) => {
    const { followedArtists } = get();
    if (followedArtists.some((a) => a.id === artist.id)) return;
    const updated = [artist, ...followedArtists];
    set({ followedArtists: updated });
    persist(STORAGE_KEYS.FOLLOWED_ARTISTS, updated);
  },

  unfollowArtist: (artistId) => {
    const updated = get().followedArtists.filter((a) => a.id !== artistId);
    set({ followedArtists: updated });
    persist(STORAGE_KEYS.FOLLOWED_ARTISTS, updated);
  },

  isFollowingArtist: (artistId) =>
    get().followedArtists.some((a) => a.id === artistId),

  addRecentSearch: (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...get().recentSearches.filter((s) => s !== trimmed)].slice(0, 20);
    set({ recentSearches: updated });
    persist(STORAGE_KEYS.RECENT_SEARCHES, updated);
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
    AsyncStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES).catch(() => {});
  },

  setLikedTracks: (tracks) => {
    set({ likedTracks: tracks, likedIds: new Set(tracks.map((t) => t.id)) });
  },
}));
