import test from 'node:test';
import assert from 'node:assert/strict';

interface TrackItem {
  id: string;
  title: string;
}

function mergeFavorites(local: TrackItem[], cloud: TrackItem[]): TrackItem[] {
  const map = new Map<string, TrackItem>();
  local.forEach((t) => map.set(t.id, t));
  cloud.forEach((t) => map.set(t.id, t));
  return Array.from(map.values());
}

test('Likes Merge - two-way set union without duplicates', () => {
  const local = [
    { id: '1', title: 'Track 1' },
    { id: '2', title: 'Track 2' },
  ];
  const cloud = [
    { id: '2', title: 'Track 2' },
    { id: '3', title: 'Track 3' },
  ];

  const merged = mergeFavorites(local, cloud);
  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map((m) => m.id).sort(),
    ['1', '2', '3']
  );
});
