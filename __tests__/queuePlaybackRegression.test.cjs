const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/runtimeHarness.cjs');
const song = id => ({ id, title: id, artist: 'Artist', duration: 180 });
const tick = () => new Promise(resolve => setImmediate(resolve));

function engine() {
  let h, report;
  const commands = [], cleanups = [];
  const store = () => h.music.getState();
  store.getState = () => h.music.getState(); store.setState = value => h.music.setState(value); store.subscribe = fn => h.music.subscribe(fn);
  const native = {
    getStatus: async () => ({ serviceAvailable: false }),
    setQueue: (...args) => commands.push(['queue', ...args]),
    setRepeatMode: mode => commands.push(['repeat', mode]),
    play: () => commands.push(['play']), pause: () => commands.push(['pause']),
    stop: () => commands.push(['stop']), seek: value => commands.push(['seek', value]),
  };
  h = harness({
    '../store/musicStore': { useMusicStore: store },
    react: { useEffect: fn => { const stop = fn(); if (stop) cleanups.push(stop); }, createElement: type => type },
    'react-native': { Platform: { OS: 'android' }, NativeModules: { VoxenPlayback: native }, NativeEventEmitter: class { addListener(_, fn) { report = fn; return { remove() {} }; } } },
    'expo-audio': { setAudioModeAsync: async () => {} }, '../services/youtubeService': {},
    '../services/offlineDownloadService': { offlineDownloadService: { getLocalUri: async () => null } },
    '../services/audioCacheService': {}, '../services/widget/widgetService': { widgetService: { update() {} } },
  });
  const [a,b,c,d] = ['a','b','c','d'].map(song);
  h.music.setState({ currentTrack: b, queue: [a,b,c,d], queueIndex: 1, isPlaying: true, position: 42000, duration: 180000 });
  h.load('src/components/AudioEngine.tsx').AudioEngine()();
  return { h, commands, report: status => report(status), stop: () => cleanups.reverse().forEach(fn => fn()), queues: () => commands.filter(c => c[0] === 'queue') };
}

test('queue edits reach Android without restarting the current song or losing progress', async () => {
  const e = engine();
  try {
    await tick();
    e.h.music.getState().moveQueueItem(3, 2); await tick();
    const command = e.queues().at(-1);
    assert.deepEqual(JSON.parse(command[1]).map(t => t.id), ['a','b','d','c']);
    assert.equal(command[2], 1); assert.equal(command[5], 42000); assert.equal(command[6], false);
    assert.equal(e.h.music.getState().currentTrack.id, 'b'); assert.equal(e.h.music.getState().position, 42000);
    e.h.music.getState().removeFromQueue('a'); await tick();
    assert.equal(e.h.music.getState().queueIndex, 0);
    assert.equal(e.queues().at(-1)[2], 0);
  } finally { e.stop(); }
});

test('clearing upcoming music keeps the current song playing at the same position', async () => {
  const e = engine();
  try {
    await tick(); e.h.music.getState().clearQueue(); await tick();
    assert.deepEqual(e.h.music.getState().queue.map(t => t.id), ['b']);
    assert.equal(e.h.music.getState().isPlaying, true); assert.equal(e.h.music.getState().position, 42000);
    assert.equal(e.queues().at(-1)[6], false); assert.ok(!e.commands.some(c => c[0] === 'stop'));
  } finally { e.stop(); }
});

test('retrying the same song sends a replacement command and repeat modes reach Android', async () => {
  const e = engine();
  try {
    await tick(); const state = e.h.music.getState();
    await state.playTrack(state.currentTrack, state.queue); await tick();
    assert.equal(e.queues().at(-1)[6], true); assert.equal(e.queues().at(-1)[5], 0);
    e.h.music.getState().setRepeatMode('one');
    assert.deepEqual(e.commands.at(-1), ['repeat', 'one']);
  } finally { e.stop(); }
});

