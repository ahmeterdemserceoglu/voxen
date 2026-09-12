import { mergeLibrary, type LibrarySyncMeta } from '../services/sync/mergeLibrary';
import { tasteProfileService } from '../services/recommendations/tasteProfileService';
import { create } from 'zustand';
import { accountStorage as AsyncStorage, accountSession } from '../services/auth/accountStorage';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useSettingsStore } from './settingsStore';
import { useSocialStore } from './socialStore';
import { normalizePlaylist } from '../models/Playlist';
import { firestoreService } from '../services/firebase/firestoreService';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { Track, Playlist } from '../models';

export type { Track as TrackItem } from '../models';
export type { Playlist } from '../models';

export type RepeatMode = 'off' | 'all' | 'one';

export type SourceContext = {
  type: 'album' | 'playlist' | 'artist' | 'search' | 'home' | 'liked' | 'radio';
  id?: string;
};

let continuationRevision = 0;
const controlledByHost = () => {
  const room = useSocialStore.getState();
  return !!room.activeRoom && !!room.roomHostUid && room.roomHostUid !== accountSession.uid;
};

interface MusicState {
  currentTrack: Track | null;
  playbackRevision: number;
  seekRevision: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  queue: Track[];
  queueIndex: number;
  isFullPlayerOpen: boolean;
  isLoadingStream: boolean;
  isBuffering: boolean;
  seekToTrigger: number | null;
  streamError: string | null;
  shuffle: boolean;
  shuffleOrder: Track[] | null;
  repeatMode: RepeatMode;
  historyQueue: Track[];
  sourceContext?: SourceContext;
  favorites: Track[];
  syncMeta: LibrarySyncMeta;
  history: Track[];
  playlists: Playlist[];
  activeActionSong: Track | null;
  isActionSheetOpen: boolean;
  isAddToPlaylistOpen: boolean;
  addToPlaylistSong: Track | null;
  activePlaylistDetail: Playlist | null;

