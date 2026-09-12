const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/runtimeHarness.cjs');

const song = (id, artist = id) => ({ id, title: id, artist, thumbnail: '', duration: 180 });

test('tracks from the same artist are separated when another artist is available', () => {
  const h = harness();
  const { spreadArtists } = h.load('src/services/recommendations/recommendationService.ts');
  const result = spreadArtists([
    song('a1', 'Muazzez Ersoy'), song('a2', 'Muazzez Ersoy'), song('a3', 'Muazzez Ersoy'),
    song('b1', 'Ajda Pekkan'), song('c1', 'Erol Evgin'),
  ]);
  assert.deepEqual(result.map(track => track.id), ['a1', 'b1', 'a2', 'c1', 'a3']);
  assert.ok(result.every((track, index) => index === 0 || track.artist !== result[index - 1].artist));
});

test('selected genres and followed artists drive discovery, with diverse song-only results', async () => {
  const queries = [];
  const h = harness({
    '../youtubeService': { YouTubeService: { search: async query => {
      queries.push(query);
      return [song(query), song('duplicate'), song('duplicate'), { ...song('spoken'), title: 'podcast' }, { ...song('long'), duration: 5000 }];
    } } },
  });
  const service = h.load('src/services/recommendations/recommendationService.ts').recommendationService;
  const results = await service.getDiscoveryFeed([], [], ['Chosen Artist'], ['Caz', 'Metal']);
  assert.deepEqual(queries, ['Caz', 'Metal', 'Chosen Artist benzer şarkılar']);
  assert.ok(results.some(track => track.id === 'Caz'));
  assert.ok(results.some(track => track.id === 'Metal'));
  assert.equal(results.filter(track => track.id === 'duplicate').length, 1);
  assert.ok(!results.some(track => ['spoken', 'long'].includes(track.id)));
});

test('daily mixes distribute distinct tracks and invalidate by preferences, feedback and account', async () => {
  const queries = [];
  const h = harness({ '../youtubeService': { YouTubeService: { search: async query => {
    queries.push(query); return Array.from({ length: 30 }, (_, i) => song(`song-${i}`));
  } } } });
  const service = h.load('src/services/recommendations/mixGenerator.ts').mixGenerator;
  const feedback = h.load('src/services/recommendations/recommendationFeedback.ts').recommendationFeedback;
  await h.change('alice');
  const mixes = await service.getDailyMixes(['Caz']);
  assert.equal(mixes.length, 5);
  assert.equal(new Set(mixes.flatMap(m => m.tracks.map(t => t.id))).size, 30);
  assert.ok(queries[0].startsWith('Caz'));
  await service.getDailyMixes(['Caz']);
  assert.equal(queries.length, 5);
  await service.getDailyMixes(['Metal']);
  assert.equal(queries.length, 10);
  assert.ok(queries[5].startsWith('Metal'));
  await feedback.block(song('song-0'));
  const blocked = await service.getDailyMixes(['Metal']);
  assert.equal(queries.length, 15);
  assert.ok(blocked.every(m => m.tracks.every(t => t.id !== 'song-0')));
  await h.change('bob');
  await service.getDailyMixes(['Caz']);
  assert.equal(queries.length, 20);
});

test('InnerTube follows returned automix endpoint and parses direct thumbnails without seed duplicates', async () => {
  const requests = [];
  const panel = contents => ({ contents: { singleColumnMusicWatchNextResultsRenderer: { tabbedRenderer: { watchNextTabbedResultsRenderer: { tabs: [
    { tabRenderer: { content: { musicQueueRenderer: { content: { playlistPanelRenderer: { contents } } } } } },
  ] } } } } });
  const h = harness({
    'react-native': { NativeModules: {}, Platform: { OS: 'android' } },
    './network/networkService': { networkFetch: async (_, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => requests.length === 1
        ? panel([{ automixPreviewVideoRenderer: { content: { automixPlaylistVideoRenderer: { navigationEndpoint: { watchPlaylistEndpoint: { playlistId: 'returned-radio', params: 'server-params' } } } } } }])
        : panel(['seed', 'next', 'next'].map(videoId => ({ playlistPanelVideoRenderer: { videoId, title: { runs: [{ text: videoId }] }, thumbnail: { thumbnails: [{ url: 'https://example.test/art.jpg' }] } } }))),
      };
    } },
  });
  const service = h.load('src/services/youtubeService.ts').YouTubeService;
  const tracks = await service.getAutomix('seed');
  assert.equal(requests[0].videoId, 'seed');
  assert.equal(requests[0].playlistId, undefined);
  assert.equal(requests[1].playlistId, 'returned-radio');
  assert.equal(requests[1].params, 'server-params');
  assert.deepEqual(tracks.map(track => track.id), ['next']);
  assert.equal(tracks[0].thumbnail, 'https://example.test/art.jpg');
});
