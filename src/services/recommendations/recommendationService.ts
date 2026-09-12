import { recommendationFeedback } from './recommendationFeedback';
import { useSettingsStore } from '../../store/settingsStore';
import type { HomeSection } from '../youtubeService';
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
      const feedback = await recommendationFeedback.load();
      const variety = useSettingsStore.getState().discoveryVariety;
      const topArtists = topKeys(profile.artists, 5);
      const topGenres = topKeys(profile.genres, 3);

      const historyArtists = history.filter(track => (profile.tracks[track.id] ?? 0) >= 0).map(track => track.artist || track.artistName || '');
      const likedArtists = likedTracks.map(track => track.artist || track.artistName || '');
      const artists = [...new Set([...topArtists.filter(name => historyArtists.includes(name)), ...historyArtists, ...topArtists, ...likedArtists, ...followedArtistNames].filter(name => name && (profile.artists[name] ?? 0) >= 0))];
      const genres = [...new Set((preferredGenres.length ? preferredGenres : topGenres).filter(Boolean))];
      const queries = [...new Set([
        ...genres.slice(0, 3),
        ...artists.slice(0, variety === 'adventurous' ? 1 : 3).map(name => variety === 'familiar' ? name : `${name} benzer şarkılar`),
        ...(variety === 'adventurous' ? genres.slice(0, 3).map(genre => `${genre} yeni çıkan alternatif keşif`) : []),
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

      return diversify(allTracks.filter(track => recommendationFeedback.allowed(track, feedback)), seen, variety === 'familiar' ? 3 : 2).slice(0, 30);
    } catch (err) {
      logger.warn(TAG, 'getDiscoveryFeed error', err);
      return [];
    }
  },

  /** Personal shelves use song radios rather than the anonymous global home feed. */
  getPersonalizedSections: async (likedTracks: Track[], history: Track[]): Promise<HomeSection[]> => {
    const profile = await tasteProfileService.get();
    const feedback = await recommendationFeedback.load();
    const candidates = [...history].sort((a, b) => (profile.tracks[b.id] || 0) - (profile.tracks[a.id] || 0));
    const artists = new Set<string>();
    const seeds = [...candidates, ...likedTracks].filter(track => {
      const artist = track.artist || track.artistName || '';
      if (!artist || artists.has(artist) || (profile.tracks[track.id] || 0) < 0 || !recommendationFeedback.allowed(track, feedback)) return false;
      artists.add(artist); return true;
    }).slice(0, 2);
    const seen = new Set([...likedTracks, ...history].map(track => track.id));
    const results = await Promise.allSettled(seeds.map(track => recommendationService.getRelatedTracks(track, new Set(seen))));
    return results.flatMap((result, index) => {
      if (result.status !== 'fulfilled') return [];
      const items = result.value.filter(track => !seen.has(track.id)); items.forEach(track => seen.add(track.id));
      return items.length ? [{ title: `${seeds[index].artist || seeds[index].artistName} dinlediğin için`, items }] : [];
    });
  },

  /** Get related tracks for autoplay / radio using native YTM Automix radio */
  getRelatedTracks: async (track: Track, seenIds: Set<string>): Promise<Track[]> => {
    try {
      const { YouTubeService } = await import('../youtubeService');
      
      const feedback = await recommendationFeedback.load();
      const allowed = (tracks: Track[]) => tracks.filter(track => recommendationFeedback.allowed(track, feedback));
      // 1. Try native YouTube Music Automix Radio (RDAMVM + videoId)
      if (track.videoId || track.id) {
        const automixTracks = await YouTubeService.getAutomix(track.videoId || track.id);
        const filteredAutomix = diversify(allowed(automixTracks), seenIds);
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
      return diversify(allowed(all), seenIds).slice(0, 20);
    } catch (err) {
      logger.warn(TAG, 'getRelatedTracks error', err);
      return [];
    }
  },
};
