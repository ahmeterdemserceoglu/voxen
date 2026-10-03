const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { harness, pause } = require('./helpers/runtimeHarness.cjs');
const track = id => ({ id, title:id, artist:'Artist', thumbnail:'https://example.com/art.jpg' });

test('desktop downloads share listing requests, prefer local media, and invalidate after deletion', async () => {
  const h = harness(); await h.change('alice');
  const service = h.load('src/services/offlineDownloadService.web.ts').offlineDownloadService;
  const original = global.fetch; let calls = 0;
  global.fetch = async url => { calls++; return Response.json({items:[{track:track('local'), localUri:'/api/download/file?id=local',sizeBytes:4}]}); };
  try {
    const values = await Promise.all([service.getLocalUri('local'), service.isDownloaded('local'), service.getStorageUsedBytes()]);
    assert.deepEqual(values, ['/api/download/file?id=local',true,4]); assert.equal(calls,1);
    await service.deleteDownloadedTrack('local'); await service.getDownloadedTracks(); assert.equal(calls,3);
  } finally { global.fetch = original; }
});

test('desktop bulk cancellation stops workers and account switches discard late results', async () => {
  const h = harness(); await h.change('alice');
  const service = h.load('src/services/offlineDownloadService.web.ts').offlineDownloadService;
  const original = global.fetch; const posts = []; const pending = [];
  global.fetch = (url, options = {}) => {
    if (options.method !== 'POST') return Promise.resolve(Response.json({items:[]}));
    posts.push(JSON.parse(options.body)); const gate = pause(); pending.push(gate);
    return gate.promise.then(() => Response.json({item:{track:JSON.parse(options.body).track,localUri:'/file',sizeBytes:4}}));
  };
  try {
    const batch = service.downloadMany(['a','b','c','d'].map(track)); await new Promise(r=>setImmediate(r));
    assert.equal(posts.length,2); service.cancelAllDownloads(); pending.forEach(g=>g.resolve()); await batch;
    assert.equal(posts.length,2); assert.ok(service.getAllEntries().every(e=>e.state==='cancelled'));
    const late = service.downloadTrack(track('late')); await new Promise(r=>setImmediate(r)); await h.change('bob');
    pending.at(-1).resolve(); assert.equal(await late,null); assert.deepEqual(service.getAllEntries(),[]);
  } finally { global.fetch=original; service.cancelAllDownloads(); }
});

test('audio playback joins prefetch and ignores cache results invalidated during a request', async () => {
  const gate = pause(); let calls=0;
  const h = harness({'./youtubeService':{YouTubeService:{getAudioStreamUrl:async()=>{calls++;await gate.promise;return{uri:'/audio'};}}}});
  const cache = h.load('src/services/audioCacheService.ts').audioCacheService;
  const prefetch=cache.prefetchNext('video'); const playback=cache.resolve('video'); assert.equal(calls,1);
  gate.resolve(); await prefetch; assert.deepEqual(await playback,{uri:'/audio'}); assert.deepEqual(cache.get('video'),{uri:'/audio'});
  cache.clear(); assert.equal(cache.get('video'),null);
});

test('Windows downloads validate complete binary files, ranges, retries and account ownership', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'voxen-desktop-download-test-'));
  process.env.VOXEN_DATA_ROOT=root; process.env.VOXEN_PLAYER_PORT='0';
  const backend=require('../windows-player/server');
  const data=Uint8Array.from([0,255,128,40,5,6]); let truncated=false; let resolverGate;
  const resolver=async()=>{if(resolverGate)await resolverGate.promise;return{url:'https://fixture.invalid/audio',mime:'audio/mp4'};};
  const server=http.createServer((req,res)=> {
    if(req.url==='/fixture') backend.downloadTrack(req,res,{resolveAudio:resolver,fetch:async()=>new Response(data,{headers:{'Content-Type':'audio/mp4','Content-Length':String(truncated?data.length+2:data.length)}})}).catch(e=>{if(!res.destroyed){res.writeHead(502);res.end(e.message);}});
    else backend.server.emit('request',req,res);
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  const download=(id,owner='alice')=>fetch(origin+'/fixture',{method:'POST',body:JSON.stringify({owner,track:track(id)})});
  try {
    assert.equal((await download('good')).status,200); assert.equal(backend.readDownloads('alice').length,1); assert.equal(backend.readDownloads('bob').length,0);
    const uri=origin+'/api/download/file?owner=alice&id=good';
    assert.deepEqual(new Uint8Array(await (await fetch(uri)).arrayBuffer()),data);
    const range=await fetch(uri,{headers:{Range:'bytes=-2'}}); assert.equal(range.status,206); assert.deepEqual(new Uint8Array(await range.arrayBuffer()),data.slice(-2));
    assert.equal((await fetch(uri,{headers:{Range:'bytes=99-100'}})).status,416);
    assert.equal((await fetch(uri,{method:'HEAD'})).headers.get('content-length'),'6');
    truncated=true; assert.equal((await download('broken')).status,502); assert.equal(backend.readDownloads('alice').length,1);
    assert.equal(backend.downloadStatus('alice').find(e=>e.trackId==='broken').state,'error');
    assert.ok(!fs.readdirSync(path.join(root,'downloads','alice')).some(name=>name.endsWith('.part')));
    truncated=false; assert.equal((await download('broken')).status,200); assert.equal(backend.readDownloads('alice').length,2);
    await fetch(origin+'/api/download?owner=alice&id=good',{method:'DELETE'}); assert.equal((await fetch(uri)).status,404);
    resolverGate=pause(); const delayed=download('slow');
    while(!backend.downloadStatus('alice').some(e=>e.trackId==='slow'))await new Promise(r=>setTimeout(r,5));
    assert.equal((await download('slow')).status,409);
    await fetch(origin+'/api/download/job?owner=alice&id=slow',{method:'DELETE'});resolverGate.resolve();
    assert.equal((await delayed).status,502);assert.equal(backend.downloadStatus('alice').find(e=>e.trackId==='slow').state,'cancelled');
    resolverGate=pause();const discarded=download('discard');
    while(!backend.downloadStatus('alice').some(e=>e.trackId==='discard'))await new Promise(r=>setTimeout(r,5));
    await fetch(origin+'/api/download/partials?owner=alice',{method:'DELETE'});resolverGate.resolve();await discarded;
    assert.ok(!backend.downloadStatus('alice').some(e=>e.trackId==='discard'||e.trackId==='slow'));
  } finally { await new Promise(r=>server.close(r)); fs.rmSync(root,{recursive:true,force:true}); }
});
