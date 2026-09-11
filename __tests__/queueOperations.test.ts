import test from 'node:test';
import assert from 'node:assert/strict';

function makeTrack(id: string, title: string) {
  return {
    id,
    videoId: id,
    title,
    artist: 'Artist',
    artistName: 'Artist',
    artists: [{ name: 'Artist' }],
    thumbnail: '',
    thumbnails: {},
    source: 'youtube' as const,
  };
}

test('Queue Operations - Next / Previous / Shuffle logic', () => {
  const queue = [
    makeTrack('1', 'Song 1'),
    makeTrack('2', 'Song 2'),
    makeTrack('3', 'Song 3'),
  ];

  // Sequential Next
  let currentIndex = 0;
  let nextIndex = (currentIndex + 1) % queue.length;
  assert.equal(nextIndex, 1);
  assert.equal(queue[nextIndex].id, '2');

  // Repeat All from end
  currentIndex = 2;
  nextIndex = (currentIndex + 1) % queue.length;
  assert.equal(nextIndex, 0);
  assert.equal(queue[nextIndex].id, '1');

  // Previous from first item (loops around)
  currentIndex = 0;
  const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
  assert.equal(prevIndex, 2);
  assert.equal(queue[prevIndex].id, '3');
});
