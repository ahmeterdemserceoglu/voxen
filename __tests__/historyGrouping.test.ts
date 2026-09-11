import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHistory, type HistoryEntry } from '../src/models/HistoryEntry.ts';
import type { Track } from '../src/models/Track';

const mockTrack: Track = {
  id: 'test_1',
  videoId: 'test_1',
  title: 'Test Song',
  artist: 'Test Artist',
  artistName: 'Test Artist',
  artists: [{ name: 'Test Artist' }],
  thumbnail: '',
  thumbnails: {},
  source: 'youtube',
};

test('History Grouping - groups entries into correct relative time buckets', () => {
  const now = Date.now();
  const entries: HistoryEntry[] = [
    {
      id: 'h1',
      track: mockTrack,
      playedAt: now - 1000 * 60 * 10, // 10 minutes ago -> Bugün
      playedDuration: 180000,
      completed: true,
    },
    {
      id: 'h2',
      track: mockTrack,
      playedAt: now - 86400000 - 1000 * 60, // ~1 day ago -> Dün
      playedDuration: 120000,
      completed: true,
    },
    {
      id: 'h3',
      track: mockTrack,
      playedAt: now - 86400000 * 3, // 3 days ago -> Bu Hafta
      playedDuration: 200000,
      completed: true,
    },
    {
      id: 'h4',
      track: mockTrack,
      playedAt: now - 86400000 * 15, // 15 days ago -> Daha Eski
      playedDuration: 90000,
      completed: true,
    },
  ];

  const groups = groupHistory(entries);
  assert.ok(groups.length > 0);

  const groupLabels = groups.map((g) => g.label);
  assert.ok(groupLabels.includes('Bugün'));
  assert.ok(groupLabels.includes('Daha Eski'));
});
