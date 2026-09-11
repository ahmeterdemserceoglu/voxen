import type { SerializedTrack } from './Track';

export interface HistoryEntry {
  id: string;           // `${trackId}_${playedAt}`
  track: SerializedTrack;
  playedAt: number;     // epoch ms
  playedDuration: number; // ms listened
  completed: boolean;
  sourceContext?: string; // 'home' | 'search' | 'playlist:id' | etc.
}

export type HistoryGroup = {
  label: 'Bugün' | 'Dün' | 'Bu Hafta' | 'Daha Eski';
  entries: HistoryEntry[];
};

/** Group a flat history array into labeled time buckets */
export function groupHistory(entries: HistoryEntry[]): HistoryGroup[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const yesterdayMs = todayMs - 86_400_000;
  const weekMs = todayMs - 6 * 86_400_000;

  const groups: Record<string, HistoryEntry[]> = {
    'Bugün': [],
    'Dün': [],
    'Bu Hafta': [],
    'Daha Eski': [],
  };

  for (const entry of entries) {
    if (entry.playedAt >= todayMs) groups['Bugün'].push(entry);
    else if (entry.playedAt >= yesterdayMs) groups['Dün'].push(entry);
    else if (entry.playedAt >= weekMs) groups['Bu Hafta'].push(entry);
    else groups['Daha Eski'].push(entry);
  }

  return (Object.entries(groups) as [HistoryGroup['label'], HistoryEntry[]][])
    .filter(([, e]) => e.length > 0)
    .map(([label, entries]) => ({ label, entries }));
}
