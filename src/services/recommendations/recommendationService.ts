import { logger } from '../../utils/logger';
import { tasteProfileService } from './tasteProfileService';
import { topKeys } from '../../models';
import type { Track } from '../../models';

const TAG = 'RecommendationService';

export function spreadArtists(tracks: Track[]): Track[] {
  // ponytail: Home sections are small; switch to artist buckets only if they grow substantially.
  const remaining = [...tracks];
  const result: Track[] = [];
  let previous = '';
  while (remaining.length) {
    const index = remaining.findIndex(track => (track.artist || track.artistName || '').trim().toLocaleLowerCase('tr-TR') !== previous);
    const [track] = remaining.splice(index < 0 ? 0 : index, 1);
    result.push(track);
    previous = (track.artist || track.artistName || '').trim().toLocaleLowerCase('tr-TR');
  }
  return result;
}

/** Diversify track list: max 2 tracks per artist, avoid seen IDs */
export function diversify(tracks: Track[], seenIds: Set<string>, maxPerArtist = 2): Track[] {
  const artistCount: Record<string, number> = {};
  const result: Track[] = [];
  for (const track of tracks) {
    if (!track?.id || seenIds.has(track.id)) continue;
    if (track.duration && (track.duration < 45 || track.duration > 900)) continue;
    if (/\b(podcast|reaction|interview|karaoke|playlist)\b/i.test(track.title)) continue;
    const artistKey = track.artist || track.artistName || 'Unknown';
    const count = artistCount[artistKey] || 0;
    if (count >= maxPerArtist) continue;
    artistCount[artistKey] = count + 1;
    seenIds.add(track.id);
    result.push(track);
  }
  return spreadArtists(result);
}

export const recommendationService = {
  /**
   * Build a discovery feed based on taste profile.
   * Fetches from YouTube service using top genres/artists.
   */
  getDiscoveryFeed: async (
    likedTracks: Track[],
    history: Track[],
    followedArtistNames: string[],
    preferredGenres: string[],
  ): Promise<Track[]> => {
    try {
      const profile = await tasteProfileService.get();
      const topArtists = topKeys(profile.artists, 5);
      const topGenres = topKeys(profile.genres, 3);

      const libraryArtists = [...likedTracks, ...history].map(track => track.artist || track.artistName || '');
      const artists = [...new Set([...followedArtistNames, ...topArtists, ...libraryArtists].filter(name => name && (profile.artists[name] ?? 0) >= 0))];
      const genres = [...new Set((preferredGenres.length ? preferredGenres : topGenres).filter(Boolean))];
      const queries = [...new Set([
        ...genres.slice(0, 3),
        ...artists.slice(0, 3),
      ])];
      if (queries.length === 0) queries.push('Türkçe Pop', 'Türkçe Alternatif');

      // Dynamic import to avoid circular deps with YouTubeService
      const { YouTubeService } = await import('../youtubeService');
      const seen = new Set(
        [...likedTracks, ...history].map((t) => t.id),
      );
      for (const [id, score] of Object.entries(profile.tracks)) if (score < 0) seen.add(id);

      const results = await Promise.allSettled(
        queries.map((q) => YouTubeService.search(q)),
      );

      const allTracks: Track[] = [];
      // Interleave searches so the first genre does not consume the whole feed.
      for (let i = 0; i < 20; i++) {
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value[i]) allTracks.push(result.value[i]);
        }
      }

      return diversify(allTracks, seen).slice(0, 30);
    } catch (err) {
      logger.warn(TAG, 'getDiscoveryFeed error', err);
      return [];
    }
  },

  /** Get related tracks for autoplay / radio using native YTM Automix radio */
  getRelatedTracks: async (track: Track, seenIds: Set<string>): Promise<Track[]> => {
    try {
      const { YouTubeService } = await import('../youtubeService');
      
      // 1. Try native YouTube Music Automix Radio (RDAMVM + videoId)
      if (track.videoId || track.id) {
        const automixTracks = await YouTubeService.getAutomix(track.videoId || track.id);
        const filteredAutomix = diversify(automixTracks, seenIds);
        if (filteredAutomix.length > 0) {
          return filteredAutomix.slice(0, 20);
        }
      }

      // 2. Fallback to artist mix search
      const artist = track.artistName || track.artist || track.title;
      const queries = [
        `${artist} benzer şarkılar`,
        `${artist} mix`,
      ];
      const results = await Promise.allSettled(queries.map((q) => YouTubeService.search(q)));
      const all: Track[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value);
      }
      return diversify(all, seenIds).slice(0, 20);
    } catch (err) {
      logger.warn(TAG, 'getRelatedTracks error', err);
      return [];
    }
  },
};