test('old source snapshots cannot overwrite a seek or a newer queue command', async () => {
  const e = engine();
  try {
    await tick();
    const old = e.queues().at(-1)[7];
    e.h.music.getState().seekTo(90000);
    e.report({ trackId:'b', commandId:old, wantsToPlay:true, position:42000, duration:180000 });
    assert.equal(e.h.music.getState().position, 90000);
    e.report({ trackId:'b', commandId:old, wantsToPlay:true, position:90000, duration:180000 });
    assert.equal(e.h.music.getState().position, 90000);
    e.h.music.getState().moveQueueItem(3,2); await tick();
    e.report({ trackId:'a', commandId:old, wantsToPlay:true, position:1000 });
    assert.equal(e.h.music.getState().currentTrack.id, 'b');
  } finally { e.stop(); }
});

test('removing the selected song while paused selects a successor without auto-playing', async () => {
  const h = harness();
  h.music.setState({ currentTrack:song('a'), queue:[song('a'),song('b')], queueIndex:0, isPlaying:false, position:42000 });
  h.music.getState().removeFromQueue('a');
  assert.equal(h.music.getState().currentTrack.id, 'b'); assert.equal(h.music.getState().isPlaying,false);
  h.music.getState().removeFromQueue('b');
  assert.equal(h.music.getState().currentTrack,null); assert.equal(h.music.getState().isBuffering,false);
});

test('queue edits survive session restoration and play-next moves an existing song only once', async () => {
  const h = harness();
  h.music.setState({ currentTrack:song('a'), queue:[song('a'),song('b'),song('c')], queueIndex:0, isPlaying:true, position:42000 });
  h.music.getState().playNext(song('c'));
  h.music.getState().playNext(song('c'));
  await h.music.getState().saveSession();
  h.music.setState({ currentTrack:null,queue:[],position:0 });
  await h.music.getState().restoreSession();
  assert.deepEqual(h.music.getState().queue.map(t => t.id), ['a','c','b']);
  assert.equal(h.music.getState().position,42000); assert.equal(h.music.getState().isPlaying,false);
});

test('duplicate source entries normalize to stable identities and disabling shuffle restores order', async () => {
  const h = harness({ '../services/recommendations/recommendationService': { recommendationService: { getRelatedTracks: async () => [] } } });
  const [a,b,c] = ['a','b','c'].map(song);
  await h.music.getState().playTrack(b,[a,b,a,c]);
  assert.deepEqual(h.music.getState().queue.map(t=>t.id),['a','b','c']);
  h.music.setState({ position:42000 });
  h.music.getState().toggleShuffle();
  h.music.getState().toggleShuffle();
  assert.deepEqual(h.music.getState().queue.map(t=>t.id),['a','b','c']);
  assert.equal(h.music.getState().queueIndex,1);
  assert.equal(h.music.getState().position,42000);
});

test('recovering a failed source reloads it at the saved position', async () => {
  const e = engine();
  try {
    await tick();
    e.h.music.setState({ streamError:'expired',isPlaying:false,position:42000 });
    e.h.music.getState().togglePlayPause(); await tick();
    assert.equal(e.h.music.getState().position,42000);
    assert.equal(e.h.music.getState().streamError,null);
    assert.equal(e.queues().at(-1)[5],42000);
    assert.equal(e.queues().at(-1)[6],true);
  } finally { e.stop(); }
});

test('repeat and shuffle restore with the session, and an empty queue does not resurrect deleted tracks', async () => {
  const h = harness({ '../services/recommendations/recommendationService': { recommendationService: { getRelatedTracks: async () => [] } } });
  await h.music.getState().playTrack(song('a'),[song('a'),song('b')]);
  h.music.getState().setRepeatMode('all');
  h.music.getState().toggleShuffle();
  await h.music.getState().saveSession();
  h.music.setState({ repeatMode:'off',shuffle:false,shuffleOrder:null });
  await h.music.getState().restoreSession();
  assert.equal(h.music.getState().repeatMode,'all');
  assert.equal(h.music.getState().shuffle,true);
  h.music.getState().removeFromQueue('a'); h.music.getState().removeFromQueue('b');
  await h.music.getState().saveSession();
  await h.music.getState().restoreSession();
  assert.equal(h.music.getState().currentTrack,null); assert.deepEqual(h.music.getState().queue,[]);
});
