const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, pause } = require('./helpers/runtimeHarness.cjs');

test('account transitions isolate libraries, guest data and legacy caches, while preserving owner data', async () => {
  const h = harness();
  h.disk.set('@voxen_favorites', JSON.stringify([{ id: 'legacy-private' }]));
  await h.change(null);
  h.music.getState().toggleFavorite({ id: 'guest' });
  await h.change('alice');
  assert.deepEqual(h.music.getState().favorites, []);
  h.music.getState().toggleFavorite({ id: 'alice-private' });
  await h.music.getState().createPlaylist('Alice private playlist');
  await h.authStore.getState().signOut();
  assert.deepEqual(h.music.getState().favorites.map(t => t.id), ['guest']);
  await h.change('bob');
  assert.deepEqual(h.cloud.get('users/bob').favorites, []);
  assert.deepEqual(h.cloud.get('users/bob').playlists, []);
  await h.change('alice');
  assert.deepEqual(h.music.getState().favorites.map(t => t.id), ['alice-private']);
  assert.equal(h.music.getState().playlists.length, 1);
  await h.change('bob'); // direct switch, without logout
  assert.deepEqual(h.music.getState().favorites, []);
  assert.ok(h.disk.has('@voxen_favorites'));
});

test('delayed cloud reads cannot restore an old session, including Alice -> Bob -> Alice', async () => {
  const h = harness();
  await h.change('alice');
  const gate = pause();
  h.cloud.set('users/alice', { favorites: [{ id: 'stale' }], playlists: [] });
  h.hooks.cloudRead = ref => ref === 'users/alice' ? gate.promise : undefined;
  const oldSync = h.music.getState().syncWithCloud('alice');
  await h.change('bob');
  h.hooks.cloudRead = null;
  h.cloud.set('users/alice', { favorites: [{ id: 'fresh' }], playlists: [] });
  await h.change('alice');
  gate.resolve(); await oldSync;
  assert.deepEqual(h.music.getState().favorites.map(t => t.id), ['fresh']);
  assert.deepEqual(h.cloud.get('users/bob').favorites, []);
});

test('delayed local hydration cannot overwrite the new account or sibling stores', async () => {
  const h = harness();
  const gate = pause();
  h.disk.set('@voxen_playlists:account:user:alice', JSON.stringify([{ id: 'alice' }]));
  h.hooks.read = key => key.endsWith('user:alice') ? gate.promise : undefined;
  const oldLogin = h.change('alice');
  await h.change('bob');
  gate.resolve(); await oldLogin;
  assert.deepEqual(h.music.getState().playlists, []);
  assert.deepEqual(h.load('src/store/playlistStore.ts').usePlaylistStore.getState().playlists, []);
  assert.deepEqual(h.cloud.get('users/bob').playlists, []);
});

test('delayed playlist persistence stays in the initiating account and cannot trigger another account upload', async () => {
  const h = harness();
  await h.change('alice');
  const gate = pause();
  h.hooks.write = key => key.endsWith('user:alice') ? gate.promise : undefined;
  const pending = h.music.getState().createPlaylist('Alice only');
  await h.change('bob');
  const before = JSON.stringify(h.cloud.get('users/bob'));
  gate.resolve(); await pending;
  assert.equal(JSON.stringify(h.cloud.get('users/bob')), before);
  assert.deepEqual(h.music.getState().playlists, []);
  assert.match(h.disk.get('@voxen_playlists:account:user:alice'), /Alice only/);
});

test('profile writes project only intentionally public data and replace stale publications atomically', async () => {
  const h = harness();
  await h.change('alice');
  const service = h.load('src/services/firebase/firestoreService.ts').firestoreService;
  await service.updateUser('alice', {
    email: 'private@example.test', favorites: [{ id: 'secret' }], profileVisibility: 'public',
    playlists: [{ id: 'private', visibility: 'private' }, { id: 'unlisted', visibility: 'unlisted' }, { id: 'shared', visibility: 'public' }],
  });
  const published = h.cloud.get('publicProfiles/alice');
  assert.equal(published.email, undefined);
  assert.equal(published.favorites, undefined);
  assert.deepEqual(published.playlists.map(p => p.id), ['shared']);
  await h.change('bob');
  assert.deepEqual((await service.getUser('alice')).playlists.map(p => p.id), ['shared']);
  await h.change('alice');
  await service.updateUser('alice', { profileVisibility: 'private' });
  assert.deepEqual(h.cloud.get('publicProfiles/alice').playlists, []);
  assert.equal(h.cloud.get('users/alice').email, 'private@example.test');
  assert.equal(h.cloud.get('users/alice').playlists.length, 3);
});
