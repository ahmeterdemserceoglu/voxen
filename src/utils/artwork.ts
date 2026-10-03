import type { Track } from '../models';

export function trackArtwork(track: Pick<Track, 'thumbnail' | 'thumbnails'>, large = false): string {
  const uri = large
    ? track.thumbnails?.large || track.thumbnail || track.thumbnails?.medium || track.thumbnails?.small || ''
    : track.thumbnail || track.thumbnails?.medium || track.thumbnails?.large || track.thumbnails?.small || '';
  if (!uri || !/^https?:\/\//i.test(uri)) return '';

  if (/(?:googleusercontent\.com|ggpht\.com)/i.test(uri)) {
    if (large) {
      return uri
        .replace(/=w\d+(?:-h\d+)?(?:-[^?]*)?/, '=w1200-h1200-l90-rj')
        .replace(/=s\d+(?:-[^?]*)?/, '=s1200-l90-rj');
    }
    // Upgrade tiny low-res previews to crisp 544x544 for sharp rendering on Desktop / Retina displays
    return uri
      .replace(/=w(?:60|120)(?:-h(?:60|120))?(?:-[^?]*)?/, '=w544-h544-l90-rj')
      .replace(/=s(?:60|120)(?:-[^?]*)?/, '=s544-l90-rj');
  }

  if (/i\.ytimg\.com/i.test(uri)) {
    if (large) {
      // For large view, prefer hqdefault or sddefault
      return uri.replace(/\/(?:default|mqdefault)\.jpg/i, '/hqdefault.jpg');
    }
    return uri.replace(/\/default\.jpg/i, '/mqdefault.jpg');
  }

  return uri;
}
