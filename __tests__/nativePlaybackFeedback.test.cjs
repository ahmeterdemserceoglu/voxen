const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, pause } = require('./helpers/runtimeHarness.cjs');
const fs = require('node:fs');
const path = require('node:path');

test('native progress snapshots read ExoPlayer state on the Android UI thread', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/com/voxen/music/playback/VoxenPlaybackModule.kt'), 'utf8');
  const statusMethod = source.slice(source.indexOf('fun getStatus'), source.indexOf('@ReactMethod fun addListener'));
  assert.match(statusMethod, /runOnUiQueueThread[\s\S]*refreshState\(\)[\s\S]*promise\.resolve/);
});

test('native reports never echo commands and pending queues keep the latest play intent', async () => {
  const cleanups = [];
  const commands = [];
  let report;
  const pending = pause();
  const store = () => h.music.getState();
  store.getState = () => h.music.getState();
  store.setState = value => h.music.setState(value);
  store.subscribe = fn => h.music.subscribe(fn);
  const native = {
    getStatus: async () => ({ serviceAvailable: false }),
    play: () => commands.push('play'),
    pause: () => commands.push('pause'),
    setQueue: (...args) => commands.push(args),
  };
  const h = harness({
    '../store/musicStore': { useMusicStore: store },
    react: {
      useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
      createElement: type => type,
    },
    'react-native': {
      Platform: { OS: 'android' }, NativeModules: { VoxenPlayback: native },
      NativeEventEmitter: class { addListener(_, fn) { report = fn; return { remove() {} }; } },
    },
    'expo-audio': { setAudioModeAsync: async () => {} },
    '../services/youtubeService': {},
    '../services/offlineDownloadService': { offlineDownloadService: { getLocalUri: () => pending.promise } },
    '../services/audioCacheService': {},
    '../services/widget/widgetService': { widgetService: { update() {} } },
  });
  const a = { id: 'a', title: 'a' }, b = { id: 'b', title: 'b' };
  h.music.setState({ currentTrack: a, queue: [a, b], queueIndex: 0, isPlaying: true });
  try {
    h.load('src/components/AudioEngine.tsx').AudioEngine()();
    await new Promise(resolve => setImmediate(resolve));
    report({ trackId: 'b', queueIndex: 1, wantsToPlay: false });
    assert.equal(h.music.getState().currentTrack.id, 'a');
    report({ trackId: 'a', queueIndex: 0, wantsToPlay: false });
    report({ trackId: 'a', queueIndex: 0, wantsToPlay: true });
    assert.deepEqual(commands, []);
    h.music.setState({ isPlaying: false });
    assert.deepEqual(commands, ['pause']);
    pending.resolve(null);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(commands.length, 2);
    assert.equal(commands[1][2], false);
    report({ trackId: 'b', queueIndex: 1, wantsToPlay: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.music.getState().currentTrack.id, 'b');
    assert.equal(commands.length, 2);
    h.music.setState({ isPlaying: false });
    h.music.setState({ isPlaying: true });
    assert.deepEqual(commands.slice(2), ['pause', 'play']);
    h.music.setState({ currentTrack: a, queueIndex: 0 });
    report({ trackId: 'b', queueIndex: 1, wantsToPlay: true });
    assert.equal(h.music.getState().currentTrack.id, 'a');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(commands.length, 5);
    report({ trackId: 'a', queueIndex: 1, wantsToPlay: true });
    assert.equal(h.music.getState().currentTrack.id, 'a');
    assert.equal(h.music.getState().queueIndex, 0);
    assert.equal(commands.length, 5);
  } finally { cleanups.reverse().forEach(fn => fn()); }
});
