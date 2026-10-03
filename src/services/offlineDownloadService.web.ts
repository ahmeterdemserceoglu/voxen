import { accountSession } from './auth/accountStorage';
import type { Track } from '../models/Track';
const API_ORIGIN = process.env.EXPO_PUBLIC_VOXEN_API_BASE || '';
const apiUrl = (path: string) => `${API_ORIGIN}${path}`;
const absoluteLocalUri = (uri: string) => uri?.startsWith('/') ? `${API_ORIGIN}${uri}` : uri;
export interface DownloadedTrack { track: Track; localUri: string; downloadedAt: number; sizeBytes: number }
export type DownloadState = 'idle' | 'downloading' | 'done' | 'error' | 'cancelled';
export interface DownloadEntry { trackId: string; state: DownloadState; progress: number; error?: string; track?: Track; bytesDownloaded?: number; totalBytes?: number; bytesPerSecond?: number; remainingSeconds?: number }
type ProgressCallback = (trackId: string, progress: number) => void;
class DesktopOfflineDownloadService {
  private entries = new Map<string, DownloadEntry>();
  private listeners = new Set<ProgressCallback>();
  private jobs = new Map<string, { controller: AbortController; owner: string; promise: Promise<DownloadedTrack | null> }>();
  private revision = 0;
  private cached: { owner: string; items: DownloadedTrack[]; expires: number } | null = null;
  private listing: { owner: string; promise: Promise<DownloadedTrack[]> } | null = null;
  constructor() {
    accountSession.subscribe(() => {
      this.cancelAllDownloads(); this.jobs.clear(); this.entries.clear(); this.cached = null; this.listing = null;
      this.listeners.forEach(listener => listener('', 0));
    });
  }
  private owner() { return accountSession.uid || 'guest'; }
  private query(owner: string, id?: string) { return `owner=${encodeURIComponent(owner)}${id ? `&id=${encodeURIComponent(id)}` : ''}`; }
  private set(entry: DownloadEntry) { this.entries.set(entry.trackId, entry); this.listeners.forEach(listener => listener(entry.trackId, entry.progress)); }
  addProgressListener(listener: ProgressCallback) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getDownloadEntry(trackId: string) { return this.entries.get(trackId) || { trackId, state: 'idle' as const, progress: 0 }; }
  getAllEntries() { return [...this.entries.values()]; }
  async getDownloadedTracks(): Promise<DownloadedTrack[]> {
    const owner = this.owner(); const epoch = accountSession.generation;
    if (this.cached?.owner === owner && this.cached.expires > Date.now()) return this.cached.items;
    if (this.listing?.owner === owner) return this.listing.promise;
    const promise = this.loadList(owner, epoch);
    this.listing = { owner, promise };
    try { return await promise; } finally { if (this.listing?.promise === promise) this.listing = null; }
  }
  private async loadList(owner: string, epoch: number): Promise<DownloadedTrack[]> {
    try {
      const response = await fetch(apiUrl(`/api/downloads?${this.query(owner)}`));
      if (!response.ok) throw new Error('İndirilenler okunamadı');
      const result = await response.json();
      if (!accountSession.isCurrent(epoch)) return [];
      const items = Array.isArray(result.items) ? result.items.map((item: DownloadedTrack) => ({ ...item, localUri: absoluteLocalUri(item.localUri) })) : [];
      this.cached = { owner, items, expires: Date.now() + 5000 }; return items;
    } catch { return accountSession.isCurrent(epoch) && this.cached?.owner === owner ? this.cached.items : []; }
  }
  async isDownloaded(trackId: string) { return (await this.getDownloadedTracks()).some(item => item.track.id === trackId); }
  async getLocalUri(trackId: string) { return (await this.getDownloadedTracks()).find(item => item.track.id === trackId)?.localUri || null; }
  async getPendingTracks(): Promise<Track[]> {
    const owner = this.owner(); const epoch = accountSession.generation;
    try {
      const response = await fetch(apiUrl(`/api/download/status?${this.query(owner)}`));
      if (!response.ok) return [];
      const result = await response.json();
      if (!accountSession.isCurrent(epoch) || !Array.isArray(result.items)) return [];
      result.items.forEach((item: any) => {
        if (item.trackId) {
          this.set({
            trackId: item.trackId,
            state: item.state,
            progress: item.progress || 0,
            error: item.error,
            track: item.track,
            bytesDownloaded: item.bytesDownloaded,
            totalBytes: item.totalBytes,
            bytesPerSecond: item.bytesPerSecond,
            remainingSeconds: item.remainingSeconds,
          });
        }
      });
      return result.items.filter((item: any) => item.state === 'error' || item.state === 'cancelled').map((item: any) => item.track).filter((track: Track) => track?.id);
    } catch { return []; }
  }
  async getStorageUsedBytes() { return (await this.getDownloadedTracks()).reduce((sum, item) => sum + (item.sizeBytes || 0), 0); }
  downloadTrack(track: Track, onProgress?: (progress: number) => void): Promise<DownloadedTrack | null> {
    const existing = this.jobs.get(track.id); if (existing) return existing.promise;
    const owner = this.owner(); const epoch = accountSession.generation; const controller = new AbortController();
    const current = () => accountSession.isCurrent(epoch) && this.jobs.get(track.id)?.controller === controller;
    const update = (entry: Partial<DownloadEntry>) => {
      if (current() && !controller.signal.aborted) {
        this.set({
          trackId: track.id,
          state: 'downloading',
          progress: entry.progress ?? 0,
          bytesDownloaded: entry.bytesDownloaded,
          totalBytes: entry.totalBytes,
          bytesPerSecond: entry.bytesPerSecond,
          remainingSeconds: entry.remainingSeconds,
          track,
        });
        onProgress?.(entry.progress ?? 0);
      }
    };
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || !current() || controller.signal.aborted) return;
      polling = true;
      try {
        const response = await fetch(apiUrl(`/api/download/status?${this.query(owner)}`), { signal: controller.signal });
        if (response.ok) {
          const result = await response.json();
          const item = result.items?.find((entry: DownloadEntry) => entry.trackId === track.id);
          if (item?.state === 'downloading') update(item);
        }
      } catch {} finally { polling = false; }
    }, 600);
    const promise = (async () => {
      await Promise.resolve();
      try {
        const response = await fetch(apiUrl('/api/download'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ owner, track }) });
        const result = await response.json();
        if (!response.ok || !result.item) throw new Error(result.error || 'İndirme tamamlanamadı');
        if (!current() || controller.signal.aborted) return null;
        this.cached = null; this.set({ trackId: track.id, state: 'done', progress: 100, track }); onProgress?.(100);
        return { ...result.item, localUri: absoluteLocalUri(result.item.localUri) };
      } catch (error) {
        if (current()) this.set({ trackId: track.id, state: controller.signal.aborted ? 'cancelled' : 'error', progress: 0, error: controller.signal.aborted ? undefined : error instanceof Error ? error.message : 'İndirme hatası', track });
        return null;
      } finally { clearInterval(timer); if (this.jobs.get(track.id)?.controller === controller) this.jobs.delete(track.id); }
    })();
    this.jobs.set(track.id, { owner, controller, promise }); update({ progress: 0 }); return promise;
  }
  async downloadMany(tracks: Track[], onProgress?: (completed: number, total: number) => void) {
    const unique = [...new Map(tracks.filter(track => track?.id).map(track => [track.id, track])).values()];
    const revision = this.revision; const epoch = accountSession.generation;
    let cursor = 0; let completed = 0; let failed = 0;
    const worker = async () => {
      while (cursor < unique.length && revision === this.revision && accountSession.isCurrent(epoch)) {
        const item = await this.downloadTrack(unique[cursor++]);
        if (revision !== this.revision || !accountSession.isCurrent(epoch)) break;
        if (!item) failed++; completed++; onProgress?.(completed, unique.length);
      }
    };
    await Promise.all([worker(), worker()]); return { completed, failed, total: unique.length };
  }
  cancelDownload(trackId: string) {
    const job = this.jobs.get(trackId); if (!job) return;
    job.controller.abort(); this.set({ trackId, state: 'cancelled', progress: 0 });
    void fetch(apiUrl(`/api/download/job?${this.query(job.owner, trackId)}`), { method: 'DELETE' }).catch(() => {});
  }
  cancelAllDownloads() { this.revision++; this.jobs.forEach((_job, id) => this.cancelDownload(id)); }
  async deleteDownloadedTrack(trackId: string) {
    const owner = this.owner(); const epoch = accountSession.generation;
    this.jobs.get(trackId)?.controller.abort();
    this.entries.delete(trackId);
    this.listeners.forEach(listener => listener(trackId, 0));
    const response = await fetch(apiUrl(`/api/download?${this.query(owner, trackId)}`), { method: 'DELETE' });
    if (!response.ok) throw new Error('Parça silinemedi');
    if (accountSession.isCurrent(epoch)) { this.cached = null; }
  }
  async clearDownloads() {
    const owner = this.owner(); const epoch = accountSession.generation;
    const items = await this.getDownloadedTracks(); if (!accountSession.isCurrent(epoch)) return;
    this.cancelAllDownloads();
    const responses = await Promise.all([
      fetch(apiUrl(`/api/download/partials?${this.query(owner)}`), { method: 'DELETE' }),
      ...items.map(item => fetch(apiUrl(`/api/download?${this.query(owner, item.track.id)}`), { method: 'DELETE' })),
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Bazı indirmeler temizlenemedi');
    if (accountSession.isCurrent(epoch)) { this.cached = null; this.entries.clear(); }
  }
}
export const offlineDownloadService = new DesktopOfflineDownloadService();
