import { NativeModules, DeviceEventEmitter } from 'react-native';
import { useMusicStore } from '../../store/musicStore';
import type { TrackItem } from '../youtubeService';

const { VoxenWidget } = NativeModules;

class WidgetService {
  private isInitialized = false;

  public init(): () => void {
    if (this.isInitialized) return () => {};
    this.isInitialized = true;

    const handleAction = (action: string) => {
      const { togglePlayPause, skipNext, skipPrevious, currentTrack, queue, history, playTrack } = useMusicStore.getState();
      if (!useMusicStore.getState().accountReady) return;
      if (!currentTrack) {
        const resumeQueue = queue.length ? queue : history;
        if (resumeQueue[0]) void playTrack(resumeQueue[0], resumeQueue);
        return;
      }

      switch (action) {
        case 'playPause':
          if (!currentTrack && queue.length > 0) {
            playTrack(queue[0]);
          } else {
            togglePlayPause();
          }
          break;
        case 'next':
          skipNext();
          break;
        case 'prev':
          skipPrevious();
          break;
      }
    };
    const subscription = DeviceEventEmitter.addListener('onWidgetAction', handleAction);
    const consume = async () => {
      if (!useMusicStore.getState().accountReady) return;
      const action = await VoxenWidget?.consumePendingAction?.();
      if (action && this.isInitialized) handleAction(action);
    };
    const stopStore = useMusicStore.subscribe((state, previous) => {
      if (state.accountReady && !previous.accountReady) void consume();
    });
    void consume();

    return () => {
      subscription.remove();
      stopStore();
      this.isInitialized = false;
    };
  }

  public update(track: TrackItem | null, isPlaying: boolean): void {
    if (!VoxenWidget?.updateWidget) return;

    try {
      const title = track?.title || 'voxen';
      const artist = track?.artist || track?.artistName || (track ? 'Bilinmeyen Sanatçı' : 'Müzik başlatın');
      const artwork = track?.thumbnail || track?.thumbnails?.large || track?.thumbnails?.medium || '';

      VoxenWidget.updateWidget(title, artist, artwork, isPlaying);
    } catch (e) {
      console.warn('Failed to update home screen widget:', e);
    }
  }
}

export const widgetService = new WidgetService();
