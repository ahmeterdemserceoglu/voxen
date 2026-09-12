import { recommendationFeedback } from './recommendationFeedback';
import { useSettingsStore } from '../../store/settingsStore';
import { accountStorage as AsyncStorage, accountSession } from '../auth/accountStorage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { logger } from '../../utils/logger';
import { diversify } from './recommendationService';
import { tasteProfileService } from './tasteProfileService';
import { topKeys } from '../../models';
import type { Track } from '../../models';

const TAG = 'MixGenerator';

const MIX_GENRE_DEFAULTS = ['Türkçe Pop', 'Türkçe Rap', 'Alternatif'];

export interface DailyMix {
  id: string;
  label: string;
  genre: string;
  coverUrl?: string;
  tracks: Track[];
  generatedAt: number;
  description?: string;
  mood?: string;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function distributeMixTracks(sources: Track[][], seen = new Set<string>(), limit = 18): Track[][] {
  const lists = sources.map(() => [] as Track[]);
  const counts = sources.map(() => new Map<string, number>());
  const maximum = Math.max(0, ...sources.map(items => items.length));
  for (let index = 0; index < maximum; index++) for (let offset = 0; offset < sources.length; offset++) {
    const i = (index + offset) % sources.length;
    const track = sources[i][index];
    if (!track || lists[i].length >= limit || seen.has(track.id)) continue;
    const artist = (track.artist || track.artistName || '').trim().toLocaleLowerCase('tr-TR');
    if ((counts[i].get(artist) || 0) >= 2) continue;
    if (!diversify([track], seen).length) continue;
    counts[i].set(artist, (counts[i].get(artist) || 0) + 1); lists[i].push(track);
  }
  return lists;
}

export const mixGenerator = {
  getDailyMixes: async (
    preferredGenres: string[] = [],
    followedArtistNames: string[] = [],
    favoriteTracks: Track[] = [],
    forceRefresh = false,
  ): Promise<DailyMix[]> => {
    const epoch = accountSession.generation;
    const feedback = await recommendationFeedback.load();
    const profile = await tasteProfileService.get();
    const tasteKey = JSON.stringify([
      feedback.revision, profile.updatedAt, useSettingsStore.getState().discoveryVariety,
      preferredGenres.slice(0, 5),
      followedArtistNames.slice(0, 5),
      favoriteTracks.slice(0, 10).map(track => track.id),
    ]);
    const cacheKey = `${STORAGE_KEYS.DAILY_MIX_CACHE}_${todayKey()}_${tasteKey}`;

    // Check today's cache if not forcing refresh
    if (!forceRefresh) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (!accountSession.isCurrent(epoch)) return [];
        if (cached) {
          const mixes: DailyMix[] = JSON.parse(cached);
          if (mixes.length > 0) return mixes;
        }
      } catch {}
    }

    // Generate
    try {
      const topGenres = topKeys(profile.genres, 4);
      const topArtists = topKeys(profile.artists, 4);
      const favoriteArtists = favoriteTracks.map(track => track.artist || track.artistName || '').filter(Boolean);
      const genres = [...new Set([...preferredGenres, ...topGenres, ...MIX_GENRE_DEFAULTS].filter(Boolean))];
      const artists = [...new Set([...topArtists, ...followedArtistNames, ...favoriteArtists].filter(Boolean))];
      const hour = new Date().getHours();
      const dayMood = hour < 12 ? { label: 'Sabah Akışı', query: 'sabah enerjisi fresh pop', mood: 'Enerjik' }
        : hour < 18 ? { label: 'Gün Ortası', query: 'günün hitleri pop rap', mood: 'Canlı' }
        : hour < 23 ? { label: 'Akşam Modu', query: 'akşam şarkıları chill pop rap', mood: 'Akış' }
        : { label: 'Gece Modu', query: 'gece şarkıları chill rnb alternatif', mood: 'Gece' };
      const primaryGenre = genres[0] || 'Türkçe Pop';
      const secondaryGenre = genres[1] || 'Alternatif';
      const primaryArtist = artists[0];
      const secondaryArtist = artists[1];
      const genreSources = [
        { label: 'Senin Rotan', genre: primaryGenre, query: `${primaryGenre} hit mix`, mood: 'Sana özel', description: `${primaryGenre} ağırlıklı, sevdiğin çizgide bir akış.` },
        { label: 'Favori Sahneler', genre: primaryArtist || secondaryGenre, query: primaryArtist ? `${primaryArtist} benzer şarkılar mix` : `${secondaryGenre} sevilen şarkılar`, mood: 'Tanıdık', description: primaryArtist ? `${primaryArtist} ve yakınındaki seslerden.` : 'Sık döndüğün tınılara yakın parçalar.' },
        { label: 'Yeni Sesler', genre: secondaryGenre, query: `${secondaryGenre} yeni çıkanlar keşfet`, mood: 'Keşif', description: 'Alıştığın soundun biraz dışına çıkan yeni öneriler.' },
        { label: dayMood.label, genre: dayMood.mood, query: dayMood.query, mood: dayMood.mood, description: 'Saatine ve günün ritmine uygun seçildi.' },
        { label: 'Gizli Hazineler', genre: secondaryArtist || primaryGenre, query: secondaryArtist ? `${secondaryArtist} underrated benzer şarkılar` : `${primaryGenre} alternatif keşif underrated`, mood: 'Derin keşif', description: 'Daha az bilinen ama profiline uyan parçalar.' },
      ];

      const { YouTubeService } = await import('../youtubeService');

      const mixResults = await Promise.allSettled(
        genreSources.map((src) => YouTubeService.search(src.query)),
      );

      const uniqueTracks = distributeMixTracks(mixResults.map(result => result.status === 'fulfilled' ? result.value.filter(track => recommendationFeedback.allowed(track, feedback)) : []));
      const mixes: DailyMix[] = genreSources.map((src, i) => {
        const tracks = uniqueTracks[i];
        const coverUrl = tracks[0]?.thumbnails?.large || tracks[0]?.thumbnail || '';
        return {
          id: `mix_${i + 1}_${todayKey()}`,
          label: src.label,
          genre: src.genre,
          coverUrl,
          tracks,
          generatedAt: Date.now(),
          description: src.description,
          mood: src.mood,
        };
      }).filter((m) => m.tracks.length >= 4);

      if (!accountSession.isCurrent(epoch)) return [];
      await AsyncStorage.setItem(cacheKey, JSON.stringify(mixes));
      return mixes;
    } catch (err) {
      logger.warn(TAG, 'getDailyMixes error', err);
      return [];
    }
  },
};
