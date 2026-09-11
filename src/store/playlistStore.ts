import { create } from 'zustand';
import { accountStorage as AsyncStorage, accountSession } from '../services/auth/accountStorage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { logger } from '../utils/logger';
import type { Playlist, Track } from '../models';

const TAG = 'PlaylistStore';

function uuid(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const persist = async (playlists: Playlist[]) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
  } catch (err) {
    logger.warn(TAG, 'Persist error', err);
  }
};

interface PlaylistState {
  playlists: Playlist[];
  isLoading: boolean;

  // Modal state
  activePlaylistDetail: Playlist | null;
  isAddToPlaylistOpen: boolean;
  addToPlaylistSong: Track | null;

  loadStoredData: () => Promise<void>;

  createPlaylist: (name: string, description?: string) => Promise<string>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, newName: string) => Promise<void>;
  updatePlaylistDescription: (id: string, description: string) => Promise<void>;
  setPlaylistVisibility: (id: string, visibility: Playlist['visibility']) => Promise<void>;

  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<boolean>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  reorderTracks: (playlistId: string, fromIndex: number, toIndex: number) => Promise<void>;

  openPlaylistDetail: (playlist: Playlist) => void;
  closePlaylistDetail: () => void;
  openAddToPlaylist: (track?: Track) => void;
  closeAddToPlaylist: () => void;

  setPlaylists: (playlists: Playlist[]) => void;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  isLoading: false,
  activePlaylistDetail: null,
  isAddToPlaylistOpen: false,
  addToPlaylistSong: null,

  loadStoredData: async () => {
    const epoch = accountSession.generation;
    set({ isLoading: true });
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      if (!accountSession.isCurrent(epoch)) return;
      set({ playlists: json ? JSON.parse(json) : [], isLoading: false });
    } catch (err) {
      if (!accountSession.isCurrent(epoch)) return;
      logger.warn(TAG, 'loadStoredData error', err);
      set({ isLoading: false });
    }
  },

  createPlaylist: async (name, description) => {
    const id = uuid();
    const now = Date.now();
    const playlist: Playlist = {
      id,
      name: name.trim(),
      description,
      visibility: 'private',
      collaborative: false,
      tracks: [],
      trackCount: 0,
      totalDuration: 0,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [playlist, ...get().playlists];
    set({ playlists: updated });
    await persist(updated);
    return id;
  },

  deletePlaylist: async (id) => {
    const updated = get().playlists.filter((p) => p.id !== id);
    set({ playlists: updated });
    await persist(updated);
  },

  renamePlaylist: async (id, newName) => {
    const updated = get().playlists.map((p) =>
      p.id === id ? { ...p, name: newName.trim(), updatedAt: Date.now() } : p,
    );
    set({ playlists: updated });
    await persist(updated);
  },

  updatePlaylistDescription: async (id, description) => {
    const updated = get().playlists.map((p) =>
      p.id === id ? { ...p, description, updatedAt: Date.now() } : p,
    );
    set({ playlists: updated });
    await persist(updated);
  },

  setPlaylistVisibility: async (id, visibility) => {
    const updated = get().playlists.map((p) =>
      p.id === id ? { ...p, visibility, updatedAt: Date.now() } : p,
    );
    set({ playlists: updated });
    await persist(updated);
  },

  addTrackToPlaylist: async (playlistId, track) => {
    const playlists = get().playlists;
    const idx = playlists.findIndex((p) => p.id === playlistId);
    if (idx === -1) return false;
    const playlist = playlists[idx];
    if (playlist.tracks.some((t) => t.id === track.id)) return false;
    const updatedPlaylist: Playlist = {
      ...playlist,
      tracks: [...playlist.tracks, track],
      trackCount: playlist.trackCount + 1,
      totalDuration: playlist.totalDuration + (track.duration ?? 0),
      updatedAt: Date.now(),
    };
    const updated = [...playlists];
    updated[idx] = updatedPlaylist;
    set({ playlists: updated });
    await persist(updated);
    return true;
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    const playlists = get().playlists;
    const idx = playlists.findIndex((p) => p.id === playlistId);
    if (idx === -1) return;
    const playlist = playlists[idx];
    const removedTrack = playlist.tracks.find((t) => t.id === trackId);
    const updatedPlaylist: Playlist = {
      ...playlist,
      tracks: playlist.tracks.filter((t) => t.id !== trackId),
      trackCount: Math.max(0, playlist.trackCount - 1),
      totalDuration: Math.max(0, playlist.totalDuration - (removedTrack?.duration ?? 0)),
      updatedAt: Date.now(),
    };
    const updated = [...playlists];
    updated[idx] = updatedPlaylist;
    set({ playlists: updated });
    await persist(updated);
  },

  reorderTracks: async (playlistId, fromIndex, toIndex) => {
    const playlists = get().playlists;
    const idx = playlists.findIndex((p) => p.id === playlistId);
    if (idx === -1) return;
    const tracks = [...playlists[idx].tracks];
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    const updated = [...playlists];
    updated[idx] = { ...playlists[idx], tracks, updatedAt: Date.now() };
    set({ playlists: updated });
    await persist(updated);
  },

  openPlaylistDetail: (playlist) => set({ activePlaylistDetail: playlist }),
  closePlaylistDetail: () => set({ activePlaylistDetail: null }),
  openAddToPlaylist: (track) => set({ isAddToPlaylistOpen: true, addToPlaylistSong: track ?? null }),
  closeAddToPlaylist: () => set({ isAddToPlaylistOpen: false, addToPlaylistSong: null }),

  setPlaylists: (playlists) => set({ playlists }),
}));
