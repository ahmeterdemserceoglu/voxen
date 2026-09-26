import { accountSession } from './auth/accountStorage';
import type { Track } from '../models/Track';

const API_ORIGIN = process.env.EXPO_PUBLIC_VOXEN_API_BASE || '';
const apiUrl = (path: string) => `${API_ORIGIN}${path}`;
const absoluteLocalUri = (uri: string) => uri?.startsWith('/') ? `${API_ORIGIN}${uri}` : uri;

export interface DownloadedTrack {
  track: Track;
  localUri: string;
  downloadedAt: number;
  sizeBytes: number;
}

export type DownloadState = 'idle' | 'downloading' | 'done' | 'error' | 'cancelled';
export interface DownloadEntry { trackId: string; state: DownloadState; progress: number; error?: string }
type ProgressCallback = (trackId: string, progress: number) => void;

class LinuxOfflineDownloadService {
  private entries = new Map<string, DownloadEntry>();
  private listeners = new Set<ProgressCallback>();
  private controllers = new Map<string, AbortController>();

  private owner() { return accountSession.uid || 'guest'; }
  private emit(trackId: string, progress: number) { this.listeners.forEach(listener => listener(trackId, progress)); }
  private set(entry: DownloadEntry) { this.entries.set(entry.trackId, entry); this.emit(entry.trackId, entry.progress); }

  addProgressListener(listener: ProgressCallback) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getDownloadEntry(trackId: string) { return this.entries.get(trackId) || { trackId, state: 'idle' as const, progress: 0 }; }
  getAllEntries() { return [...this.entries.values()]; }

  async getDownloadedTracks(): Promise<DownloadedTrack[]> {
    try {
      const response = await fetch(apiUrl(`/api/downloads?owner=${encodeURIComponent(this.owner())}`));
      const result = await response.json();
      return response.ok && Array.isArray(result.items)
        ? result.items.map((item: DownloadedTrack) => ({ ...item, localUri: absoluteLocalUri(item.localUri) }))
        : [];
    } catch { return []; }
  }

  async isDownloaded(trackId: string) { return (await this.getDownloadedTracks()).some(item => item.track.id === trackId); }
  async getLocalUri(trackId: string) { return (await this.getDownloadedTracks()).find(item => item.track.id === trackId)?.localUri || null; }
  async getPendingTracks(): Promise<Track[]> { return []; }
  async getStorageUsedBytes() { return (await this.getDownloadedTracks()).reduce((sum, item) => sum + (item.sizeBytes || 0), 0); }

  async downloadTrack(track: Track, onProgress?: (progress: number) => void): Promise<DownloadedTrack | null> {
    if (this.controllers.has(track.id)) return null;
    const controller = new AbortController(); this.controllers.set(track.id, controller);
    this.set({ trackId: track.id, state: 'downloading', progress: 5 }); onProgress?.(5);
    try {
      const response = await fetch(apiUrl('/api/download'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ owner: this.owner(), track }),
      });
      const result = await response.json();
      if (!response.ok || !result.item) throw new Error(result.error || 'İndirme tamamlanamadı');
      this.set({ trackId: track.id, state: 'done', progress: 100 }); onProgress?.(100);
      return { ...result.item, localUri: absoluteLocalUri(result.item.localUri) };
    } catch (error) {
      const cancelled = controller.signal.aborted;
      this.set({ trackId: track.id, state: cancelled ? 'cancelled' : 'error', progress: 0, error: cancelled ? undefined : error instanceof Error ? error.message : 'İndirme hatası' });
      return null;
    } finally { this.controllers.delete(track.id); }
  }

  async downloadMany(tracks: Track[], onProgress?: (completed: number, total: number) => void) {
    const unique = [...new Map(tracks.filter(track => track?.id).map(track => [track.id, track])).values()];
    let completed = 0; let failed = 0;
    for (const track of unique) { if (!await this.downloadTrack(track)) failed++; completed++; onProgress?.(completed, unique.length); }
    return { completed, failed, total: unique.length };
  }

  cancelDownload(trackId: string) { this.controllers.get(trackId)?.abort(); }
  cancelAllDownloads() { this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); }

  async deleteDownloadedTrack(trackId: string) {
    this.cancelDownload(trackId);
    await fetch(apiUrl(`/api/download?owner=${encodeURIComponent(this.owner())}&id=${encodeURIComponent(trackId)}`), { method: 'DELETE' });
    this.entries.delete(trackId);
  }

  async clearDownloads() {
    this.cancelAllDownloads();
    await Promise.all((await this.getDownloadedTracks()).map(item => this.deleteDownloadedTrack(item.track.id)));
  }
}

export const offlineDownloadService = new LinuxOfflineDownloadService();
