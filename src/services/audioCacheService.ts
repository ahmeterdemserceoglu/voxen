import { YouTubeService, ResolvedStreamResult } from './youtubeService';
import { logger } from '../utils/logger';

const TAG = 'AudioCacheService';
const MAX_PREFETCH_ITEMS = 5;

interface CachedStream {
  stream: ResolvedStreamResult;
  fetchedAt: number;
}

class AudioCacheService {
  private cache = new Map<string, CachedStream>();
  private prefetchQueue = new Set<string>();

  get(videoId: string): ResolvedStreamResult | null {
    const item = this.cache.get(videoId);
    if (!item) return null;
    // Cache valid for 4 hours (YouTube stream URLs typically valid 6h)
    if (Date.now() - item.fetchedAt > 4 * 60 * 60 * 1000) {
      this.cache.delete(videoId);
      return null;
    }
    return item.stream;
  }

  set(videoId: string, stream: ResolvedStreamResult): void {
    if (this.cache.size >= 25) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(videoId, { stream, fetchedAt: Date.now() });
  }

  async prefetchNext(videoId: string): Promise<void> {
    if (!videoId || this.cache.has(videoId) || this.prefetchQueue.has(videoId)) return;
    if (this.prefetchQueue.size >= MAX_PREFETCH_ITEMS) return;

    this.prefetchQueue.add(videoId);
    try {
      logger.info(TAG, `Prefetching audio stream for queue next: ${videoId}`);
      const stream = await YouTubeService.getAudioStreamUrl(videoId);
      if (stream) {
        this.set(videoId, stream);
      }
    } catch (err) {
      logger.warn(TAG, `Prefetch failed for ${videoId}`, err);
    } finally {
      this.prefetchQueue.delete(videoId);
    }
  }

  delete(videoId: string): void {
    this.cache.delete(videoId);
    this.prefetchQueue.delete(videoId);
  }

  clear(): void {
    this.cache.clear();
    this.prefetchQueue.clear();
  }
}

export const audioCacheService = new AudioCacheService();
