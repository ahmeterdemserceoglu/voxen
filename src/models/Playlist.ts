import type { SerializedTrack } from './Track';
import { Timestamp } from 'firebase/firestore';

export type PlaylistVisibility = 'public' | 'private' | 'unlisted';
export type PlaylistRole = 'owner' | 'editor' | 'viewer';

/** Local playlist model (AsyncStorage + Zustand) */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  visibility: PlaylistVisibility;
  collaborative: boolean;
  ownerId?: string;

  tracks: SerializedTrack[];
  trackCount: number;
  totalDuration: number;  // seconds

  coverUrl?: string;  // custom cover; falls back to track artwork collage

  createdAt: number;  // epoch ms
  updatedAt: number;
}

/** Firestore playlist document (without subcollection tracks) */
export interface PlaylistDocument {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  visibility: PlaylistVisibility;
  collaborative: boolean;
  trackCount: number;
  totalDuration: number;
  coverUrl?: string;
  createdAt: Timestamp | number;
  updatedAt: Timestamp | number;
}

/** Firestore playlists/{id}/tracks/{entryId} */
export interface PlaylistTrackEntry {
  track: SerializedTrack;
  order: number;
  addedBy: string;  // uid
  addedAt: Timestamp | number;
}

/** Firestore playlists/{id}/members/{uid} */
export interface PlaylistMember {
  role: PlaylistRole;
  joinedAt: Timestamp | number;
}

/** Accept the legacy Firestore `title` representation at the shared UI boundary. */
export function normalizePlaylist(value: Playlist | Record<string, any>): Playlist {
  const tracks = Array.isArray(value.tracks) ? value.tracks.filter(track => track && typeof track.id === 'string') : [];
  return {
    ...value,
    id: value.id,
    name: typeof value.name === 'string' ? value.name : 'title' in value && typeof value.title === 'string' ? value.title : 'Çalma Listesi',
    visibility: value.visibility === 'public' || value.visibility === 'unlisted' ? value.visibility : 'private',
    collaborative: value.collaborative === true,
    tracks,
    trackCount: tracks.length,
    totalDuration: tracks.reduce((sum, track) => sum + (Number.isFinite(track.duration) ? track.duration : 0), 0),
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
}
