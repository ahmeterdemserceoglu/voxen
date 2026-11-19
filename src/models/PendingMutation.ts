import type { Playlist } from './Playlist';
import type { Track } from './Track';

﻿export type MutationType =
  | 'LIKE'
  | 'UNLIKE'
  | 'PLAYLIST_ADD'
  | 'PLAYLIST_REMOVE'
  | 'PLAYLIST_CREATE'
  | 'PLAYLIST_DELETE'
  | 'PLAYLIST_RENAME'
  | 'PLAYLIST_REORDER'
  | 'PLAYLIST_UPDATE'
  | 'LIBRARY_SYNC'
  | 'FOLLOW_ARTIST'
  | 'UNFOLLOW_ARTIST'
  | 'FOLLOW_USER'
  | 'UNFOLLOW_USER'
  | 'HISTORY_ADD';

export interface PendingLibrarySnapshot {
  favorites: Track[];
  playlists: Playlist[];
  syncMeta: {
    favorites: Record<string, { present: boolean; at: number }>;
    deletedPlaylists: Record<string, number>;
  };
}

export interface PendingMutation {
  id: string;           // uuid v4
  type: MutationType;
  payload: unknown;
  createdAt: number;    // epoch ms
  retryCount: number;
  lastError?: string;
  nextAttemptAt?: number;
}
