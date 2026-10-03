import type { Track } from '../models';

export function trackArtwork(track: Pick<Track, 'thumbnail' | 'thumbnails'>, large = false): string {
  const uri = large
    ? track.thumbnails?.large || track.thumbnail || track.thumbnails?.medium || track.thumbnails?.small || ''
    : track.thumbnail || track.thumbnails?.medium || track.thumbnails?.large || track.thumbnails?.small || '';
  if (!uri || !/^https?:\/\//i.test(uri)) return '';
  if (large && /(?:googleusercontent\.com|ggpht\.com)/i.test(uri)) {
    return uri.replace(/=w\d+(?:-h\d+)?/, '=w1200-h1200').replace(/=s\d+/, '=s1200');
  }
  return uri;
}
