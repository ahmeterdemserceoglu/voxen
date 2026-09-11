export interface ArtistSummary {
  id?: string;
  name: string;
}

export interface AlbumSummary {
  id?: string;
  title: string;
  year?: number;
  artworkUrl?: string;
  artistName?: string;
}

export interface TrackThumbnails {
  small?: string;   // ~120px
  medium?: string;  // ~300px
  large?: string;   // ~500px+
}

export interface Track {
  id: string;          // same as videoId for YouTube tracks
  videoId?: string;

  title: string;

  artists?: ArtistSummary[];
  artistName?: string;  // display string: "Artist1, Artist2"
  artist: string;       // primary & legacy compatibility field

  album?: AlbumSummary | string;

  duration?: number;           // seconds
  durationFormatted?: string;  // "3:45"

  thumbnails?: TrackThumbnails;
  thumbnail: string;           // primary & legacy compatibility field

  playCount?: string;          // e.g. "144 Mn kez dinlendi"

  explicit?: boolean;

  source?: 'youtube';
  streamUrl?: string;
}

/** Legacy type compatibility alias */
export type TrackItem = Track;

/** Serialized form stored in Firestore / AsyncStorage */
export type SerializedTrack = Track;

/** Convert any track or legacy track item to normalized Track */
export function normalizeTrackItem(item: {
  id: string;
  title: string;
  artist?: string;
  artistName?: string;
  artists?: ArtistSummary[];
  album?: string | AlbumSummary;
  thumbnail?: string;
  thumbnails?: TrackThumbnails;
  duration?: number;
  durationFormatted?: string;
  streamUrl?: string;
  videoId?: string;
  playCount?: string;
}): Track {
  const artist = item.artist || item.artistName || 'Bilinmeyen Sanatçı';
  const thumbUrl = item.thumbnail || item.thumbnails?.large || item.thumbnails?.medium || '';
  return {
    id: item.id,
    videoId: item.videoId || item.id,
    title: item.title,
    artist,
    artistName: item.artistName || artist,
    artists: item.artists || [{ name: artist }],
    album: typeof item.album === 'string' ? { title: item.album } : item.album,
    duration: item.duration,
    durationFormatted: item.durationFormatted,
    playCount: item.playCount,
    thumbnail: thumbUrl,
    thumbnails: item.thumbnails || {
      small: thumbUrl,
      medium: thumbUrl,
      large: thumbUrl.replace(/=w\d+-h\d+/, '=w500-h500'),
    },
    explicit: false,
    source: 'youtube',
    streamUrl: item.streamUrl,
  };
}
