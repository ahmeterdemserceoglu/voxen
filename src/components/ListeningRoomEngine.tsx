import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSocialStore } from '../store/socialStore';
import { useMusicStore } from '../store/musicStore';
import { useSettingsStore } from '../store/settingsStore';
import { listeningRoomService } from '../services/social/listeningRoomService';

export function ListeningRoomEngine() {
  const code = useSocialStore(s => s.activeRoom);
  const uid = useAuthStore(s => s.user?.uid);
  useEffect(() => {
    if (!code || !uid) return;
    let disposed = false;
    let host = false;
    let writing = false;
    let dirty = true;
    const fail = (error: Error) => { if (!disposed) useSocialStore.setState({ roomError: error.message }); };
    const publish = async () => {
      if (!host || writing || disposed) return;
      writing = true;
      dirty = false;
      try { await listeningRoomService.publish(code, useMusicStore.getState()); }
      catch (error) { fail(error as Error); }
      finally { writing = false; if (dirty && !disposed) void publish(); }
    };
    const unsubscribe = listeningRoomService.watch(code, room => {
      if (disposed) return;
      if (!room) {
        if (!host) useMusicStore.getState().stopPlayback();
        useSocialStore.setState({ activeRoom: null, roomError: 'Oda kapatıldı.' });
        return;
      }
      const becameHost = !host && room.hostUid === uid;
      host = room.hostUid === uid;
      useSocialStore.setState({ roomHostUid: room.hostUid, roomError: null });
      if (host) { if (becameHost) void publish(); return; }
      const state = useMusicStore.getState();
      if (!room.track) { state.stopPlayback(); return; }
      if (room.track.explicit && !useSettingsStore.getState().explicitContent) {
        state.stopPlayback();
        useSocialStore.setState({ roomError: 'Bu parça içerik tercihiniz nedeniyle oynatılmıyor.' });
        return;
      }
      const changed = state.currentTrack?.id !== room.track.id;
      if (changed) void state.playTrack(room.track, [room.track], true);
      const elapsed = room.playing && room.updatedAt?.toMillis ? Math.max(0, Date.now() - room.updatedAt.toMillis()) : 0;
      const target = Math.max(0, room.position + elapsed);
      if (changed || Math.abs(useMusicStore.getState().position - target) > 1500) useMusicStore.getState().seekTo(target, true);
      useMusicStore.setState({ isPlaying: room.playing });
    }, fail);
    const stopStore = useMusicStore.subscribe((state, previous) => {
      if (state.playbackRevision !== previous.playbackRevision || state.seekRevision !== previous.seekRevision || state.isPlaying !== previous.isPlaying || state.currentTrack !== previous.currentTrack) {
        dirty = true;
        void publish();
      }
    });
    const timer = setInterval(() => { if (host && useMusicStore.getState().isPlaying) void publish(); }, 5000);
    return () => { disposed = true; unsubscribe(); stopStore(); clearInterval(timer); };
  }, [code, uid]);
  return null;
}
