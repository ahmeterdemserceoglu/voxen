const test = require('node:test');
const assert = require('node:assert/strict');
const {harness}=require('./helpers/runtimeHarness.cjs');
const song=(id,artist='Singer')=>({id,videoId:id,title:id,artist,duration:120,thumbnail:''});
const endpoint=(id,type='MUSIC_PAGE_TYPE_ALBUM')=>({browseEndpoint:{browseId:id,browseEndpointContextSupportedConfigs:{browseEndpointContextMusicConfig:{pageType:type}}}});
const albumRun=(id='MPREb_Release',title='Real Album')=>({text:title,navigationEndpoint:endpoint(id)});
const panel=contents=>({contents:{singleColumnMusicWatchNextResultsRenderer:{tabbedRenderer:{watchNextTabbedResultsRenderer:{tabs:[{tabRenderer:{content:{musicQueueRenderer:{content:{playlistPanelRenderer:{contents}}}}}}]}}}}});
const api=reply=>harness({'react-native':{NativeModules:{},Platform:{OS:'android'}},'./network/networkService':{networkFetch:async(url,options)=>Response.json(reply(JSON.parse(options.body),url))}}).load('src/services/youtubeService.ts').YouTubeService;

test('related browse keeps endpoint params, finds nested shelves and excludes albums, seed and duplicates',async()=>{
 const requests=[];
 const row=id=>({musicTwoRowItemRenderer:{title:{runs:[{text:id}]},navigationEndpoint:{watchEndpoint:{videoId:id}},subtitle:{runs:[{text:'Singer'}]}}});
 const service=api((body,url)=>{requests.push(body);return url.endsWith('/next')?{contents:{singleColumnMusicWatchNextResultsRenderer:{tabbedRenderer:{watchNextTabbedResultsRenderer:{tabs:[{tabRenderer:{title:'Related',endpoint:{browseEndpoint:{browseId:'MPTR_seed',params:'returned-params'}}}}]}}}}}:{contents:{singleColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{content:{sectionListRenderer:{contents:[{musicCarouselShelfRenderer:{contents:[row('seed'),row('next'),row('next'),{musicTwoRowItemRenderer:{title:{runs:[{text:'Album'}]},navigationEndpoint:endpoint('MPREb_album')}}]}}]}}}}]}}};});
 const tracks=await service.getRelatedTracks('seed');assert.equal(requests[1].params,'returned-params');assert.deepEqual(tracks.map(t=>t.id),['next']);assert.ok(tracks[0].thumbnail.includes('/next/'));
});

test('missing related tab falls back to the returned song radio',async()=>{
 const service=api(()=>({contents:{}}));service.getAutomix=async()=>[song('radio')];assert.deepEqual((await service.getRelatedTracks('seed')).map(t=>t.id),['radio']);
});

test('song album resolution only uses the requested song metadata, preserving the exact release id',async()=>{
 const service=api(()=>panel([{playlistPanelVideoRenderer:{videoId:'other',longBylineText:{runs:[albumRun('MPREb_Wrong')]}}},{playlistPanelVideoRenderer:{videoId:'seed',longBylineText:{runs:[{text:'Singer'},albumRun('MPREb_ExactCase')]}}}]));
 assert.deepEqual(await service.getTrackAlbum(song('seed')),{id:'MPREb_ExactCase',title:'Real Album'});
});

test('official video album lookup matches the same song and artist and never guesses a random artist album',async()=>{
 const service=api(()=>({contents:{}}));service.search=async()=>[{...song('audio','Singer'),title:'My Song',album:{id:'MPREb_Real',title:'Release'}},{...song('wrong','Other Artist'),title:'Other Song',album:{id:'MPREb_Wrong',title:'Wrong'}}];
 assert.equal((await service.getTrackAlbum({...song('video'),title:'My Song (Official Video)'})).id,'MPREb_Real');
 assert.equal(await service.getTrackAlbum({...song('missing'),title:'Other Song'}),null);
});

