const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const React = require('react');
const originalLoad = Module._load;
Module._load = function(id, ...args) { return id === 'react' ? React : originalLoad.call(this, id, ...args); };
// Kept outside app dependencies; set REACT_TEST_RENDERER_PATH for a different local installation.
const renderer = require(process.env.REACT_TEST_RENDERER_PATH || path.join(os.tmpdir(), 'voxen-security-validation/node_modules/react-test-renderer'));
const { harness, pause } = require('./helpers/runtimeHarness.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act } = renderer;

class Value {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
  interpolate() { return 0; }
}
const host = name => function NativeHost(props) {
  if (name !== 'Text') {
    React.Children.forEach(props.children, child => {
      if (typeof child === 'string' || typeof child === 'number') throw new Error('Raw text outside Text: ' + child);
    });
  }
  return React.createElement(name, props, props.children);
};
const native = {
  useColorScheme: () => 'dark',
  View: host('View'), Text: host('Text'), TouchableOpacity: host('TouchableOpacity'),
  TouchableWithoutFeedback: host('TouchableWithoutFeedback'), TextInput: 'TextInput',
  Modal: props => props.visible ? React.createElement('Modal', props, props.children) : null,
  FlatList: props => React.createElement('FlatList', {},
    props.ListHeaderComponent ? React.createElement(props.ListHeaderComponent) : null,
    ...props.data.map((item, index) => React.createElement(React.Fragment, { key: index }, props.renderItem({ item, index })))),
  StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: 'android' }, NativeModules: {},
  Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
  Animated: { Value, View: host('View'), timing: () => ({ start: fn => fn?.() }) },
  Easing: { bezier: () => x => x }, Share: { share: async () => {} }, Alert: { alert() {} },
};
const base = {
  '../services/recommendations/recommendationService': { recommendationService: { getRelatedTracks: async () => [] } },
  'react-native': native,
  'expo-image': { Image: 'Image' },
  'expo-linear-gradient': { LinearGradient: host('View') },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
};
const track = id => ({ id, title: id, artist: 'Artist', thumbnail: '', duration: 180 });

test('playlist details open, play and close, and the queue ends stopped', async () => {
  const h = harness(base);
  const Component = h.load('src/components/PlaylistDetailModal.tsx').PlaylistDetailModal;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component)); });
  assert.equal(tree.toJSON(), null);
  await act(async () => {
    h.music.getState().openPlaylistDetail({ id: 'mix', title: 'Legacy Mix', tracks: [track('a'), null, track('b')], visibility: 'private' });
  });
  assert.equal(tree.root.findAllByType('Modal').length, 1);
  assert.equal(h.music.getState().activePlaylistDetail.name, 'Legacy Mix');
  assert.equal(h.music.getState().activePlaylistDetail.tracks.length, 2);
  await act(async () => { await h.music.getState().playTrack(track('a'), [track('a'), track('b')]); });
  await act(async () => { h.music.getState().skipNext(true); });
  assert.equal(h.music.getState().currentTrack.id, 'b');
  await act(async () => { h.music.getState().skipNext(true); });
  assert.equal(h.music.getState().isPlaying, false);
  assert.equal(h.music.getState().isLoadingStream, false);
  assert.equal(h.music.getState().isBuffering, false);
  await act(async () => { h.music.getState().closePlaylistDetail(); });
  assert.equal(tree.toJSON(), null);
  await act(async () => tree.unmount());
});

test('first seek uses the release coordinate and actual slider width', async () => {
  const h = harness(base);
  const Component = h.load('src/components/PlayerProgressBar.tsx').PlayerProgressBar;
  let target;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component, { positionMs: 0, durationMs: 200000, onSeek: value => { target = value; } })); });
  const slider = tree.root.findAllByType('View').find(v => v.props.onResponderRelease);
  await act(async () => {
    slider.props.onLayout({ nativeEvent: { layout: { width: 400 } } });
    slider.props.onResponderGrant({ nativeEvent: { locationX: 80 } });
    slider.props.onResponderRelease({ nativeEvent: { locationX: 300 } });
  });
  assert.equal(target, 150000);
  await act(async () => tree.unmount());
});

