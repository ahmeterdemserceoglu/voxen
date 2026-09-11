import type { Track, AlbumSummary } from './Track';

export type { AlbumSummary };

export interface Album {
  id: string;
  title: string;

  artistName: string;
  artistId?: string;

  year?: number;
  trackCount?: number;
  duration?: number;  // total seconds

  artworkUrl?: string;

  tracks: Track[];

  source: 'youtube';
}
