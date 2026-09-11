import { Paths, File, Directory } from 'expo-file-system';
import { accountStorage, accountSession } from './auth/accountStorage';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { YouTubeService } from './youtubeService';
import type { Track } from '../models/Track';
import { logger } from '../utils/logger';

const TAG = 'OfflineDownloadService';

export interface DownloadedTrack {
  track: Track;
  localUri: string;
  downloadedAt: number;
  sizeBytes: number;
}

export type DownloadState = 'idle' | 'downloading' | 'done' | 'error' | 'cancelled';

export interface DownloadEntry {
  trackId: string;
  state: DownloadState;
  /** 0–100 */
  progress: number;
  error?: string;
}

type ProgressCallback = (trackId: string, progress: number) => void;

class OfflineDownloadService {
  private indexWrite: Promise<unknown> = Promise.resolve();
  private session = -1;

  private checkSession() {
    if (this.session === accountSession.generation) return;
    this.cancelAllDownloads();
    this.downloadEntries.clear();
    this.session = accountSession.generation;
  }

  private updateIndex(storage: ReturnType<typeof accountStorage.capture>, change: (items: DownloadedTrack[]) => DownloadedTrack[]) {
    const operation = this.indexWrite.then(async () => {
      const json = await storage.getItem(STORAGE_KEYS.DOWNLOADED_TRACKS);
      await storage.setItem(STORAGE_KEYS.DOWNLOADED_TRACKS, JSON.stringify(change(json ? JSON.parse(json) : [])));
    });
    this.indexWrite = operation.catch(() => {});
    return operation;
  }

  private downloadsDir = new Directory(Paths.document, 'downloads');

  /** Active download abort controllers keyed by trackId */
  private activeControllers = new Map<string, AbortController>();

  /** In-memory download state map */
  private downloadEntries = new Map<string, DownloadEntry>();

  /** External progress listeners */
  private progressListeners = new Set<ProgressCallback>();

  // ── Directory ───────────────────────────────────────────────────────────────

  private async ensureDirectory(): Promise<void> {
    if (!this.downloadsDir.exists) {
      this.downloadsDir.create();
    }
  }

  // ── Progress listener subscription ─────────────────────────────────────────

  addProgressListener(cb: ProgressCallback): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  private emitProgress(trackId: string, progress: number) {
    this.progressListeners.forEach((cb) => cb(trackId, progress));
  }

  // ── State accessors ─────────────────────────────────────────────────────────

  getDownloadEntry(trackId: string): DownloadEntry {
    this.checkSession();
    return (
      this.downloadEntries.get(trackId) ?? { trackId, state: 'idle', progress: 0 }
    );
  }

  getAllEntries(): DownloadEntry[] {
    this.checkSession();
    return Array.from(this.downloadEntries.values());
  }

  // ── Persisted list helpers ──────────────────────────────────────────────────

  async getDownloadedTracks(): Promise<DownloadedTrack[]> {
    this.checkSession();
    const epoch = accountSession.generation;
    try {
      const json = await accountStorage.getItem(STORAGE_KEYS.DOWNLOADED_TRACKS);
      if (!json || !accountSession.isCurrent(epoch)) return [];
      const list: DownloadedTrack[] = JSON.parse(json);
      return list.filter((item) => {
        try {
          const file = new File(item.localUri);
          return file.exists;
        } catch {
          return false;
        }
      });
    } catch (err) {
      logger.error(TAG, 'Error getting downloaded tracks', err);
      return [];
    }
  }

  async isDownloaded(trackId: string): Promise<boolean> {
    const list = await this.getDownloadedTracks();
    return list.some((item) => item.track.id === trackId);
  }

  async getLocalUri(trackId: string): Promise<string | null> {
    const list = await this.getDownloadedTracks();
    const item = list.find((d) => d.track.id === trackId);
    return item ? item.localUri : null;
  }

  // ── Download ────────────────────────────────────────────────────────────────

