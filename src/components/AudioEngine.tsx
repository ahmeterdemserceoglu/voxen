import React, { useEffect } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { setAudioModeAsync, createAudioPlayer, type AudioStatus } from 'expo-audio';
import { useMusicStore } from '../store/musicStore';
import { useSettingsStore } from '../store/settingsStore';
import { YouTubeService } from '../services/youtubeService';
import { offlineDownloadService } from '../services/offlineDownloadService';
import { audioCacheService } from '../services/audioCacheService';
import { widgetService } from '../services/widget/widgetService';
import type { Track } from '../models';
import { tasteProfileService } from '../services/recommendations/tasteProfileService';
import { accountSession } from '../services/auth/accountStorage';

// A track owns its native player. Late status events from a disposed source cannot update its successor.
const TrackPlayer: React.FC<{ track: Track; revision: number }> = ({ track, revision }) => {
  useEffect(() => {
    const player = createAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
    let disposed = false;
    let resolved = false;
    let finished = false;
    let seeking = false;
    let soughtRevision = -1;
    const epoch = accountSession.generation;
    let listenedMs = 0;
    let lastPlayingAt = 0;
    let recordedPlay = false;
    let recorded30s = false;
    const record = (event: 'PLAY' | 'LISTEN_30S' | 'COMPLETE' | 'SKIP') => {
      if (accountSession.isCurrent(epoch) && useSettingsStore.getState().historyEnabled) void tasteProfileService.record(event, track.artist || track.artistName, undefined, track.id);
    };
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const current = () => !disposed && useMusicStore.getState().playbackRevision === revision
      && useMusicStore.getState().currentTrack?.id === track.id;
    const clearWatchdog = () => { clearTimeout(watchdog); watchdog = undefined; };
    const fail = () => {
      if (!current()) return;
      clearWatchdog();
      audioCacheService.delete(track.id);
      player.pause();
      useMusicStore.setState({ isPlaying: false, isLoadingStream: false, isBuffering: false,
        streamError: 'Şarkı yüklenemedi. Lütfen tekrar deneyin.' });
    };
    const syncIntent = () => {
      if (!current()) { player.pause(); return; }
      if (!resolved) return;
      const state = useMusicStore.getState();
      if (!state.isPlaying || seeking || state.seekToTrigger !== null) lastPlayingAt = 0;
      if (state.seekToTrigger !== null && player.currentStatus.isLoaded && state.seekRevision !== soughtRevision) {
        const seekRevision = state.seekRevision;
        soughtRevision = seekRevision;
        seeking = true;
        finished = false;
        player.seekTo(state.seekToTrigger / 1000, 0, 0).then(() => {
          if (!current() || soughtRevision !== seekRevision) return;
          seeking = false;
          const latest = useMusicStore.getState();
          if (latest.seekRevision === seekRevision) useMusicStore.setState({ seekToTrigger: null });
          syncIntent();
        }).catch(() => { if (current() && soughtRevision === seekRevision) { seeking = false; fail(); } });
        return;
      }
      if (seeking) return;
      if (state.isPlaying && !state.streamError) player.play();
      else player.pause();
    };
    const statusSub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!current() || !resolved) return;
      const state = useMusicStore.getState();
      const now = Date.now();
      if (status.playing && !status.isBuffering && !seeking && state.seekToTrigger === null && state.isPlaying) {
          if (!recordedPlay) { recordedPlay = true; record('PLAY'); }
        if (lastPlayingAt) listenedMs += Math.min(1000, now - lastPlayingAt);
        lastPlayingAt = now;
        if (!recorded30s && listenedMs >= 30000) { recorded30s = true; record('LISTEN_30S'); }
      } else {
        // Keep the user's playback intent during transient focus/decoder interruptions.
        // expo-audio / Media3 can momentarily report playing=false for notifications,
        // route changes or short stalls. Turning isPlaying off here made playback stop
        // permanently after a sub-second interruption.
        lastPlayingAt = 0;
      }
      if (status.didJustFinish && !seeking && state.seekToTrigger === null && !finished) {
        finished = true;
        if (recordedPlay) record('COMPLETE');
        clearWatchdog();
        player.pause();
        useMusicStore.setState({ position: Math.round(status.duration * 1000), isBuffering: false, isLoadingStream: false });
        state.skipNext(true);
        return;
      }
      if (finished) return;
      if (status.error) { fail(); return; }
      if (status.isLoaded && state.seekToTrigger !== null) syncIntent();
      if (seeking || useMusicStore.getState().seekToTrigger !== null) return;
      const settings = useSettingsStore.getState();
      if (settings.crossfade && status.duration > 0) {
        const fade = Math.max(2, Math.min(8, settings.crossfadeDuration));
        const envelope = Math.min(1, status.currentTime / fade, (status.duration - status.currentTime) / fade);
        applyVolume();
        player.volume *= Math.max(0, envelope);
      }
      useMusicStore.setState({
        position: Number.isFinite(status.currentTime) ? Math.max(0, Math.round(status.currentTime * 1000)) : 0,
        duration: Number.isFinite(status.duration) ? Math.max(0, Math.round(status.duration * 1000)) : 0,
        isLoadingStream: !status.isLoaded && state.isPlaying,
        isBuffering: status.isBuffering && state.isPlaying,
      });
      if (status.isBuffering && state.isPlaying) {
        if (!watchdog) watchdog = setTimeout(fail, 15000);
      } else clearWatchdog();
    });
    const storeSub = useMusicStore.subscribe((state, previous) => {
      if (!current()) {
        if (!disposed && !finished && recordedPlay && listenedMs < 30000 && state.currentTrack?.id !== track.id) record('SKIP');
        disposed = true;
        clearWatchdog();
        player.pause();
        return;
      }
      if (state.isPlaying !== previous.isPlaying || state.seekRevision !== previous.seekRevision) syncIntent();
    });
    let loudnessDb: number | undefined;
    const applyVolume = () => {
      if (!current()) return;
      player.volume = useSettingsStore.getState().normalizeVolume && loudnessDb !== undefined
        ? Math.max(0.2, Math.min(1, Math.pow(10, -Math.max(0, loudnessDb) / 20))) : 1;
    };
    const settingsSub = useSettingsStore.subscribe(settings => {
      if (!settings.explicitContent && track.explicit && current()) useMusicStore.getState().stopPlayback();
      else applyVolume();
    });
    player.pause();
    useMusicStore.setState({ isLoadingStream: true, isBuffering: true, streamError: null });
    watchdog = setTimeout(fail, 20000);
    (async () => {
      const localUri = await offlineDownloadService.getLocalUri(track.id);
      if (!current()) return;
      const stream = localUri ? { uri: localUri } : audioCacheService.get(track.id)
        ?? await YouTubeService.getAudioStreamUrl(track.videoId || track.id);
      if (!current()) return;
      if (!localUri) audioCacheService.set(track.id, stream);
      loudnessDb = 'loudnessDb' in stream ? stream.loudnessDb : undefined;
      player.replace({ uri: stream.uri, headers: 'headers' in stream ? stream.headers : undefined });
      resolved = true;
      clearWatchdog();
      applyVolume();
      player.setActiveForLockScreen(true, {
        title: track.title, artist: track.artist || track.artistName,
        artworkUrl: track.thumbnail || track.thumbnails?.large,
      }, { showSeekForward: true, showSeekBackward: true });
      syncIntent();
      const state = useMusicStore.getState();
      const next = state.queue[state.queueIndex + 1];
      if (next) audioCacheService.prefetchNext(next.videoId || next.id).catch(() => {});
    })().catch(fail);
    return () => {
      disposed = true;
      clearWatchdog();
      statusSub.remove();
      storeSub();
      settingsSub();
      player.pause();
      player.clearLockScreenControls();
      player.remove();
    };
  }, [track.id, revision]);
  return null;
};