test('obsolete stream and end events cannot play or skip the replacement track', async () => {
  const players = [];
  const signals = [];
  const slow = pause();
  const overrides = {
    ...base,
    '../services/recommendations/tasteProfileService': { tasteProfileService: { record: async event => { signals.push(event); } } },
    '../services/youtubeService': { YouTubeService: { getAudioStreamUrl: async id => id === 'a' ? slow.promise : { uri: id } } },
    '../services/offlineDownloadService': { offlineDownloadService: { getLocalUri: async () => null } },
    '../services/audioCacheService': { audioCacheService: { get: () => null, set() {}, prefetchNext: async () => {} } },
    '../services/widget/widgetService': { widgetService: { update() {} } },
    'expo-audio': {
      setAudioModeAsync: async () => {},
      createAudioPlayer: () => {
        let listener;
        const player = { currentStatus: { isLoaded: true }, playing: false, source: null,
          addListener: (_, fn) => { listener = fn; return { remove() {} }; },
          emit: status => listener(status),
          pause() { this.playing = false; }, play() { this.playing = true; },
          replace(source) { this.source = source; }, seekTo: async () => {},
          setActiveForLockScreen() {}, clearLockScreenControls() {}, remove() { this.removed = true; },
        };
        players.push(player); return player;
      },
    },
  };
  const h = harness(overrides);
  const Component = h.load('src/components/AudioEngine.tsx').AudioEngine;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component)); });
  await act(async () => { await h.music.getState().playTrack(track('a'), [track('a'), track('b'), track('c')]); });
  const old = players[0];
  await act(async () => { await h.music.getState().playTrack(track('b'), [track('a'), track('b'), track('c')]); });
  slow.resolve({ uri: 'a' });
  await act(async () => {});
  assert.equal(old.playing, false);
  assert.equal(old.source, null);
  assert.equal(players[1].source.uri, 'b');
  await act(async () => { players[1].emit({ playing:true, isLoaded:true, currentTime:1, duration:180 }); });
  assert.deepEqual(signals, ['PLAY']);
  const realNow = Date.now;
  let clock = realNow();
  try {
    Date.now = () => clock;
    await act(async () => {
      for (let i = 0; i < 32; i++) {
        clock += 1000;
        players[1].emit({ playing:true, isLoaded:true, currentTime:i + 2, duration:180 });
      }
    });
  } finally { Date.now = realNow; }
  assert.deepEqual(signals, ['PLAY', 'LISTEN_30S']);
  await act(async () => { old.emit({ didJustFinish: true, duration: 180 }); });
  assert.equal(h.music.getState().currentTrack.id, 'b');
  await act(async () => { players[1].emit({ didJustFinish: true, duration: 180 }); });
  assert.equal(h.music.getState().currentTrack.id, 'c');
  assert.deepEqual(signals, ['PLAY', 'LISTEN_30S', 'COMPLETE']);
  await act(async () => { players[1].emit({ didJustFinish: true, duration: 180 }); });
  assert.equal(h.music.getState().currentTrack.id, 'c');
  await act(async () => { players[2].emit({ playing:true, isLoaded:true, currentTime:1, duration:180 }); });
  await act(async () => { await h.music.getState().playTrack(track('d'), [track('d')]); });
  assert.deepEqual(signals.slice(-2), ['PLAY', 'SKIP']);
  await act(async () => { players[3].emit({ didJustFinish: true, duration:180 }); });
  await act(async () => { players[2].emit({ didJustFinish: true, duration: 180 }); });
  assert.equal(h.music.getState().isPlaying, false);
  assert.equal(h.music.getState().isLoadingStream, false);
  await act(async () => tree.unmount());
});

test('native interruption updates the visible playing state', async () => {
  let listener;
  const player = {
    currentStatus: { isLoaded:true, playing:false }, volume:1,
    addListener: (_, fn) => { listener=fn; return { remove() {} }; },
    pause() { this.currentStatus.playing=false; },
    play() { this.currentStatus.playing=true; },
    replace() {}, seekTo:async()=>{}, setActiveForLockScreen(){}, clearLockScreenControls(){}, remove(){},
  };
  const h=harness({...base,
    'expo-audio':{setAudioModeAsync:async()=>{},createAudioPlayer:()=>player},
    '../services/youtubeService':{YouTubeService:{getAudioStreamUrl:async()=>({uri:'stream'})}},
    '../services/offlineDownloadService':{offlineDownloadService:{getLocalUri:async()=>null}},
    '../services/audioCacheService':{audioCacheService:{get:()=>null,set(){},prefetchNext:async()=>{}}},
    '../services/widget/widgetService':{widgetService:{update(){}}},
  });
  const Component=h.load('src/components/AudioEngine.tsx').AudioEngine;let tree;
  await act(async()=>{tree=renderer.create(React.createElement(Component));});
  await act(async()=>{await h.music.getState().playTrack(track('focus'),[track('focus')]);});
  player.currentStatus.playing=false;
  await act(async()=>listener({playing:false,isLoaded:true,isBuffering:false,didJustFinish:false,currentTime:1,duration:180}));
  await act(async()=>new Promise(resolve=>setTimeout(resolve,800)));
  assert.equal(h.music.getState().isPlaying,false);
  await act(async()=>tree.unmount());
});

