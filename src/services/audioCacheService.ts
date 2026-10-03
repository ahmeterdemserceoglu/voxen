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
  private requests = new Map<string, Promise<ResolvedStreamResult>>();
  private revision = 0;

  get(videoId: string): ResolvedStreamResult | null {
    const item = this.cache.get(videoId);
    if (!item) return null;
    // Cache valid for max 1 hour or until stream URL expires
    if (Date.now() - item.fetchedAt > 60 * 60 * 1000) {
      this.cache.delete(videoId);
      return null;
    }
    const streamUrl = typeof item.stream === 'string' ? item.stream : item.stream.uri;
    if (streamUrl) {
      try {
        const urlObj = new URL(streamUrl);
        const expireParam = urlObj.searchParams.get('expire');
        if (expireParam) {
          const expiresAtMs = Number(expireParam) * 1000;
          if (Date.now() >= expiresAtMs - 60_000) {
            this.cache.delete(videoId);
            return null;
          }
        }
      } catch {}
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

  resolve(videoId: string): Promise<ResolvedStreamResult> {
    const cached = this.get(videoId);
    if (cached) return Promise.resolve(cached);
    const pending = this.requests.get(videoId);
    if (pending) return pending;
    const revision = this.revision;
    const request = YouTubeService.getAudioStreamUrl(videoId).then(stream => {
      if (revision === this.revision) this.set(videoId, stream);
      return stream;
    }).finally(() => { if (this.requests.get(videoId) === request) this.requests.delete(videoId); });
    this.requests.set(videoId, request);
    return request;
  }

  async prefetchNext(videoId: string): Promise<void> {
    if (!videoId || this.get(videoId) || this.prefetchQueue.has(videoId)) return;
    if (this.prefetchQueue.size >= MAX_PREFETCH_ITEMS) return;

    this.prefetchQueue.add(videoId);
    try {
      logger.info(TAG, `Prefetching audio stream for queue next: ${videoId}`);
      await this.resolve(videoId);
    } catch (err) {
      logger.warn(TAG, `Prefetch failed for ${videoId}`, err);
    } finally {
      this.prefetchQueue.delete(videoId);
    }
  }

  delete(videoId: string): void {
    this.revision++;
    this.cache.delete(videoId);
    this.requests.delete(videoId);
    this.prefetchQueue.delete(videoId);
  }

  clear(): void {
    this.revision++;
    this.cache.clear();
    this.requests.clear();
    this.prefetchQueue.clear();
  }
}

export const audioCacheService = new AudioCacheService();
