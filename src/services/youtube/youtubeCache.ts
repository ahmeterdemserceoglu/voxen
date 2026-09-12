import { logger } from '../../utils/logger';
import type { Track } from '../../models';

const TAG = 'YoutubeCache';

const SEARCH_TTL_MS = 5 * 60 * 1000;      // 5 minutes
const MAX_SEARCH_ENTRIES = 50;

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttl: number;
}

function isExpired<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.cachedAt > entry.ttl;
}

// In-memory cache (fast, lost on restart)
const memSearchCache = new Map<string, CacheEntry<Track[]>>();

export const youtubeCache = {
  /** Get cached search results for a query */
  getSearch: (query: string): Track[] | null => {
    const key = query.toLowerCase().trim();
    const entry = memSearchCache.get(key);
    if (!entry || isExpired(entry)) {
      memSearchCache.delete(key);
      return null;
    }
    logger.debug(TAG, `Cache hit: "${query}"`);
    return entry.data;
  },

  /** Store search results */
  setSearch: (query: string, tracks: Track[]): void => {
    const key = query.toLowerCase().trim();
    // Evict oldest if at limit
    if (memSearchCache.size >= MAX_SEARCH_ENTRIES) {
      const firstKey = memSearchCache.keys().next().value;
      if (firstKey) memSearchCache.delete(firstKey);
    }
    memSearchCache.set(key, { data: tracks, cachedAt: Date.now(), ttl: SEARCH_TTL_MS });
  },

  /** Clear all search cache */
  clearSearch: (): void => {
    memSearchCache.clear();
  },
};
