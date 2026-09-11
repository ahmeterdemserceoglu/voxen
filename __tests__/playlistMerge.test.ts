import test from 'node:test';
import assert from 'node:assert/strict';

interface TestPlaylist {
  id: string;
  name: string;
  tracks: Array<{ id: string }>;
  updatedAt: number;
}

function mergePlaylists(local: TestPlaylist[], cloud: TestPlaylist[]): TestPlaylist[] {
  const mergedMap = new Map<string, TestPlaylist>();
  local.forEach((p) => mergedMap.set(p.id, p));
  cloud.forEach((p) => {
    if (!mergedMap.has(p.id)) {
      mergedMap.set(p.id, p);
    } else {
      const existing = mergedMap.get(p.id)!;
      // Prefer version with more tracks or newer updatedAt
      if (
        (p.tracks?.length ?? 0) > (existing.tracks?.length ?? 0) ||
        (p.updatedAt ?? 0) > (existing.updatedAt ?? 0)
      ) {
        mergedMap.set(p.id, p);
      }
    }
  });
  return Array.from(mergedMap.values());
}

test('Playlist Merge - preserves newest or most populated playlist version', () => {
  const local: TestPlaylist[] = [
    {
      id: 'p1',
      name: 'Chill Vibes',
      tracks: [{ id: 't1' }],
      updatedAt: 1000,
    },
    {
      id: 'p2',
      name: 'Local Only',
      tracks: [{ id: 't2' }],
      updatedAt: 1500,
    },
  ];

  const cloud: TestPlaylist[] = [
    {
      id: 'p1',
      name: 'Chill Vibes',
      tracks: [{ id: 't1' }, { id: 't3' }], // Cloud has more tracks
      updatedAt: 2000,
    },
    {
      id: 'p3',
      name: 'Cloud Only',
      tracks: [{ id: 't4' }],
      updatedAt: 1800,
    },
  ];

  const merged = mergePlaylists(local, cloud);
  assert.equal(merged.length, 3);

  const p1 = merged.find((p) => p.id === 'p1');
  assert.ok(p1);
  assert.equal(p1.tracks.length, 2); // Cloud version with 2 tracks retained
});

function extractPlaylistId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{8,}$/.test(trimmed) && !trimmed.includes('http') && !trimmed.includes('/')) {
    return trimmed;
  }
  return null;
}

test('Playlist URL Extractor - parses YouTube & YouTube Music playlist links', () => {
  assert.equal(
    extractPlaylistId('https://music.youtube.com/playlist?list=PLVzxB_eTg1Mk&si=5y2Gu2khoIbQTizf'),
    'PLVzxB_eTg1Mk'
  );
  assert.equal(
    extractPlaylistId('https://www.youtube.com/playlist?list=PLrAlGQDn9TNdQ2R4Kq9u5eJcTqNnJt-rO'),
    'PLrAlGQDn9TNdQ2R4Kq9u5eJcTqNnJt-rO'
  );
  assert.equal(
    extractPlaylistId('https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL4fGSI1pDJn6jXS_PEoNxm64AmWQ4VcCa'),
    'PL4fGSI1pDJn6jXS_PEoNxm64AmWQ4VcCa'
  );
  assert.equal(extractPlaylistId('PLVzxB_eTg1Mk'), 'PLVzxB_eTg1Mk');
  assert.equal(extractPlaylistId('https://google.com'), null);
});

