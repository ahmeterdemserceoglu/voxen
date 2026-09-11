import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { logger } from '../../utils/logger';
import { networkFetch } from '../network/networkService';
import { YouTubeService } from '../youtubeService';

const TAG = 'LyricsService';

export interface LyricsLine {
  time?: number;  // seconds, undefined for plain lyrics
  text: string;
}

export interface Lyrics {
  trackId: string;
  lines: LyricsLine[];
  synced: boolean;  // true if timing data available
  source: string;
}

/** Parse LRC format into LyricsLine[] */
export function parseLRC(lrc: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const line of lrc.split('\n')) {
    const match = line.match(/^\[(\d+):(\d+\.?\d*)\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) lines.push({ time: minutes * 60 + seconds, text });
    } else if (line.trim() && !line.startsWith('[')) {
      lines.push({ text: line.trim() });
    }
  }
  return lines;
}

/** Clean video metadata, parenthetical tags, and artist prefixes from song titles */
export function cleanTitle(rawTitle: string, artistName?: string): string {
  let title = rawTitle
    .replace(/\s*[\(\[](?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|audio|video|klip|clip\s*officiel|visualizer|hd|4k|remastered|lyrics)[\)\]]/gi, '')
    .replace(/\s*[\(\[](?:feat|ft)\.?\s+[^\)\]]+[\)\]]/gi, '')
    .trim();

  // If title has "Artist - Track", check if artist matches or strip the artist prefix
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length === 2) {
      if (!artistName || parts[0].toLowerCase().trim() === artistName.toLowerCase().trim()) {
        title = parts[1].trim();
      }
    }
  }
  return title;
}

/** Clean artist name (strip features, secondary artists) */
export function cleanArtist(rawArtist: string): string {
  return rawArtist
    .replace(/\s*[\(\[](?:feat|ft)\.?\s+[^\)\]]+[\)\]]/gi, '')
    .replace(/\s+(?:feat|ft)\.?\s+.+$/i, '')
    .replace(/\s+&\s+.+$/, '')
    .replace(/\s*,\s*.+$/, '')
    .trim();
}

interface LRCLIBItem {
  id: number;
  name?: string;
  trackName?: string;
  artistName?: string;
  plainLyrics?: string;
  syncedLyrics?: string;
  instrumental?: boolean;
}

function parseLRCLIBData(trackId: string, data: LRCLIBItem): Lyrics | null {
  if (data.syncedLyrics) {
    return {
      trackId,
      lines: parseLRC(data.syncedLyrics),
      synced: true,
      source: 'lrclib',
    };
  }
  if (data.plainLyrics) {
    return {
      trackId,
      lines: data.plainLyrics
        .split('\n')
        .map((text: string) => ({ text }))
        .filter((l: LyricsLine) => l.text.trim().length > 0),
      synced: false,
      source: 'lrclib',
    };
  }
  return null;
}

const LRCLIB_HEADERS = {
  'User-Agent': 'VoxenApp/1.0.0 (https://github.com/voxen)',
};

async function cacheLyrics(trackId: string, lyrics: Lyrics): Promise<void> {
  try {
    const cacheKey = `${STORAGE_KEYS.LYRICS_CACHE}_${trackId}`;
    await AsyncStorage.setItem(cacheKey, JSON.stringify(lyrics));
  } catch {}
}

export const lyricsService = {
  getLyrics: async (trackId: string, rawTitle: string, rawArtist: string): Promise<Lyrics | null> => {
    // 1. Check local cache first
    try {
      const cacheKey = `${STORAGE_KEYS.LYRICS_CACHE}_${trackId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    const title = cleanTitle(rawTitle, rawArtist);
    const artist = cleanArtist(rawArtist);

    // 2. Try LRCLIB direct get endpoint (for time-synced lyrics)
    try {
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
      const res = await networkFetch(url, { headers: LRCLIB_HEADERS, timeoutMs: 4000 });
      if (res.ok) {
        const data: LRCLIBItem = await res.json();
        const parsed = parseLRCLIBData(trackId, data);
        if (parsed && parsed.synced) {
          await cacheLyrics(trackId, parsed);
          return parsed;
        }
      }
    } catch (err) {
      logger.warn(TAG, 'LRCLIB direct get failed, trying YTM & search fallback', err);
    }

    // 3. Try YouTube Music official InnerTube lyrics
    try {
      const ytmText = await YouTubeService.getLyrics(trackId);
      if (ytmText) {
        const ytmLyrics: Lyrics = {
          trackId,
          lines: ytmText
            .split('\n')
            .map((text) => ({ text: text.trim() }))
            .filter((l) => l.text.length > 0),
          synced: false,
          source: 'youtube',
        };
        await cacheLyrics(trackId, ytmLyrics);
        return ytmLyrics;
      }
    } catch (err) {
      logger.warn(TAG, 'YouTube Music lyrics fetch failed, falling back to LRCLIB search', err);
    }

    // 4. Fallback: LRCLIB search query with artist and title
    try {
      const query = `${artist} ${title}`.trim();
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
      const res = await networkFetch(searchUrl, { headers: LRCLIB_HEADERS, timeoutMs: 5000 });
      if (res.ok) {
        const results: LRCLIBItem[] = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          const item = results.find((r) => !!r.syncedLyrics) || results.find((r) => !!r.plainLyrics);
          if (item) {
            const parsed = parseLRCLIBData(trackId, item);
            if (parsed) {
              await cacheLyrics(trackId, parsed);
              return parsed;
            }
          }
        }
      }
    } catch (err) {
      logger.warn(TAG, 'LRCLIB search fallback failed', err);
    }

    // 5. Second fallback: LRCLIB search query with title only
    if (title) {
      try {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(title)}`;
        const res = await networkFetch(searchUrl, { headers: LRCLIB_HEADERS, timeoutMs: 5000 });
        if (res.ok) {
          const results: LRCLIBItem[] = await res.json();
          if (Array.isArray(results) && results.length > 0) {
            const item = results.find((r) => !!r.syncedLyrics) || results.find((r) => !!r.plainLyrics);
            if (item) {
              const parsed = parseLRCLIBData(trackId, item);
              if (parsed) {
                await cacheLyrics(trackId, parsed);
                return parsed;
              }
            }
          }
        }
      } catch (err) {
        logger.warn(TAG, 'LRCLIB title search fallback failed', err);
      }
    }

    return null;
  },

  prefetchLyrics: async (trackId: string, rawTitle: string, rawArtist: string): Promise<void> => {
    try {
      const cacheKey = `${STORAGE_KEYS.LYRICS_CACHE}_${trackId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) return;

      await lyricsService.getLyrics(trackId, rawTitle, rawArtist);
    } catch {}
  },
};