  /**
   * Download a track with progress reporting and cancellation support.
   * Returns the DownloadedTrack on success, or null on failure/cancellation.
   */
  async downloadTrack(
    track: Track,
    onProgress?: (progress: number) => void,
  ): Promise<DownloadedTrack | null> {
    this.checkSession();
    const epoch = accountSession.generation;
    const storage = accountStorage.capture();
    const trackId = track.id;
    let targetFile: File | undefined;
    let committed = false;

    // Already downloading?
    const current = this.downloadEntries.get(trackId);
    if (current?.state === 'downloading') {
      logger.warn(TAG, `Already downloading ${trackId}`);
      return null;
    }

    const controller = new AbortController();
    this.activeControllers.set(trackId, controller);
    this.downloadEntries.set(trackId, { trackId, state: 'downloading', progress: 0 });
    this.emitProgress(trackId, 0);
    onProgress?.(0);

    try {
      await this.ensureDirectory();

      // Check if we already have the file
      const existingUri = await this.getLocalUri(trackId);
      if (existingUri && !(controller.signal.aborted || !accountSession.isCurrent(epoch))) {
        const file = new File(existingUri);
        if (file.exists) {
          const list = await this.getDownloadedTracks();
          const found = list.find((d) => d.track.id === trackId) || null;
          if (found) {
            this.downloadEntries.set(trackId, { trackId, state: 'done', progress: 100 });
            this.emitProgress(trackId, 100);
            onProgress?.(100);
            return found;
          }
        }
      }

      // Resolve stream URL
      this.emitProgress(trackId, 5);
      onProgress?.(5);

      const stream = await YouTubeService.getAudioStreamUrl(track.videoId || trackId);
      if ((controller.signal.aborted || !accountSession.isCurrent(epoch))) {
        if (accountSession.isCurrent(epoch)) this._markCancelled(trackId);
        return null;
      }

      const remoteUrl = typeof stream === 'string' ? stream : stream.uri;
      if (!remoteUrl) throw new Error('No audio URL resolved');

      targetFile = new File(this.downloadsDir, `${encodeURIComponent(accountSession.uid || "guest")}_${encodeURIComponent(trackId)}_${Date.now()}_${epoch}.m4a`);
      if (targetFile.exists) {
        targetFile.delete();
      }

      // Download with fetch + manual chunk tracking for progress
      const response = await fetch(remoteUrl, {
        signal: controller.signal,
        headers: (stream as any).headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const contentType = response.headers.get('Content-Type') || '';
      if (/text\/|json|html/i.test(contentType)) throw new Error('Invalid audio response');

      const contentLength = Number(response.headers.get('Content-Length') ?? 0);
      const reader = response.body?.getReader();

      if (!reader) {
        // Fallback: no streaming reader — download as blob
        const bytes = new Uint8Array(await response.arrayBuffer());
        if ((controller.signal.aborted || !accountSession.isCurrent(epoch))) {
          if (accountSession.isCurrent(epoch)) this._markCancelled(trackId);
          return null;
        }

        if (!bytes.length || (contentLength > 0 && bytes.length !== contentLength)) throw new Error('Incomplete audio response');
        targetFile.write(bytes);
      } else {
        // Stream chunks with progress
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done || (controller.signal.aborted || !accountSession.isCurrent(epoch))) break;

          chunks.push(value);
          received += value.length;

          if (contentLength > 0) {
            const pct = Math.min(99, Math.round(5 + (received / contentLength) * 93));
            this.downloadEntries.set(trackId, { trackId, state: 'downloading', progress: pct });
            this.emitProgress(trackId, pct);
            onProgress?.(pct);
          }
        }

        if ((controller.signal.aborted || !accountSession.isCurrent(epoch))) {
          if (accountSession.isCurrent(epoch)) this._markCancelled(trackId);
          return null;
        }

        // Write to file
        const total = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          total.set(chunk, offset);
          offset += chunk.length;
        }

        if (!total.length || (contentLength > 0 && received !== contentLength)) throw new Error('Incomplete audio response');
        targetFile.write(total);
      }

      if (!targetFile.exists) {
        throw new Error('File was not written to disk');
      }

      const downloadedItem: DownloadedTrack = {
        track,
        localUri: targetFile.uri,
        downloadedAt: Date.now(),
        sizeBytes: targetFile.size || 0,
      };

      await this.updateIndex(storage, items => {
        if (controller.signal.aborted || !accountSession.isCurrent(epoch)) throw new Error('Download cancelled');
        return [...items.filter(d => d.track.id !== trackId), downloadedItem];
      });
      committed = true;
      if (!accountSession.isCurrent(epoch)) return null;

      this.downloadEntries.set(trackId, { trackId, state: 'done', progress: 100 });
      this.emitProgress(trackId, 100);
      onProgress?.(100);

      logger.info(TAG, `Successfully downloaded track: ${track.title} (${trackId})`);
      return downloadedItem;
    } catch (err) {
      if ((controller.signal.aborted || !accountSession.isCurrent(epoch))) {
        if (accountSession.isCurrent(epoch)) this._markCancelled(trackId);
        return null;
      }
      const errMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      logger.error(TAG, `Failed to download track ${trackId}`, err);
      this.downloadEntries.set(trackId, { trackId, state: 'error', progress: 0, error: errMsg });
      this.emitProgress(trackId, 0);
      return null;
    } finally {
      if (this.activeControllers.get(trackId) === controller) this.activeControllers.delete(trackId);
      if (!committed && targetFile?.exists) targetFile.delete();
    }
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  cancelDownload(trackId: string): void {
    const controller = this.activeControllers.get(trackId);
    if (controller) {
      controller.abort();
      logger.info(TAG, `Cancelled download for ${trackId}`);
    }
  }

  cancelAllDownloads(): void {
    for (const [, controller] of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
    logger.info(TAG, 'Cancelled all downloads');
  }

  private _markCancelled(trackId: string) {
    this.downloadEntries.set(trackId, { trackId, state: 'cancelled', progress: 0 });
    this.emitProgress(trackId, 0);
    this.activeControllers.delete(trackId);
    logger.info(TAG, `Download cancelled: ${trackId}`);
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async deleteDownloadedTrack(trackId: string): Promise<void> {
    this.checkSession();
    const epoch = accountSession.generation;
    const storage = accountStorage.capture();
    this.cancelDownload(trackId);
    await this.updateIndex(storage, items => {
      const target = items.find(item => item.track.id === trackId);
      if (target) {
        const file = new File(target.localUri);
        if (file.exists) file.delete();
      }
      return items.filter(item => item.track.id !== trackId);
    });
    if (accountSession.isCurrent(epoch)) this.downloadEntries.delete(trackId);
  }

  /** Returns total storage used by downloads in bytes */
  async getStorageUsedBytes(): Promise<number> {
    const list = await this.getDownloadedTracks();
    return list.reduce((acc, d) => acc + (d.sizeBytes || 0), 0);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const offlineDownloadService = new OfflineDownloadService();
