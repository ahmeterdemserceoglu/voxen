const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/runtimeHarness.cjs');
const track = id => ({ id, title: id, artist: 'Artist', thumbnail: '' });

test('play-next preserves current index and retry creates a fresh playback revision', async () => {
  const h = harness();
  const [a,b,c] = ['a','b','c'].map(track);
  await h.music.getState().playTrack(b, [a,b,c]);
  h.music.getState().playNext(a);
  assert.deepEqual(h.music.getState().queue.map(t => t.id), ['b','a','c']);
  assert.equal(h.music.getState().queueIndex, 0);
  h.music.getState().playNext(b);
  assert.equal(h.music.getState().queueIndex, 0);
  h.music.getState().skipNext();
  assert.equal(h.music.getState().currentTrack.id, 'a');
  const revision = h.music.getState().playbackRevision;
  h.music.setState({ streamError: 'failed', isPlaying: false });
  h.music.getState().togglePlayPause();
  assert.equal(h.music.getState().playbackRevision, revision + 1);
  assert.equal(h.music.getState().streamError, null);
});

test('restored playback keeps queue, position and duration but waits for the native playing state', async () => {
  const h = harness();
  const a = track('a'), b = { ...track('b'), duration: 180 };
  h.music.setState({ currentTrack: b, queue: [a, b], queueIndex: 1, position: 42000, duration: 180000, isPlaying: true });
  await h.music.getState().saveSession();
  h.music.setState({ currentTrack: null, queue: [], queueIndex: 0, position: 0, duration: 0, isPlaying: true });
  await h.music.getState().restoreSession();
  assert.deepEqual(h.music.getState().queue.map(item => item.id), ['a', 'b']);
  assert.equal(h.music.getState().queueIndex, 1);
  assert.equal(h.music.getState().position, 42000);
  assert.equal(h.music.getState().duration, 180000);
  assert.equal(h.music.getState().isPlaying, false);
});

test('shuffle adds recommendations outside the library and keeps the current song first', async () => {
  const added = track('recommended');
  const h = harness({
    '../services/recommendations/recommendationService': {
      recommendationService: { getRelatedTracks: async () => [added] },
    },
  });
  const a = track('a'), b = track('b');
  await h.music.getState().playTrack(a, [a, b]);
  h.music.getState().toggleShuffle();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.music.getState().shuffle, true);
  assert.equal(h.music.getState().queue[0].id, 'a');
  assert.ok(h.music.getState().queue.some(item => item.id === 'recommended'));
  const nextId = h.music.getState().queue[1].id;
  h.music.getState().skipNext();
  assert.equal(h.music.getState().currentTrack.id, nextId);
});

test('offline deletions survive stale cloud data, relogin and stale device uploads; re-liking works', async () => {
  const h = harness(); await h.change('a');
  const song = track('song');
  h.music.getState().toggleFavorite(song);
  const id = await h.music.getState().createPlaylist('List');
  await h.music.getState().addTrackToPlaylist(id, song);
  await h.music.getState().pushCloudData();
  const stale = structuredClone(h.cloud.get('users/a'));
  h.music.setState({ accountReady: false });
  h.music.getState().toggleFavorite(song);
  await h.music.getState().deletePlaylist(id);
  await h.change(null); await h.change('a');
  assert.deepEqual(h.music.getState().favorites, []);
  assert.deepEqual(h.music.getState().playlists, []);
  await h.load('src/services/firebase/firestoreService.ts').firestoreService.updateUser('a', stale);
  assert.deepEqual(h.cloud.get('users/a').favorites, []);
  assert.deepEqual(h.cloud.get('users/a').playlists, []);
  h.music.getState().toggleFavorite(song);
  await h.music.getState().pushCloudData();
  await h.music.getState().syncWithCloud();
  assert.equal(h.music.getState().favorites[0].id, song.id);
  const merge = h.load('src/services/sync/mergeLibrary.ts').mergeLibrary;
  const result = merge({ favorites: [], playlists: [{ id:'p', updatedAt:20, tracks:[] }] },
    { favorites: [], playlists: [{ id:'p', updatedAt:10, tracks:[song] }] });
  assert.deepEqual(result.playlists[0].tracks, []);
});

test('downloads preserve binary bytes in streaming and fallback paths without a second request', async () => {
  const files = new Map();
  class Directory { exists = true; constructor() {} }
  class File {
    constructor(parent, name) { this.uri = name ? 'file:///' + name : parent; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length || 0; }
    write(bytes) { assert.ok(bytes instanceof Uint8Array); files.set(this.uri, bytes); }
    delete() { files.delete(this.uri); }
  }
  const h = harness({
    'expo-file-system': { Paths: {}, File, Directory },
    './youtubeService': { YouTubeService: { getAudioStreamUrl: async () => ({ uri:'https://audio.invalid', headers:{ test:'header' } }) } },
    '../utils/logger': { logger: { info() {}, warn() {}, error() {} } },
  });
  const service = h.load('src/services/offlineDownloadService.ts').offlineDownloadService;
  const originalFetch = global.fetch;
  const bytes = new Uint8Array([0, 255, 128, 42]);
  let calls = 0;
  try {
    for (const streaming of [true, false]) {
      global.fetch = async (_, options) => {
        calls++; assert.equal(options.headers.test, 'header');
        const response = new Response(bytes, { headers: { 'Content-Type':'audio/mp4' } });
        if (!streaming) Object.defineProperty(response, 'body', { value:null });
        return response;
      };
      const result = await service.downloadTrack(track(String(streaming)));
      assert.ok(result);
      assert.deepEqual(files.get(result.localUri), bytes);
      assert.equal(service.getDownloadEntry(String(streaming)).state, 'done');
    }
    assert.equal(calls, 2);
    global.fetch = async () => new Response('<html>error</html>', { headers: { 'Content-Type':'text/html' } });
    assert.equal(await service.downloadTrack(track('bad')), null);
    assert.equal(service.getDownloadEntry('bad').state, 'error');
  } finally { global.fetch = originalFetch; }
});

test('concurrent taste events accumulate instead of overwriting each other', async () => {
  const h = harness();
  const service = h.load('src/services/recommendations/tasteProfileService.ts').tasteProfileService;
  await Promise.all([service.record('PLAY','Artist',undefined,'a'), service.record('COMPLETE','Artist',undefined,'a')]);
  assert.equal((await service.get()).tracks.a, 4);
});