test('album tracks inherit their header artist and retain their release metadata when rows omit artist links',async()=>{
 const service=api(()=>({header:{musicDetailHeaderRenderer:{title:{runs:[{text:'Release'}]},subtitle:{runs:[{text:'Albüm'},{text:'Singer',navigationEndpoint:endpoint('UCsinger','MUSIC_PAGE_TYPE_ARTIST')}]}}},contents:{musicShelfRenderer:{contents:[{musicResponsiveListItemRenderer:{playlistItemData:{videoId:'audio'},flexColumns:[{musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:'Song'}]}}}]}}]}}}));
 const album=await service.getAlbum('Release','MPREb_Exact');assert.equal(album.tracks[0].artist,'Singer');assert.equal(album.tracks[0].album.id,'MPREb_Exact');
});

test('native listening counts actual progress and ignores seek jumps, pauses and buffering',()=>{
 const h=harness();const {ListeningTracker}=h.load('src/services/recommendations/ListeningTracker.ts');const events=[];const tracker=new ListeningTracker((event,track)=>events.push([event,track.id]));const track=song('a');
 tracker.update(track,0,120000,true,false,0);
 for(let i=1;i<=10;i++)tracker.update(track,i*1000,120000,true,false,i*1000);
 tracker.update(track,90000,120000,true,true,11000);
 for(let i=12;i<=22;i++)tracker.update(track,90000,120000,false,false,i*1000);
 assert.deepEqual(events,[['PLAY','a']]);
 for(let i=23;i<=43;i++)tracker.update(track,90000+(i-22)*1000,120000,true,false,i*1000);
 assert.equal(events.filter(([e])=>e==='LISTEN_30S').length,1);
 tracker.update(track,120000,120000,false,true,44000);assert.ok(!events.some(([e])=>e==='COMPLETE'));
});

test('a briefly skipped track receives a skip signal, while actual completion is scored once',()=>{
 const h=harness();const {ListeningTracker}=h.load('src/services/recommendations/ListeningTracker.ts');const events=[];const tracker=new ListeningTracker((event,track)=>events.push([event,track.id]));
 tracker.update(song('early'),0,120000,true,false,0);tracker.update(song('early'),1000,120000,true,false,1000);tracker.update(song('full'),0,40000,true,false,2000);
 for(let i=1;i<=40;i++)tracker.update(song('full'),i*1000,40000,i<40,false,2000+i*1000);
 tracker.update(song('next'),0,120000,true,false,43000);
 assert.ok(events.some(([e,id])=>e==='SKIP'&&id==='early'));assert.equal(events.filter(([e,id])=>e==='COMPLETE'&&id==='full').length,1);
});

test('listened artists lead discovery even when many unrelated artists are followed',async()=>{
 const queries=[];const h=harness({'../youtubeService':{YouTubeService:{search:async query=>{queries.push(query);return[];}}}});
 const taste=h.load('src/services/recommendations/tasteProfileService.ts').tasteProfileService;await taste.record('LISTEN_30S','Listened',undefined,'played');
 const rec=h.load('src/services/recommendations/recommendationService.ts').recommendationService;
 await rec.getDiscoveryFeed([], [song('played','Listened')],Array.from({length:10},(_,i)=>`Followed ${i}`),[]);
 assert.equal(queries[0],'Listened benzer şarkılar');
});

test('personalized shelves use listened song radios and omit duplicate recommendations across shelves',async()=>{
 const seeds=[];const h=harness({'../youtubeService':{YouTubeService:{getAutomix:async id=>{seeds.push(id);return[song('shared','Other'),song('new-'+id,'Another')];},search:async()=>[]}}});
 const service=h.load('src/services/recommendations/recommendationService.ts').recommendationService;const sections=await service.getPersonalizedSections([], [song('a','First'),song('b','Second')]);
 assert.deepEqual(seeds,['a','b']);assert.ok(sections[0].title.includes('First'));assert.equal(new Set(sections.flatMap(s=>s.items.map(t=>t.id))).size,3);
});
