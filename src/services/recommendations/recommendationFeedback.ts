import { accountStorage, accountSession } from '../auth/accountStorage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import type { Track } from '../../models';

interface Feedback { tracks: string[]; artists: string[]; revision: number }
const normalize = (name: string) => name.trim().normalize('NFKC').toLowerCase().replace(/ı/g, 'i').replace(/i\u0307/g, 'i');
const listeners = new Set<() => void>();
let cache: Feedback | null = null; let generation = -1; let writes: Promise<void> = Promise.resolve();
export const recommendationFeedback = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async load(): Promise<Feedback> {
    const epoch = accountSession.generation;
    if (generation !== epoch) { cache = null; generation = epoch; }
    if (cache) return cache;
    const stored = await accountStorage.getItem(STORAGE_KEYS.RECOMMENDATION_FEEDBACK);
    const data: Feedback = stored ? JSON.parse(stored) : { tracks: [], artists: [], revision: 0 };
    if (accountSession.isCurrent(epoch)) cache = data;
    return data;
  },
  allowed(track: Track, data: Feedback) {
    return !data.tracks.includes(track.id) && !data.artists.includes(normalize(track.artist || track.artistName || ''));
  },
  async block(track: Track, artist = false) {
    const epoch = accountSession.generation; const storage = accountStorage.capture();
    const operation = writes.then(async () => {
      if (!accountSession.isCurrent(epoch)) return;
      const data = await this.load(); if (!accountSession.isCurrent(epoch)) return;
      const field = artist ? 'artists' : 'tracks';
      const value = artist ? normalize(track.artist || track.artistName || '') : track.id;
      if (!value) return;
      cache = { ...data, [field]: [...new Set([...data[field], value])], revision: Math.max(Date.now(), data.revision + 1) };
      await storage.setItem(STORAGE_KEYS.RECOMMENDATION_FEEDBACK, JSON.stringify(cache));
      if (accountSession.isCurrent(epoch)) listeners.forEach(listener => listener());
    });
    writes = operation.catch(() => {}); await operation;
  },
  async reset() {
    const epoch = accountSession.generation; const storage = accountStorage.capture();
    const operation = writes.then(async () => {
      if (!accountSession.isCurrent(epoch)) return;
      cache = { tracks: [], artists: [], revision: Date.now() }; generation = epoch;
      await storage.setItem(STORAGE_KEYS.RECOMMENDATION_FEEDBACK, JSON.stringify(cache));
      if (accountSession.isCurrent(epoch)) listeners.forEach(listener => listener());
    });
    writes = operation.catch(() => {}); await operation;
  },
};
