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

function nativeDownloader(): any {
  try { return require('react-native').NativeModules?.VoxenDownloader; } catch { return undefined; }
}

type ProgressCallback = (trackId: string, progress: number) => void;

class OfflineDownloadService {
  constructor() { accountSession.subscribe(() => this.cancelAllDownloads()); }
  private indexWrite: Promise<unknown> = Promise.resolve();
  private session = -1;
  private cancelRevision = 0;

  private checkSession() {
    if (this.session === accountSession.generation) return;
    if (this.session >= 0) this.cancelAllDownloads();
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

  private async reconcileNative() {
    const native = nativeDownloader();
    if (!native) return;
    const epoch = accountSession.generation; const storage = accountStorage.capture();
    const owner = accountSession.uid || 'guest';
    const jobs = JSON.parse(await native.results());
    if (!accountSession.isCurrent(epoch)) return;
    for (const job of Object.values(jobs) as any[]) {
      if (job.owner !== owner) continue;
      const trackId = job.track?.id;
      if (!trackId) continue;
      const progress = job.total > 0 ? Math.min(99, Math.floor(job.bytes * 100 / job.total)) : 0;
      if (job.state !== 'done') {
        this.downloadEntries.set(trackId, { trackId, state: ['queued', 'downloading'].includes(job.state) ? 'downloading' : job.state === 'paused' ? 'cancelled' : 'error', progress, error: job.error });
        this.emitProgress(trackId, progress);
        continue;
      }
      if (!new File(job.uri).exists) { native.acknowledge(job.key); continue; }
      await this.updateIndex(storage, items => [...items.filter(item => item.track.id !== trackId), {
        track: job.track, localUri: job.uri, downloadedAt: Date.now(), sizeBytes: job.sizeBytes,
      }]);
      if (!accountSession.isCurrent(epoch)) return;
      native.acknowledge(job.key);
      this.downloadEntries.set(trackId, { trackId, state: 'done', progress: 100 });
    }
  }

  async downloadMany(tracks: Track[], onProgress?: (completed: number, total: number) => void) {
    this.checkSession();
    const revision = this.cancelRevision;
    const epoch = accountSession.generation;
    const unique = [...new Map(tracks.filter(track => track?.id).map(track => [track.id, track])).values()];
    let cursor = 0; let completed = 0; let failed = 0;
    await Promise.all(Array.from({ length: Math.min(2, unique.length) }, async () => {
      while (cursor < unique.length && accountSession.isCurrent(epoch) && revision === this.cancelRevision) {
        const track = unique[cursor++];
        const result = await this.downloadTrack(track); if (!result) failed++;
        completed++; onProgress?.(completed, unique.length);
      }
    }));
    return { completed, failed, total: unique.length };
  }

  async getPendingTracks(): Promise<Track[]> {
    const native = nativeDownloader(); if (!native) return [];
    const owner = accountSession.uid || 'guest'; const epoch = accountSession.generation;
    const jobs = JSON.parse(await native.results());
    if (!accountSession.isCurrent(epoch)) return [];
    return (Object.values(jobs) as any[]).filter(job => job.owner === owner && ['paused', 'error'].includes(job.state)).map(job => job.track);
  }

  async clearDownloads() {
    const epoch = accountSession.generation;
    this.cancelAllDownloads();
    const tracks = await this.getDownloadedTracks();
    for (const item of tracks) { if (!accountSession.isCurrent(epoch)) return; await this.deleteDownloadedTrack(item.track.id); }
    if (accountSession.isCurrent(epoch)) nativeDownloader()?.clearPartial(accountSession.uid || 'guest');
  }

  // ── Persisted list helpers ──────────────────────────────────────────────────

  async getDownloadedTracks(): Promise<DownloadedTrack[]> {
    this.checkSession();
    const epoch = accountSession.generation;
    try {
      await this.reconcileNative();
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
    if (this.activeControllers.has(trackId) || current?.state === 'downloading') {
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

      const native = nativeDownloader();
      if (native) {
        const owner = accountSession.uid || 'guest';
        const key = `${encodeURIComponent(owner)}_${encodeURIComponent(trackId)}`;
        targetFile = new File(this.downloadsDir, `${key}.m4a`);
        const abort = () => native.cancel(key);
        controller.signal.addEventListener('abort', abort, { once: true });
        const timer = setInterval(() => { void this.reconcileNative().catch(() => {}); }, 1000);
        try {
          const job = JSON.parse(await native.download(JSON.stringify({ key, owner, track, title: track.title, videoId: track.videoId || track.id }), targetFile.uri));
          if (controller.signal.aborted || !accountSession.isCurrent(epoch)) return null;
          const downloadedItem = { track, localUri: job.uri, downloadedAt: Date.now(), sizeBytes: job.sizeBytes };
          await this.updateIndex(storage, items => {
            if (controller.signal.aborted || !accountSession.isCurrent(epoch)) throw new Error("Download cancelled");
            return [...items.filter(item => item.track.id !== trackId), downloadedItem];
          });
          committed = true;
          native.acknowledge(key);
          this.downloadEntries.set(trackId, { trackId, state: 'done', progress: 100 }); this.emitProgress(trackId, 100); onProgress?.(100);
          return downloadedItem;
        } finally { clearInterval(timer); controller.signal.removeEventListener('abort', abort); }
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
      if (!committed && !nativeDownloader() && targetFile?.exists) targetFile.delete();
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
    this.cancelRevision++;
    for (const [, controller] of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
    nativeDownloader()?.cancelAll();
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
    const epoch = accountSession.generation;
    const owner = accountSession.uid || "guest";
    const list = await this.getDownloadedTracks();
    let partial = 0;
    const native = nativeDownloader();
    if (native) {
      const jobs = JSON.parse(await native.results());
      if (!accountSession.isCurrent(epoch)) return 0;
      for (const job of Object.values(jobs) as any[]) if (job.owner === owner && job.state !== 'done') {
        const file = new File(job.uri + '.part'); if (file.exists) partial += file.size;
      }
    }
    if (!accountSession.isCurrent(epoch)) return 0;
    return list.reduce((acc, d) => acc + (d.sizeBytes || 0), 0) + partial;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const offlineDownloadService = new OfflineDownloadService();