const AndroidNativeAudioEngine: React.FC = () => {
  useEffect(() => {
    const native = NativeModules.VoxenPlayback;
    if (!native) return;
    let disposed = false;
    let lastNativeTrackId: string | null = null;
    let applyingNativeState = false;
    let queueRevision = 0;
    let pendingTrackId: string | null = null;
    let statusRevision = 0;

    const applyState = (status: any) => {
      if (disposed || !status) return;
      if (pendingTrackId && status.trackId !== pendingTrackId) return;
      const store = useMusicStore.getState();
      const index = store.queue.findIndex(track => track.id === status.trackId);
      if (index < 0) return;
      pendingTrackId = null;
      const nativeTrack = store.queue[index];
      lastNativeTrackId = status.trackId || nativeTrack?.id || null;
      applyingNativeState = true;
      try { useMusicStore.setState({
        currentTrack: nativeTrack || store.currentTrack,
        queueIndex: nativeTrack ? index : store.queueIndex,
        isPlaying: !!status.wantsToPlay,
        position: Number(status.position || 0),
        duration: Number(status.duration || 0),
        isBuffering: !!status.isBuffering,
        isLoadingStream: !!status.isLoading,
        streamError: status.error || null,
      }); } finally { applyingNativeState = false; }
    };

    const emitter = new NativeEventEmitter(native);
    const eventSub = emitter.addListener('voxenPlaybackState', (status: any) => {
      statusRevision++;
      applyState(status);
    });
    const poll = setInterval(() => {
      const revision = statusRevision;
      const queue = queueRevision;
      native.getStatus?.().then((status: any) => {
        if (revision === statusRevision && queue === queueRevision) applyState(status);
      }).catch(() => {});
    }, 750);

    const syncQueue = async () => {
      const revision = ++queueRevision;
      const state = useMusicStore.getState();
      if (!state.currentTrack || !state.queue.length) return;
      if (lastNativeTrackId === state.currentTrack.id) return;
      pendingTrackId = state.currentTrack.id;
      const localUri = await offlineDownloadService.getLocalUri(state.currentTrack.id).catch(() => null);
      if (disposed || revision !== queueRevision) return;
      const latest = useMusicStore.getState();
      if (latest.currentTrack?.id !== state.currentTrack.id || latest.queue !== state.queue || latest.queueIndex !== state.queueIndex) return;
      const queueJson = JSON.stringify(state.queue.map(t => ({
        id: t.id,
        videoId: t.videoId || t.id,
        title: t.title,
        artist: t.artist || t.artistName || 'Unknown Artist',
        artwork: t.thumbnail || t.thumbnails?.large || t.thumbnails?.medium || '',
      })));
      native.setQueue(queueJson, state.queueIndex, latest.isPlaying, localUri || null);
    };

    native.getStatus?.().then((status: any) => {
      const queue = useMusicStore.getState().queue;
      if (status?.serviceAvailable && queue.some(track => track.id === status.trackId)) applyState(status);
      else void syncQueue();
    }).catch(() => { void syncQueue(); });
    const storeSub = useMusicStore.subscribe((state, prev) => {
      // Service reports are observations, not new playback commands.
      if (applyingNativeState) return;
      if (state.currentTrack?.id !== prev.currentTrack?.id || state.queue !== prev.queue || state.queueIndex !== prev.queueIndex) {
        lastNativeTrackId = null;
        void syncQueue();
        return;
      }
      if (state.isPlaying !== prev.isPlaying) state.isPlaying ? native.play() : native.pause();
      if (state.seekRevision !== prev.seekRevision && state.seekToTrigger !== null) {
        native.seek(state.seekToTrigger);
        useMusicStore.setState({ seekToTrigger: null });
      }
    });

    return () => {
      disposed = true;
      clearInterval(poll);
      eventSub.remove();
      storeSub();
    };
  }, []);
  return null;
};

export const AudioEngine: React.FC = () => {
  const { currentTrack, playbackRevision, isPlaying } = useMusicStore();
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
  }, []);
  useEffect(() => { widgetService.update(currentTrack, isPlaying); }, [currentTrack?.id, isPlaying]);
  if (Platform.OS === 'android' && NativeModules.VoxenPlayback) return <AndroidNativeAudioEngine />;
  return currentTrack ? <TrackPlayer key={playbackRevision} track={currentTrack} revision={playbackRevision} /> : null;
};
