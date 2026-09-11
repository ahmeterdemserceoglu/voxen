import test from 'node:test';
import assert from 'node:assert/strict';

interface MockTrack {
  id: string;
  artistName: string;
  title: string;
}

function diversify(tracks: MockTrack[], seenIds: Set<string>, maxPerArtist = 2): MockTrack[] {
  const artistCount: Record<string, number> = {};
  const result: MockTrack[] = [];
  for (const track of tracks) {
    if (seenIds.has(track.id)) continue;
    const count = artistCount[track.artistName] || 0;
    if (count >= maxPerArtist) continue;
    artistCount[track.artistName] = count + 1;
    seenIds.add(track.id);
    result.push(track);
  }
  return result;
}

test('Recommendation Diversification - caps max tracks per artist and filters seen IDs', () => {
  const incoming: MockTrack[] = [
    { id: '1', artistName: 'Artist A', title: 'Song 1' },
    { id: '2', artistName: 'Artist A', title: 'Song 2' },
    { id: '3', artistName: 'Artist A', title: 'Song 3' }, // should be excluded (cap 2)
    { id: '4', artistName: 'Artist B', title: 'Song 4' },
    { id: '5', artistName: 'Artist C', title: 'Song 5' },
  ];

  const seenIds = new Set<string>(['4']); // Artist B already seen
  const result = diversify(incoming, seenIds, 2);

  // Should have Song 1 and Song 2 (Artist A), and Song 5 (Artist C). Song 3 capped, Song 4 seen.
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((r) => r.id), ['1', '2', '5']);
});
