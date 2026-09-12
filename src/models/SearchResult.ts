import type { Track } from './Track';
import type { Artist } from './Artist';
import type { AlbumSummary } from './Album';

export type SearchEntityType = 'track' | 'artist' | 'album';

export interface SearchEntity {
  type: SearchEntityType;
  data: Track | Artist | AlbumSummary;
}

export interface SearchResult {
  query: string;
  topResult?: SearchEntity;
  songs: Track[];
  artists: Artist[];
  albums: AlbumSummary[];
}
