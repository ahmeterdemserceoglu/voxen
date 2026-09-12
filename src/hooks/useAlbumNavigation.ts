import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { YouTubeService } from '../services/youtubeService';
import { useUiStore } from '../store/uiStore';
import { accountSession } from '../services/auth/accountStorage';
import type { Track } from '../models';

export function useAlbumNavigation(track: Track | null | undefined, beforeOpen: () => void) {
  const [loading, setLoading] = useState(false);
  const revision = useRef(0); const mounted = useRef(true); const currentId = useRef(track?.id); currentId.current = track?.id;
  const before = useRef(beforeOpen); before.current = beforeOpen;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; }; }, []);
  useEffect(() => { revision.current++; setLoading(false); }, [track?.id]);
  const open = async () => {
    if (!track || loading) return;
    const id = ++revision.current; const epoch = accountSession.generation; setLoading(true);
    const valid = () => mounted.current && id === revision.current && currentId.current === track.id && accountSession.isCurrent(epoch);
    try {
      const album = await YouTubeService.getTrackAlbum(track);
      if (!valid()) return;
      if (!album?.id) { Alert.alert('Albüm bulunamadı', 'Bu parça için bir albüm bağlantısı bulunamadı.'); return; }
      before.current(); useUiStore.getState().openAlbum(album.title, album.id);
    } catch { if (valid()) Alert.alert('Albüm yüklenemedi', 'Bağlantını kontrol edip tekrar deneyebilirsin.'); }
    finally { if (valid()) setLoading(false); }
  };
  return { open, loading };
}