test('starting a song does not reload the home feed', async () => {
  let loads=0;
  const h=harness({...base,
    'react-native':{...native,ScrollView:host('ScrollView'),RefreshControl:host('RefreshControl'),ActivityIndicator:'ActivityIndicator'},
    '../services/recommendations/recommendationService':{recommendationService:{getDiscoveryFeed:async()=>{loads++;return[];}}},
    '../services/recommendations/mixGenerator':{mixGenerator:{getDailyMixes:async()=>[]}},
    '../services/youtubeService':{YouTubeService:{getPodcasts:async()=>[]}},
  });
  const Component=h.load('src/views/HomeView.tsx').HomeView;let tree;
  await act(async()=>{tree=renderer.create(React.createElement(Component));});
  assert.equal(loads,1);
  await act(async()=>{await h.music.getState().playTrack(track('no-reload'),[track('no-reload')]);});
  assert.equal(loads,1);
  await act(async()=>tree.unmount());
});

test('download row remains completed after final progress callback', async () => {
  let listener;
  let entry = { trackId:'download', state:'idle', progress:0 };
  const service = {
    getDownloadEntry: () => entry,
    addProgressListener: fn => { listener = fn; return () => {}; },
    downloadTrack: async (_, callback) => {
      entry = { ...entry, state:'done', progress:100 };
      listener(entry.trackId, 100);
      callback(100);
    },
  };
  const h = harness({ ...base,
    'react-native': { ...native, ActivityIndicator:'ActivityIndicator' },
    '../services/offlineDownloadService': { offlineDownloadService:service },
  });
  const Component = h.load('src/components/DownloadProgressRow.tsx').DownloadProgressRow;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component, { track:track('download') })); });
  await act(async () => { await tree.root.findByType('TouchableOpacity').props.onPress(); });
  assert.equal(tree.root.findAllByType('ActivityIndicator').length, 0);
  assert.equal(tree.root.findByType('Icon').props.name, 'checkmark-circle');
  await act(async () => tree.unmount());
});


test('theme changes update rendered colors and fullscreen panels shrink before closing', async () => {
  const h=harness({...base, 'react-native':{...native, PanResponder:{create:handlers=>({panHandlers:handlers})}, Animated:{...native.Animated,spring:()=>({start(){}})}}});
  const Component=h.load('src/components/ListeningRoomModal.tsx').ListeningRoomModal;
  const ui=h.load('src/store/uiStore.ts').useUiStore;
  let tree;
  await act(async()=>{ui.getState().openModal('listeningRoom');tree=renderer.create(React.createElement(Component));});
  const header=()=>tree.root.findAllByType('View').find(v=>v.props.onPanResponderRelease);
  await act(async()=>header().props.onPanResponderRelease(null,{dy:-40}));
  await act(async()=>header().props.onPanResponderRelease(null,{dy:80}));
  assert.equal(ui.getState().activeModal,'listeningRoom');
  await act(async()=>h.load('src/store/settingsStore.ts').useSettingsStore.getState().updateSettings({theme:'light'}));
  const colors=h.load('src/utils/useTheme.ts');
  function Probe(){return React.createElement('Palette',{colors:colors.useThemeColors()});}
  let probe;
  await act(async()=>{probe=renderer.create(React.createElement(Probe));});
  assert.equal(probe.root.findByType('Palette').props.colors.background,'#F6F6F8');
  await act(async()=>h.load('src/store/settingsStore.ts').useSettingsStore.getState().updateSettings({theme:'amoled'}));
  assert.equal(probe.root.findByType('Palette').props.colors.background,'#000000');
  await act(async()=>header().props.onPanResponderRelease(null,{dy:80}));
  assert.equal(ui.getState().activeModal,null);
  await act(async()=>{tree.unmount();probe.unmount();});
});

