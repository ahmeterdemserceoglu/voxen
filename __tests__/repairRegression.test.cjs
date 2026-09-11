const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, pause } = require('./helpers/runtimeHarness.cjs');
const song = id => ({ id, title:id, artist:'Artist', thumbnail:'', duration:180 });

test('history clearing survives another play; disabled history and explicit content are respected', async () => {
  const h = harness(); await h.change('alice');
  await h.music.getState().playTrack(song('old'));
  h.load('src/store/libraryStore.ts').useLibraryStore.getState().clearHistory();
  await h.music.getState().playTrack(song('new'));
  assert.deepEqual(h.music.getState().history.map(t=>t.id), ['new']);
  await h.load('src/store/settingsStore.ts').useSettingsStore.getState().updateSettings({ historyEnabled:false, explicitContent:false });
  await h.music.getState().playTrack(song('unrecorded'));
  assert.deepEqual(h.music.getState().history.map(t=>t.id), ['new']);
  await h.music.getState().playTrack({ ...song('blocked'), explicit:true });
  assert.equal(h.music.getState().currentTrack.id, 'unrecorded');
  await h.music.getState().playTrack(song('first'), [song('first'),{...song('blocked'),explicit:true},song('last')]);
  h.music.getState().skipNext();
  assert.equal(h.music.getState().currentTrack.id, 'last');
});

test('download index serializes concurrent updates and stays isolated after account switches', async () => {
  const files = new Map();
  class Directory { exists=true; }
  class File {
    constructor(parent,name){this.uri=name?'file:///'+name:parent;}
    get exists(){return files.has(this.uri);} get size(){return files.get(this.uri)?.length || 0;}
    write(bytes){files.set(this.uri,bytes);} delete(){files.delete(this.uri);}
  }
  const h=harness({'expo-file-system':{Paths:{},File,Directory},
    './youtubeService':{YouTubeService:{getAudioStreamUrl:async()=>({uri:'https://audio.invalid'})}},
    '../utils/logger':{logger:{info(){},warn(){},error(){}}}});
  await h.change('alice');
  const service=h.load('src/services/offlineDownloadService.ts').offlineDownloadService;
  const original=global.fetch;
  try {
    global.fetch=async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mp4'}});
    await Promise.all([service.downloadTrack(song('one')),service.downloadTrack(song('two'))]);
    assert.deepEqual((await service.getDownloadedTracks()).map(x=>x.track.id).sort(),['one','two']);
    await h.change('bob');
    assert.deepEqual(await service.getDownloadedTracks(),[]);
    assert.equal(service.getDownloadEntry('one').state,'idle');
    await h.change('alice');
    assert.equal((await service.getDownloadedTracks()).length,2);
    const gate=pause();
    global.fetch=async()=>{await gate.promise;return new Response(new Uint8Array([1]));};
    const pending=service.downloadTrack(song('late'));
    await new Promise(r=>setImmediate(r));
    await h.change('bob'); gate.resolve();
    assert.equal(await pending,null);
    assert.deepEqual(await service.getDownloadedTracks(),[]);
    global.fetch=async()=>{const r=new Response(new Uint8Array([1]),{headers:{'Content-Type':'audio/mp4','Content-Length':'50'}});Object.defineProperty(r,'body',{value:null});return r;};
    assert.equal(await service.downloadTrack(song('truncated')),null);
    assert.equal(service.getDownloadEntry('truncated').state,'error');
  } finally {global.fetch=original;}
});

test('playlist and album browsing consume continuations, deduplicate and use album browse ids', async () => {
  const h=harness({'react-native':{Platform:{OS:'test'},NativeModules:{}}});
  const api=h.load('src/services/youtubeService.ts').YouTubeService;
  const item=id=>({musicResponsiveListItemRenderer:{playlistItemData:{videoId:id},flexColumns:[{musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:id}]}}}]}});
  const original=global.fetch; const bodies=[];
  try {
    global.fetch=async(_,options)=>{
      const body=JSON.parse(options.body);bodies.push(body);
      const data=body.continuation?{continuationContents:{musicPlaylistShelfContinuation:{contents:[item('one'),item('two')]}}}
        :{contents:{musicPlaylistShelfRenderer:{contents:[item('one')],continuations:[{nextContinuationData:{continuation:'page2'}}]}}};
      return new Response(JSON.stringify(data));
    };
    assert.deepEqual((await api.getPlaylist('PL12345678')).tracks.map(t=>t.id),['one','two']);
    assert.equal(bodies.length,2);
    bodies.length=0;
    assert.deepEqual((await api.getAlbum('Album','MPREb12345678')).tracks.map(t=>t.id),['one','two']);
    assert.equal(bodies[0].browseId,'MPREb12345678');
  } finally {global.fetch=original;}
});

test('following hydration cannot overwrite a switched account',async()=>{
  const gate=pause();let slow=false;
  const h=harness({'../services/social/socialService':{socialService:{
    getFollowing:async uid=>{if(slow && uid==='alice')await gate.promise;return [{uid:uid+'-friend'}];},getFollowers:async()=>[]}}});
  await h.change('alice');
  const social=h.load('src/store/socialStore.ts').useSocialStore;
  assert.equal(social.getState().followingUsers[0].uid,'alice-friend');
  slow=true;const old=h.change('alice');await new Promise(r=>setImmediate(r));
  await h.change('bob');gate.resolve();await old;
  assert.equal(social.getState().followingUsers[0].uid,'bob-friend');
});

test('cold widget action waits for account hydration and plays the last local track once',async()=>{
  let consumed=0;
  const h=harness({'react-native':{NativeModules:{VoxenWidget:{consumePendingAction:async()=>{consumed++;return 'playPause';}}},DeviceEventEmitter:{addListener:()=>({remove(){}})}}});
  const service=h.load('src/services/widget/widgetService.ts').widgetService;
  const stop=service.init();assert.equal(consumed,0);
  h.music.setState({history:[song('resume')],accountReady:true});
  await new Promise(r=>setImmediate(r));
  assert.equal(h.music.getState().currentTrack.id,'resume');assert.equal(consumed,1);
  stop();
});
