const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/runtimeHarness.cjs');
const endpoint = (id, type) => ({ browseEndpoint: { browseId: id,
  browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: type } } } });
const info = label => [{ text: label }, { text: ' • ' },
  { text: 'Dua Lipa', navigationEndpoint: endpoint('UCartist', 'MUSIC_PAGE_TYPE_ARTIST') }, { text: ' • ' }, { text: '2024' }];
const row = (id, type = 'MUSIC_PAGE_TYPE_ALBUM') => ({ musicResponsiveListItemRenderer: {
  navigationEndpoint: endpoint(id, type), flexColumns: [
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Radical Optimism' }] } } },
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: info('Albüm') } } }],
  thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://art.invalid/album=w60-h60' }] } } },
} });
const searchPage = items => ({ contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: {
  content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: items } }] } } } }] } } });
const song = id => ({ musicResponsiveListItemRenderer: { playlistItemData: { videoId: id }, flexColumns: [
  { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: id }] } } },
  { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Dua Lipa' }] } } }],
  fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:21' }] } } }],
} });
const api = () => harness({ 'react-native': { Platform: { OS: 'test' }, NativeModules: {} } }).load('src/services/youtubeService.ts').YouTubeService;

async function withFetch(reply, run) {
  const old = global.fetch; const requests = [];
  global.fetch = async (url, options) => { const body = JSON.parse(options.body); requests.push(body); return reply(body, url); };
  try { await run(requests); } finally { global.fetch = old; }
}

test('album search uses the release filter and preserves case-sensitive browse ids and artist metadata', async () => {
  const id = 'MPREb_jpFXUk5ZtVc';
  await withFetch(() => Response.json(searchPage([row(id), row(id), row('UCchannel', 'MUSIC_PAGE_TYPE_ARTIST'), song('video')])), async requests => {
    const albums = await api().searchAlbums(' Dua Lipa ');
    assert.equal(requests[0].params, 'EgWKAQIYAWoKEAMQBBAJEAoQBQ%3D%3D');
    assert.equal(requests[0].query, 'Dua Lipa');
    assert.equal(albums.length, 1);
    assert.deepEqual(albums[0], { id, title: 'Radical Optimism', artist: 'Dua Lipa', year: '2024', releaseType: 'Albüm', thumbnailUrl: 'https://art.invalid/album=w500-h500' });
  });
});

test('two-row releases work, single and EP labels remain distinct, and artist links never become albums', async () => {
  const twoRow = label => ({ musicTwoRowItemRenderer: {
    title: { runs: [{ text: label, navigationEndpoint: endpoint('MPREb_'+label, 'MUSIC_PAGE_TYPE_ALBUM') }] },
    subtitle: { runs: info(label) }, thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [] } } },
  } });
  await withFetch(() => Response.json(searchPage([twoRow('Single'), twoRow('EP'), row('MPREb_wrong', 'MUSIC_PAGE_TYPE_ARTIST')])), async () => {
    assert.deepEqual((await api().searchAlbums('releases')).map(x => [x.id, x.releaseType, x.artist]), [['MPREb_Single','Single','Dua Lipa'],['MPREb_EP','EP','Dua Lipa']]);
  });
});

test('empty searches do not fabricate albums from songs, and HTTP failures remain failures', async () => {
  const service = api(); let songs = 0; service.search = async () => { songs++; return [{ id: 'video' }]; };
  await withFetch(() => Response.json(searchPage([])), async requests => {
    assert.deepEqual(await service.searchAlbums('nothing'), []);
    assert.equal(requests.length, 1); assert.equal(songs, 0);
  });
  await withFetch(() => new Response('', { status: 503 }), async () => {
    await assert.rejects(service.searchAlbums('offline'), /Albüm araması/); assert.equal(songs, 0);
  });
});

test('opening a search album browses the exact release and loads ordered tracks, header cover and year', async () => {
  const id = 'MPREb_jpFXUk5ZtVc';
  const header = { musicResponsiveHeaderRenderer: {
    title: { runs: [{ text: 'Radical Optimism' }] }, subtitle: { runs: [{ text: 'Albüm' }, { text: ' • ' }, { text: '2024' }] },
    straplineTextOne: { runs: info('Albüm') }, thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://art.invalid/cover' }] } } },
  } };
  await withFetch(body => Response.json(body.continuation
    ? { continuationContents: { musicShelfContinuation: { contents: [song('one'), song('two')] } } }
    : { contents: { twoColumnBrowseResultsRenderer: {
      tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicDescriptionShelfRenderer: {} }, header] } } } }],
      secondaryContents: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: [song('one')], continuations: [{ nextContinuationData: { continuation: 'page2' } }] } }] } },
    } } }), async requests => {
      const album = await api().getAlbum('search title', id);
      assert.equal(requests[0].browseId, id);
      assert.equal(album.title, 'Radical Optimism'); assert.equal(album.author, 'Dua Lipa');
      assert.equal(album.thumbnailUrl, 'https://art.invalid/cover'); assert.equal(album.year, '2024');
      assert.deepEqual(album.tracks.map(x => [x.id, x.duration]), [['one',201],['two',201]]);
  });
});

test('artist and video ids cannot be opened as albums, and query lookup uses real album ids', async () => {
  await withFetch(body => Response.json(body.query ? searchPage([row('MPREb_ExactId')]) : { contents: { musicShelfRenderer: { contents: [song('one')] } } }), async requests => {
    const service = api();
    assert.equal(await service.getAlbum('Artist', 'UCartistChannel'), null);
    assert.equal(await service.getAlbum('Video', 'abcdefghijk'), null);
    assert.equal(requests.length, 0);
    assert.equal((await service.getAlbum('Radical Optimism')).id, 'MPREb_ExactId');
    assert.equal(requests[1].browseId, 'MPREb_ExactId');
  });
});

test('an unavailable browse response is not presented as a successfully loaded empty album', async () => {
  await withFetch(() => Response.json({ error: { code: 404, message: 'Not found' } }), async () => {
    assert.equal(await api().getAlbum('Missing album', 'MPREb_Unavailable'), null);
  });
});
