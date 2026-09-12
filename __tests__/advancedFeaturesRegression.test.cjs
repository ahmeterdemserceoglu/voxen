const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, pause } = require('./helpers/runtimeHarness.cjs');
const song = (id, artist=id) => ({ id, title:id, artist, duration:180, thumbnail:'' });

test('saving albums persists full metadata and stays isolated between accounts', async()=>{
 const h=harness(); await h.change('alice'); const lib=h.load('src/store/libraryStore.ts').useLibraryStore;
 lib.getState().saveAlbum({id:'MPREb_album',title:'Album',author:'Artist',tracks:[song('one')]});
 await new Promise(r=>setImmediate(r)); await h.change('bob'); assert.deepEqual(lib.getState().savedAlbums,[]);
 await h.change('alice'); assert.equal(lib.getState().savedAlbums[0].tracks[0].id,'one');
 lib.getState().removeAlbum('MPREb_album'); await new Promise(r=>setImmediate(r)); await h.change('bob'); await h.change('alice'); assert.deepEqual(lib.getState().savedAlbums,[]);
});

test('queue removal undo preserves the current song and seek position without duplicating entries', async()=>{
 const h=harness(); await h.change('alice'); await h.music.getState().playTrack(song('one'),[song('one'),song('two'),song('three')]);
 h.music.setState({position:42000}); h.music.getState().removeFromQueue('two'); h.music.getState().undoQueueRemoval(); h.music.getState().undoQueueRemoval();
 assert.deepEqual(h.music.getState().queue.map(t=>t.id),['one','two','three']); assert.equal(h.music.getState().position,42000); assert.equal(h.music.getState().currentTrack.id,'one');
});

test('explicit song and artist exclusions persist, reset and never leak to another account',async()=>{
 const h=harness(); await h.change('alice'); const f=h.load('src/services/recommendations/recommendationFeedback.ts').recommendationFeedback;
 await Promise.all([f.block(song('one','Singer')),f.block(song('two','Blocked Artist'),true)]);
 let data=await f.load(); assert.equal(f.allowed(song('one','Singer'),data),false); assert.equal(f.allowed(song('other',' blocked ARTIST '),data),false);
 await h.change('bob'); assert.equal(f.allowed(song('one','Singer'),await f.load()),true);
 await h.change('alice'); assert.equal(f.allowed(song('one','Singer'),await f.load()),false);
 await f.reset(); assert.equal(f.allowed(song('one','Singer'),await f.load()),true);
});

test('daily mixes fairly share overlapping sources without repeating tracks across mixes',()=>{
 const h=harness(); const {distributeMixTracks}=h.load('src/services/recommendations/mixGenerator.ts');
 const tracks=Array.from({length:30},(_,i)=>song('id'+i)); const mixes=distributeMixTracks([tracks,tracks,tracks,tracks,tracks]);
 assert.deepEqual(mixes.map(list=>list.length),[6,6,6,6,6]); assert.equal(new Set(mixes.flat().map(t=>t.id)).size,30);
});

test('native background download results reconcile after restart and retain account ownership',async()=>{
 const jobs={}; const files=new Map(); let active=0; let max=0;
 class Directory{exists=true;} class File{constructor(parent,name){this.uri=name?'file:///'+name:parent;}get exists(){return files.has(this.uri);}get size(){return files.get(this.uri)||0;}}
 const native={results:async()=>JSON.stringify(jobs),acknowledge:key=>{delete jobs[key];},cancelAll(){},download:async(json,uri)=>{
   active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));const job={...JSON.parse(json),uri,state:'done',sizeBytes:3};jobs[job.key]=job;files.set(uri,3);active--;return JSON.stringify(job);
 }};
 const h=harness({'expo-file-system':{Paths:{},Directory,File},'react-native':{NativeModules:{VoxenDownloader:native}}}); await h.change('alice');
 const service=h.load('src/services/offlineDownloadService.ts').offlineDownloadService;
 const result=await service.downloadMany([song('one'),song('two'),song('one'),song('three')]);assert.equal(result.completed,3);assert.equal(result.failed,0);assert.ok(max<=2);
 assert.equal((await service.getDownloadedTracks()).length,3);
 files.set('file:///cold',5);jobs.cold={key:'cold',owner:'alice',track:song('cold'),uri:'file:///cold',state:'done',sizeBytes:5};
 await h.change('bob');assert.deepEqual(await service.getDownloadedTracks(),[]);assert.ok(jobs.cold);
 await h.change('alice');assert.ok((await service.getDownloadedTracks()).some(item=>item.track.id==='cold'));assert.ok(!jobs.cold);
});

test('widget queue action opens the queue without starting a saved song',async()=>{
 let listener; const h=harness({'react-native':{NativeModules:{VoxenWidget:{}},DeviceEventEmitter:{addListener:(_,fn)=>{listener=fn;return {remove(){}};}}}});
 await h.change('alice'); h.music.setState({history:[song('saved')]});const service=h.load('src/services/widget/widgetService.ts').widgetService;const stop=service.init();
 listener('queue');assert.equal(h.load('src/store/uiStore.ts').useUiStore.getState().activeModal,'queue');assert.equal(h.music.getState().currentTrack,null);stop();
});


test('stopping a bulk download does not start the remaining album tracks', async () => {
  const h = harness({'react-native':{NativeModules:{},Platform:{OS:'android'}},'expo-file-system':{Paths:{},Directory:class{exists=true;},File:class{exists=false;}}});
  const service = h.load('src/services/offlineDownloadService.ts').offlineDownloadService;
  const pending = pause(); let started = 0;
  service.downloadTrack = async () => { started++; await pending.promise; return null; };
  const batch = service.downloadMany(Array.from({length:10}, (_,i)=>song(`batch-${i}`)));
  await new Promise(r=>setImmediate(r)); assert.equal(started,2);
  service.cancelAllDownloads(); pending.resolve(); await batch;
  assert.equal(started,2);
});