test('a late search response cannot replace the newer query results',async()=>{
  const slow=pause();
  const h=harness({...base,
    'react-native':{...native,ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',ActivityIndicator:'ActivityIndicator',FlatList:'FlatList'},
    '../components/SkeletonCard':{SkeletonCard:()=>null},
    '../services/youtubeService':{YouTubeService:{getTopCharts:async()=>[],getSuggestions:async()=>[],search:async q=>q==='old'?slow.promise:[track('new')],searchArtists:async()=>[],searchAlbums:async()=>[]}},
  });
  const Component=h.load('src/views/SearchView.tsx').SearchView;let tree;
  await act(async()=>{tree=renderer.create(React.createElement(Component));});
  const input=()=>tree.root.findByType('TextInput');
  await act(async()=>input().props.onChangeText('old'));
  let pending;
  await act(async()=>{pending=input().props.onSubmitEditing();});
  await act(async()=>input().props.onChangeText('new'));
  await act(async()=>input().props.onSubmitEditing());
  slow.resolve([track('old')]);await act(async()=>pending);
  const data=tree.root.findAllByType('FlatList').flatMap(n=>n.props.data||[]);
  assert.ok(data.some(t=>t.id==='new'));assert.ok(!data.some(t=>t.id==='old'));
  await act(async()=>tree.unmount());
});

test('room follower applies host position, ignores local skip and stops when the room closes',async()=>{
  let changed;let unsubscribed=false;
  const h=harness({...base,'../services/social/listeningRoomService':{listeningRoomService:{watch:(_,callback)=>{changed=callback;return()=>{unsubscribed=true;};},publish:async()=>{throw new Error('Follower must not publish');}}}});
  await h.change('listener');
  const social=h.load('src/store/socialStore.ts').useSocialStore;
  social.setState({activeRoom:'ROOM01',roomHostUid:'host'});
  const Component=h.load('src/components/ListeningRoomEngine.tsx').ListeningRoomEngine;let tree;
  await act(async()=>{tree=renderer.create(React.createElement(Component));});
  await act(async()=>changed({hostUid:'host',track:track('host-song'),playing:true,position:45000}));
  assert.equal(h.music.getState().currentTrack.id,'host-song');
  assert.equal(h.music.getState().seekToTrigger,45000);
  await act(async()=>h.music.getState().skipNext());
  assert.equal(h.music.getState().currentTrack.id,'host-song');
  await act(async()=>changed({hostUid:'host',track:track('host-song'),playing:false,position:46000}));
  assert.equal(h.music.getState().isPlaying,false);
  await act(async()=>changed(null));
  assert.equal(social.getState().activeRoom,null);assert.equal(unsubscribed,true);
  await act(async()=>tree.unmount());
});


test('podcast channel changes discard late episode responses',async()=>{
  const slow=pause();
  const h=harness({...base,'react-native':{...native,FlatList:'FlatList',ActivityIndicator:'ActivityIndicator'},
    '../services/youtubeService':{YouTubeService:{getPodcastEpisodes:async id=>id==='old'?slow.promise:[{videoId:'new',title:'New'}],getPodcasts:async()=>[]}}});
  const ui=h.load('src/store/uiStore.ts').useUiStore;
  const Component=h.load('src/components/PodcastsModal.tsx').PodcastsModal;let tree;
  await act(async()=>{ui.getState().openPodcast({browseId:'old',title:'Old'});tree=renderer.create(React.createElement(Component));});
  await act(async()=>ui.getState().openPodcast({browseId:'new',title:'New'}));
  slow.resolve([{videoId:'old',title:'Old'}]);await act(async()=>{});
  assert.equal(tree.root.findByType('FlatList').props.data[0].videoId,'new');
  await act(async()=>tree.unmount());
});

test('profile changes discard late profile responses',async()=>{
  const slow=pause();
  const h=harness({...base,'react-native':{...native,ScrollView:'ScrollView',ActivityIndicator:'ActivityIndicator',PanResponder:{create:handlers=>({panHandlers:handlers})},Animated:{...native.Animated,spring:()=>({start(){}})}},
    '../services/firebase/firestoreService':{firestoreService:{getUser:async uid=>uid==='old'?slow.promise:{displayName:'New Person',username:'new',profileVisibility:'public',playlists:[]}}}});
  const ui=h.load('src/store/uiStore.ts').useUiStore;const Component=h.load('src/components/UserProfileModal.tsx').UserProfileModal;let tree;
  await act(async()=>{ui.getState().openUserProfile('old');tree=renderer.create(React.createElement(Component));});
  await act(async()=>ui.getState().openUserProfile('new'));
  slow.resolve({displayName:'Old Person',profileVisibility:'public',playlists:[]});await act(async()=>{});
  const rendered=JSON.stringify(tree.toJSON());assert.ok(rendered.includes('New Person'));assert.ok(!rendered.includes('Old Person'));
  await act(async()=>tree.unmount());
});