  playTrack: (track: Track, newQueue?: Track[], remote?: boolean) => Promise<void>;
  togglePlayPause: () => void;
  retryPlayback: () => void;
  stopPlayback: () => void;
  clearHistory: () => void;
  seekTo: (positionMs: number, remote?: boolean) => void;
  skipNext: (naturalEnd?: boolean) => void;
  skipPrevious: () => void;
  setPlaybackStatus: (status: Partial<MusicState>) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  queueUndo: { track: Track; index: number; expiresAt: number } | null;
  undoQueueRemoval: () => void;
  toggleShuffle: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setSourceContext: (ctx: SourceContext | undefined) => void;
  toggleFavorite: (track: Track) => void;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  createPlaylist: (name: string, description?: string) => Promise<string>;
  importPlaylist: (name: string, tracks: Track[], coverUrl?: string, description?: string) => Promise<Playlist>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  renamePlaylist: (playlistId: string, newName: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<boolean>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  openActionSheet: (track: Track) => void;
  closeActionSheet: () => void;
  openAddToPlaylist: (track?: Track) => void;
  closeAddToPlaylist: () => void;
  openPlaylistDetail: (playlist: Playlist) => void;
  closePlaylistDetail: () => void;
  loadStoredData: () => Promise<void>;
  saveSession: () => Promise<void>;
  restoreSession: () => Promise<void>;
  accountReady: boolean;
  syncWithCloud: (userId?: string) => Promise<void>;
  pushCloudData: () => Promise<void>;
}

function shuffledQueue(tracks: Track[], currentTrack: Track): Track[] {
  const upcoming = tracks.filter(track => track.id !== currentTrack.id);
  for (let i = upcoming.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
  }
  return [currentTrack, ...upcoming];
}

function firestoreSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useMusicStore = create<MusicState>((set, get) => ({
  currentTrack: null,
  playbackRevision: 0,
  seekRevision: 0,
  isPlaying: false,
  position: 0,
  duration: 0,
  queue: [],
  queueIndex: 0,
  isFullPlayerOpen: false,
  isLoadingStream: false,
  isBuffering: false,
  seekToTrigger: null,
  streamError: null,
  shuffle: false,
  shuffleOrder: null,
  repeatMode: 'off',
  historyQueue: [],
  sourceContext: undefined,
  queueUndo: null,
  undoQueueRemoval: () => {
    if (controlledByHost()) return;
    const undo = get().queueUndo;
    if (!undo || undo.expiresAt <= Date.now() || get().queue.some(track => track.id === undo.track.id)) { set({ queueUndo: null }); return; }
    const queue = [...get().queue]; queue.splice(Math.min(undo.index, queue.length), 0, undo.track);
    continuationRevision++;
    set({ queue, queueIndex: Math.max(0, queue.findIndex(track => track.id === get().currentTrack?.id)), queueUndo: null });
    void get().saveSession();
  },
  accountReady: false,
  favorites: [],
  syncMeta: { favorites: {}, deletedPlaylists: {} },
  history: [],
  playlists: [],
  activeActionSong: null,
  isActionSheetOpen: false,
  isAddToPlaylistOpen: false,
  addToPlaylistSong: null,
  activePlaylistDetail: null,

  saveSession: async () => {
    const { currentTrack, position, duration, queue, queueIndex, repeatMode, shuffle, shuffleOrder } = get();
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PLAYBACK_SESSION, JSON.stringify({
        track: currentTrack,
        position,
        duration,
        queue,
        queueIndex,
        repeatMode, shuffle, shuffleOrder,
      }));
    } catch (e) {
      console.warn('Failed to save playback session:', e);
    }
  },

  restoreSession: async () => {
    try {
      const sessionJson = await AsyncStorage.getItem(STORAGE_KEYS.PLAYBACK_SESSION);
      if (!sessionJson) return;
      const session = JSON.parse(sessionJson);
      const { position, duration, queueIndex } = session;
      const track = session.track?.id ? session.track as Track : null;
      const seen = new Set<string>();
      const queue: Track[] = (Array.isArray(session.queue) ? session.queue : track ? [track] : []).filter((item: Track) => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id); return true;
      });
      if (track && !queue.some(item => item.id === track.id)) queue.push(track);
      const modes = ['off', 'all', 'one'];
      const restoredMode = modes.includes(session.repeatMode) ? session.repeatMode as RepeatMode : 'off';
      if (track) {
        const restoredIndex = queue.findIndex((item: Track) => item.id === track.id);
        set({
          currentTrack: track,
          position: Number(position) || 0,
          duration: Number(duration) || (track.duration || 0) * 1000,
          queue,
          queueIndex: restoredIndex >= 0 ? restoredIndex : Math.max(0, Math.min(Number(queueIndex) || 0, queue.length - 1)),
          isPlaying: false,
          isLoadingStream: false,
          isBuffering: false,
          repeatMode: restoredMode,
          shuffle: !!session.shuffle,
          shuffleOrder: Array.isArray(session.shuffleOrder) ? session.shuffleOrder : null,
        });
      } else set({ currentTrack: null, queue, queueIndex: 0, position: 0, duration: 0, isPlaying: false,
        isLoadingStream: false, isBuffering: false, repeatMode: restoredMode, shuffle: false, shuffleOrder: null });
    } catch (e) {
      console.warn('Failed to restore playback session:', e);
    }
  },

  loadStoredData: async () => {
    await get().restoreSession();
    const epoch = accountSession.generation;
    try {
      const [favsJson, histJson, plJson, metaJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FAVORITES),
        AsyncStorage.getItem(STORAGE_KEYS.HISTORY),
        AsyncStorage.getItem(STORAGE_KEYS.PLAYLISTS),
        AsyncStorage.getItem(STORAGE_KEYS.LIBRARY_SYNC_META),
      ]);
      if (!accountSession.isCurrent(epoch)) return;
      if (metaJson) set({ syncMeta: JSON.parse(metaJson) });
      if (favsJson) set({ favorites: JSON.parse(favsJson) });
      if (histJson) set({ history: JSON.parse(histJson) });
      if (plJson) set({ playlists: JSON.parse(plJson).filter(Boolean).map(normalizePlaylist) });
    } catch (e) {
      console.warn('Failed to load stored music data:', e);
    }
  },

  syncWithCloud: async (userId?: string) => {
    const uid = userId || auth.currentUser?.uid;
    const epoch = accountSession.generation;
    if (!uid || uid !== accountSession.uid || uid !== auth.currentUser?.uid || !get().accountReady) return;
    const current = () => accountSession.isCurrent(epoch) && auth.currentUser?.uid === uid;
    try {
      const userDocRef = doc(db, 'users', uid);
      const snap = await getDoc(userDocRef);
      if (!current()) return;
      if (snap.exists()) {
        const cloudData = snap.data();
        const cloudFavs: Track[] = Array.isArray(cloudData.favorites) ? cloudData.favorites : [];
        const cloudPlaylists: Playlist[] = Array.isArray(cloudData.playlists) ? cloudData.playlists.filter(Boolean).map(normalizePlaylist) : [];
        const merged = mergeLibrary(get(), { favorites: cloudFavs, playlists: cloudPlaylists, syncMeta: cloudData.syncMeta });
        const { favorites: mergedFavs, playlists: mergedPls, syncMeta } = merged;
        set(merged);
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.LIBRARY_SYNC_META, JSON.stringify(syncMeta)),
          AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(mergedFavs)),
          AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(mergedPls)),
        ]);
        if (!current()) return;
        await firestoreService.updateUser(uid, firestoreSafe({ favorites: mergedFavs, playlists: mergedPls, syncMeta, lastSyncedAt: Date.now() }));
      } else {
        if (!current()) return;
        await firestoreService.updateUser(uid, firestoreSafe({ favorites: get().favorites, syncMeta: get().syncMeta, playlists: get().playlists, lastSyncedAt: Date.now() }));
      }
    } catch (err) {
      console.warn('Firebase Cloud sync error:', err);
    }
  },

  pushCloudData: async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || uid !== accountSession.uid || !get().accountReady) return;
    try {
      await firestoreService.updateUser(uid, firestoreSafe({ favorites: get().favorites, syncMeta: get().syncMeta, playlists: get().playlists, lastSyncedAt: Date.now() }));
    } catch (err) {
      console.warn('pushCloudData error:', err);
    }
  },

  playTrack: async (track, newQueue, remote = false) => {
    if (controlledByHost() && !remote) return;
    if (!useSettingsStore.getState().explicitContent && track.explicit) return;
    continuationRevision += 1;
    const seen = new Set<string>();
    const currentQ = (newQueue ? [...newQueue] : [...get().queue]).filter(t => {
      if (!t?.id || seen.has(t.id) || (!useSettingsStore.getState().explicitContent && t.explicit)) return false;
      seen.add(t.id); return true;
    });
    let newIndex = currentQ.findIndex((t) => t.id === track.id);
    if (newIndex === -1) {
      newIndex = currentQ.length;
      currentQ.push(track);
    }
    const historyQueue = useSettingsStore.getState().historyEnabled ? [track, ...get().historyQueue.filter((h) => h.id !== track.id)].slice(0, 200) : [];
    set({
      currentTrack: track,
      playbackRevision: get().playbackRevision + 1,
      queue: currentQ,
      queueIndex: newIndex,
      isLoadingStream: true,
      isBuffering: true,
      isPlaying: true,
      position: 0,
      duration: (track.duration || 0) * 1000,
      seekToTrigger: null,
      historyQueue,
      streamError: null,
    });
    get().saveSession().catch(() => {});
    if (!useSettingsStore.getState().historyEnabled) return;
    const updatedHistory = [track, ...get().history.filter((h) => h.id !== track.id)].slice(0, 30);
    set({ history: updatedHistory });
    AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updatedHistory)).catch(() => {});
  },

  togglePlayPause: () => {
    if (controlledByHost()) return;
    continuationRevision += 1;
    const { isPlaying, currentTrack } = get();
    if (!currentTrack) return;
    if (!isPlaying && get().streamError) {
      get().retryPlayback();
      return;
    }
    if (!isPlaying && get().duration > 0 && get().position >= get().duration - 100) get().seekTo(0);
    set({ isPlaying: !isPlaying, streamError: null });
    get().saveSession().catch(() => {});
  },

  retryPlayback: () => {
    if (controlledByHost() || !get().currentTrack) return;
    continuationRevision += 1;
    set({ playbackRevision: get().playbackRevision + 1, isPlaying: true, isLoadingStream: true,
      isBuffering: true, streamError: null, seekToTrigger: null });
  },

  stopPlayback: () => {
    continuationRevision += 1;
    set({ currentTrack: null, queue: [], queueIndex: 0, isPlaying: false, position: 0, duration: 0, seekToTrigger: null, isLoadingStream: false, isBuffering: false, streamError: null });
    get().saveSession().catch(() => {});
  },

  clearHistory: () => {
    set({ history: [], historyQueue: [] });
    void AsyncStorage.removeItem(STORAGE_KEYS.HISTORY);
  },

  seekTo: (positionMs, remote = false) => {
    if (controlledByHost() && !remote) return;
    continuationRevision += 1;
    if (!Number.isFinite(positionMs)) return;
    const target = Math.max(0, Math.min(positionMs, get().duration || positionMs));
    set({ position: target, seekToTrigger: target, seekRevision: get().seekRevision + 1 });
    get().saveSession().catch(() => {});
  },

  skipNext: (naturalEnd = false) => {
    if (controlledByHost()) {
      if (naturalEnd) set({ isPlaying: false, isBuffering: false, isLoadingStream: false });
      return;
    }
    const continuation = ++continuationRevision;
    const epoch = accountSession.generation;
    const { repeatMode } = get();
    const queue = get().queue.filter(t => useSettingsStore.getState().explicitContent || !t.explicit);
    const queueIndex = queue.findIndex(t => t.id === get().currentTrack?.id);
    if (naturalEnd && repeatMode === 'one') {
      get().seekTo(0);
      set({ isPlaying: true, isLoadingStream: false, isBuffering: false });
      return;
    }
    const nextIndex = repeatMode === 'all' && queue.length > 0 ? (queueIndex + 1) % queue.length : queueIndex + 1;
    const next = queue[nextIndex];
    if (next) {
      get().playTrack(next, queue);
      return;
    }
    set({ isPlaying: false, isLoadingStream: false, isBuffering: false, seekToTrigger: null, streamError: null });
    const source = get().currentTrack;
    if (naturalEnd && source && useSettingsStore.getState().autoplay) {
      const revision = get().playbackRevision;
      void (async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const { recommendationService } = await import('../services/recommendations/recommendationService');
          const related = await Promise.race([
            recommendationService.getRelatedTracks(source, new Set(queue.map(track => track.id))),
            new Promise<Track[]>(resolve => { timeout = setTimeout(() => resolve([]), 8000); }),
          ]);
          if (!accountSession.isCurrent(epoch) || continuation !== continuationRevision || get().playbackRevision !== revision || !useSettingsStore.getState().autoplay) return;
          if (related[0]) get().playTrack(related[0], [...queue, ...related]);
        } finally { clearTimeout(timeout); }
      })().catch(() => {});
    }
  },

  skipPrevious: () => {
    if (controlledByHost()) return;
    const { queue, queueIndex, position } = get();
    if (position > 3000) {
      get().seekTo(0);
      return;
    }
    if (queue.length === 0) return;
    const prevIndex = queueIndex > 0 ? queueIndex - 1 : (get().repeatMode === 'all' ? queue.length - 1 : 0);
    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      get().playTrack(prevTrack, queue);
      get().saveSession().catch(() => {});
    }
  },

  setPlaybackStatus: (status) => set(status),

  setQueue: (tracks, startIndex = 0) => {
    const track = tracks[startIndex] ?? tracks[0];
    if (!track) return;
    get().playTrack(track, tracks);
  },

  addToQueue: (track) => {
    if (controlledByHost()) return;
    const queue = [...get().queue];
    if (!queue.some((t) => t.id === track.id)) {
      queue.push(track);
      if (!useSettingsStore.getState().explicitContent && track.explicit) return;
      continuationRevision += 1;
      set({ queue });
      void get().saveSession();
    }
  },

  playNext: (track) => {
    if (controlledByHost() || (!useSettingsStore.getState().explicitContent && track.explicit)) return;
    continuationRevision += 1;
    const queue = [...get().queue];
    const { currentTrack } = get();
    if (track.id === currentTrack?.id) return;
    const filtered = queue.filter((t) => t.id !== track.id);
    const queueIndex = filtered.findIndex(t => t.id === currentTrack?.id);
    const insertAt = queueIndex + 1;
    filtered.splice(insertAt, 0, track);
    set({ queue: filtered, queueIndex: Math.max(0, queueIndex) });
    void get().saveSession();
  },

  removeFromQueue: (trackId) => {
    if (controlledByHost()) return;
    const { queue, queueIndex, currentTrack, isPlaying } = get();
    const targetIndex = queue.findIndex(t => t.id === trackId);
    if (targetIndex < 0) return;
    continuationRevision += 1;
    const updated = queue.filter(t => t.id !== trackId);
    set({ queueUndo: { track: queue[targetIndex], index: targetIndex, expiresAt: Date.now() + 8000 } });
    if (currentTrack?.id === trackId) {
      const nextIndex = Math.min(queueIndex, Math.max(0, updated.length - 1));
      const next = updated[nextIndex] || null;
      set({ queue: updated, queueIndex: nextIndex, currentTrack: next,
        playbackRevision: get().playbackRevision + 1, position: 0, duration: (next?.duration || 0) * 1000,
        isPlaying: !!next && isPlaying, isLoadingStream: !!next && isPlaying,
        isBuffering: !!next && isPlaying, streamError: null, seekToTrigger: null });
    } else {
      set({ queue: updated, queueIndex: Math.max(0, updated.findIndex(t => t.id === currentTrack?.id)) });
    }
    void get().saveSession();
  },

  moveQueueItem: (fromIndex, toIndex) => {
    if (controlledByHost() || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
    const queue = [...get().queue];
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;
    continuationRevision += 1;
    const [moved] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, moved);
    const { currentTrack } = get();
    set({ queue, queueIndex: Math.max(0, queue.findIndex(t => t.id === currentTrack?.id)) });
    void get().saveSession();
  },

  clearQueue: () => {
    if (controlledByHost()) return;
    continuationRevision += 1;
    const current = get().currentTrack;
    set({ queue: current ? [current] : [], queueIndex: 0 });
    void get().saveSession();
  },

  toggleShuffle: () => {
    const state = get();
    if (state.shuffle) {
      continuationRevision += 1;
      const rank = new Map((state.shuffleOrder || []).map((track, index) => [track.id, index]));
      const ordered = [...state.queue].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      set({ shuffle: false, shuffleOrder: null, queue: ordered, queueIndex: Math.max(0, ordered.findIndex(t => t.id === state.currentTrack?.id)) });
      void get().saveSession();
      return;
    }
    const current = state.currentTrack;
    if (!current) { set({ shuffle: true }); return; }
    const revision = ++continuationRevision;
    const queue = shuffledQueue(state.queue, current);
    set({ shuffle: true, shuffleOrder: state.queue, queue, queueIndex: 0 });
    void get().saveSession();
    const ids = new Set(queue.map(track => track.id));
    const fromLibrary = queue.every(track => state.favorites.some(item => item.id === track.id))
      || state.playlists.some(playlist => queue.every(track => playlist.tracks.some(item => item.id === track.id)));
    if (fromLibrary) return;
    void (async () => {
      const { recommendationService } = await import('../services/recommendations/recommendationService');
      const related = await recommendationService.getRelatedTracks(current, ids);
      if (continuationRevision !== revision || !get().shuffle || get().currentTrack?.id !== current.id) return;
      const added = related.filter(track => !ids.has(track.id)).slice(0, 20);
      const updated = shuffledQueue([...queue, ...added], current);
      set({ queue: updated, queueIndex: 0 });
      void get().saveSession();
    })().catch(() => {});
  },
  setRepeatMode: (mode) => { set({ repeatMode: mode }); void get().saveSession(); },
  setSourceContext: (ctx) => set({ sourceContext: ctx }),

  toggleFavorite: (track) => {
    const { favorites } = get();
    const exists = favorites.some((f) => f.id === track.id);
    const updated = exists ? favorites.filter((f) => f.id !== track.id) : [track, ...favorites];
    const syncMeta = { ...get().syncMeta, favorites: { ...get().syncMeta.favorites, [track.id]: { present: !exists, at: Math.max(Date.now(), (get().syncMeta.favorites[track.id]?.at || 0) + 1) } } };
    set({ favorites: updated, syncMeta });
    void AsyncStorage.setItem(STORAGE_KEYS.LIBRARY_SYNC_META, JSON.stringify(syncMeta));
    if (!exists) void tasteProfileService.record('LIKE', track.artist || track.artistName, undefined, track.id);
    AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated)).catch(() => {});
    get().pushCloudData().catch(() => {});
  },

  openFullPlayer: () => set({ isFullPlayerOpen: true }),
  closeFullPlayer: () => set({ isFullPlayerOpen: false }),

  createPlaylist: async (name, description) => {
    const epoch = accountSession.generation;
    const newPlaylist: Playlist = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: name.trim() || 'Yeni �alma Listesi',
      description: description?.trim(),
      visibility: 'private',
      collaborative: false,
      tracks: [],
      trackCount: 0,
      totalDuration: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newPlaylist, ...get().playlists];
    set({ playlists: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
    if (accountSession.isCurrent(epoch)) get().pushCloudData().catch(() => {});
    return newPlaylist.id;
  },

  importPlaylist: async (name, tracks, coverUrl, description) => {
    const epoch = accountSession.generation;
    const totalDuration = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const newPlaylist: Playlist = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: name.trim() || '��e Aktar�lan �alma Listesi',
      description: description?.trim(),
      visibility: 'private',
      collaborative: false,
      tracks,
      trackCount: tracks.length,
      totalDuration,
      coverUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newPlaylist, ...get().playlists];
    set({ playlists: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
    if (accountSession.isCurrent(epoch)) get().pushCloudData().catch(() => {});
    return newPlaylist;
  },

  deletePlaylist: async (playlistId) => {
    const epoch = accountSession.generation;
    const syncMeta = { ...get().syncMeta, deletedPlaylists: { ...get().syncMeta.deletedPlaylists, [playlistId]: Date.now() } };
    set({ syncMeta });
    await AsyncStorage.setItem(STORAGE_KEYS.LIBRARY_SYNC_META, JSON.stringify(syncMeta));
    if (!accountSession.isCurrent(epoch)) return;
    const updated = get().playlists.filter((p) => p.id !== playlistId);
    const activeDetail = get().activePlaylistDetail;
    set({
      playlists: updated,
      activePlaylistDetail: activeDetail?.id === playlistId ? null : activeDetail,
    });
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
    if (accountSession.isCurrent(epoch)) get().pushCloudData().catch(() => {});
  },

  renamePlaylist: async (playlistId, newName) => {
    const epoch = accountSession.generation;
    const updated = get().playlists.map((p) => p.id === playlistId ? { ...p, name: newName.trim(), updatedAt: Date.now() } : p);
    const activeDetail = get().activePlaylistDetail;
    set({
      playlists: updated,
      activePlaylistDetail: activeDetail?.id === playlistId ? { ...activeDetail, name: newName.trim(), updatedAt: Date.now() } : activeDetail,
    });
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
    if (accountSession.isCurrent(epoch)) get().pushCloudData().catch(() => {});
  },

  addTrackToPlaylist: async (playlistId, track) => {
    const epoch = accountSession.generation;
    let trackAdded = false;
    const updated = get().playlists.map((p) => {
      if (p.id === playlistId) {
        if (p.tracks.some((t) => t.id === track.id)) return p;
        trackAdded = true;
        return {
          ...p,
          tracks: [...p.tracks, track],
          trackCount: p.trackCount + 1,
          totalDuration: p.totalDuration + (track.duration ?? 0),
          coverUrl: p.coverUrl || track.thumbnails?.medium || track.thumbnail,
          updatedAt: Date.now(),
        };
      }
      return p;
    });
    if (trackAdded) {
      const activeDetail = get().activePlaylistDetail;
      set({
        playlists: updated,
        activePlaylistDetail: activeDetail?.id === playlistId ? updated.find((p) => p.id === playlistId) ?? null : activeDetail,
      });
      await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
      if (accountSession.isCurrent(epoch)) get().pushCloudData().catch(() => {});
    }
    return trackAdded;
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    const epoch = accountSession.generation;
    const updated = get().playlists.map((p) => {
      if (p.id === playlistId) {
        const removedTrack = p.tracks.find((t) => t.id === trackId);
        const remaining = p.tracks.filter((t) => t.id !== trackId);
        return {
          ...p,
          tracks: remaining,
          trackCount: Math.max(0, p.trackCount - 1),
          totalDuration: Math.max(0, p.totalDuration - (removedTrack?.duration ?? 0)),
          coverUrl: remaining[0]?.thumbnails?.medium || remaining[0]?.thumbnail || undefined,
          updatedAt: Date.now(),
        };
      }
      return p;
    });
    const activeDetail = get().activePlaylistDetail;
    set({
      playlists: updated,
      activePlaylistDetail: activeDetail?.id === playlistId ? updated.find((p) => p.id === playlistId) ?? null : activeDetail,
    });
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(updated));
    if (accountSession.isCurrent(epoch)) get().pushCloudData().catch(() => {});
  },

  openActionSheet: (track) => set({ activeActionSong: track, isActionSheetOpen: true }),
  closeActionSheet: () => set({ isActionSheetOpen: false }),

  openAddToPlaylist: (track) => {
    const targetTrack = track ?? get().activeActionSong ?? get().currentTrack;
    set({ isAddToPlaylistOpen: true, addToPlaylistSong: targetTrack, isActionSheetOpen: false });
  },
  closeAddToPlaylist: () => set({ isAddToPlaylistOpen: false, addToPlaylistSong: null }),

  openPlaylistDetail: (playlist) => set({ activePlaylistDetail: normalizePlaylist(playlist) }),
  closePlaylistDetail: () => set({ activePlaylistDetail: null }),
}));

